import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { ezpayAesEncrypt, createTradeInfo } from './utils/newebpay';
import {
  EZPAY_MERCHANT_ID,
  EZPAY_HASH_KEY,
  EZPAY_HASH_IV,
  EZPAY_INVOICE_URL,
} from './config';
import axios from 'axios';
import { verifyAdmin } from './utils/auth';
import { sendEmail } from './utils/notify';

const db = admin.firestore();

const EZPAY_INVOICE_INVALID_URL = 'https://cinv.ezpay.com.tw/Api/invoice_invalid';

interface InvoiceInfo {
  type: 'b2c_email' | 'b2c_carrier' | 'b2c_donate' | 'b2b';
  carrierNum?: string;
  loveCode?: string;
  companyName?: string;
  companyTaxId?: string;
}

/**
 * 開立電子發票（ezPay）
 * 付款成功後由 newebpayNotify 呼叫
 */
export async function issueInvoice(orderId: string) {
  const orderRef = db.collection('orders').doc(orderId);
  const orderDoc = await orderRef.get();

  if (!orderDoc.exists) throw new Error('Order not found');

  const order = orderDoc.data()!;
  const merchantId = EZPAY_MERCHANT_ID.value();
  const hashKey = EZPAY_HASH_KEY.value();
  const hashIV = EZPAY_HASH_IV.value();
  const invoiceUrl = EZPAY_INVOICE_URL.value();

  if (!merchantId || !hashKey || !hashIV) {
    console.log('ezPay invoice not configured, skipping');
    return null;
  }

  const invoiceInfo: InvoiceInfo = order.invoiceInfo || { type: 'b2c_email' };
  const isB2B = invoiceInfo.type === 'b2b';
  const totalAmt = Number(order.amount);

  // B2B: 未稅價 + 稅額；B2C: 含稅價
  const amt = Math.round(totalAmt / 1.05);
  const taxAmt = totalAmt - amt;

  const invoiceOrderNo = (order.merchantOrderNo || orderId).substring(0, 20);

  const postDataParams: Record<string, string | number> = {
    RespondType: 'JSON',
    Version: '1.5',
    TimeStamp: Math.floor(Date.now() / 1000),
    MerchantOrderNo: invoiceOrderNo,
    Status: '1', // 立即開立
    Category: isB2B ? 'B2B' : 'B2C',
    BuyerName: isB2B ? (invoiceInfo.companyName || '') : (order.userEmail || '消費者'),
    BuyerEmail: order.userEmail || '',
    TaxType: '1', // 應稅
    TaxRate: 5,
    Amt: amt,
    TaxAmt: taxAmt,
    TotalAmt: totalAmt,
    ItemName: order.courseTitle || '線上課程',
    ItemCount: '1',
    ItemUnit: '堂',
    ItemPrice: isB2B ? amt : totalAmt, // B2B 用未稅價，B2C 用含稅價
    ItemAmt: isB2B ? amt : totalAmt,
  };

  if (isB2B) {
    // 三聯式
    postDataParams.PrintFlag = 'Y';
    postDataParams.BuyerUBN = invoiceInfo.companyTaxId || '';
    postDataParams.BuyerName = invoiceInfo.companyName || '';
  } else if (invoiceInfo.type === 'b2c_carrier') {
    // 二聯 - 手機載具
    postDataParams.PrintFlag = 'N';
    postDataParams.CarrierType = '0';
    postDataParams.CarrierNum = invoiceInfo.carrierNum || '';
  } else if (invoiceInfo.type === 'b2c_donate') {
    // 二聯 - 捐贈
    postDataParams.PrintFlag = 'N';
    postDataParams.LoveCode = invoiceInfo.loveCode || '';
  } else {
    // 二聯 - Email
    postDataParams.PrintFlag = 'Y';
  }

  const postDataStr = createTradeInfo(postDataParams);
  const encryptedPostData = ezpayAesEncrypt(postDataStr, hashKey, hashIV);

  const response = await axios.post(
    invoiceUrl,
    new URLSearchParams({
      MerchantID_: merchantId,
      PostData_: encryptedPostData,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const result = response.data;
  console.log('ezPay invoice response:', JSON.stringify(result));

  if (result.Status === 'SUCCESS') {
    const invoiceResult = typeof result.Result === 'string'
      ? JSON.parse(result.Result)
      : result.Result;

    await db.collection('invoices').add({
      orderId,
      invoiceNumber: invoiceResult.InvoiceNumber || '',
      randomNum: invoiceResult.RandomNum || '',
      barCode: invoiceResult.BarCode || '',
      qrcodeL: invoiceResult.QRcodeL || '',
      qrcodeR: invoiceResult.QRcodeR || '',
      invoiceType: invoiceInfo.type,
      totalAmt: totalAmt,
      buyerEmail: order.userEmail || '',
      itemName: order.courseTitle || '線上課程',
      status: 'issued',
      issuedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await orderRef.update({
      invoiceNumber: invoiceResult.InvoiceNumber || '',
      invoiceRandomNum: invoiceResult.RandomNum || '',
    });

    return invoiceResult;
  } else {
    console.error('Invoice issue failed:', result.Status, result.Message);
    throw new Error(`Invoice failed: ${result.Message}`);
  }
}

/**
 * 作廢電子發票（ezPay）
 * 退款時呼叫
 */
export async function cancelInvoice(orderId: string): Promise<void> {
  // Query invoices collection for this orderId
  const invoicesSnap = await db.collection('invoices')
    .where('orderId', '==', orderId)
    .where('status', '==', 'issued')
    .get();

  if (invoicesSnap.empty) {
    console.log(`No issued invoice found for order ${orderId}, skipping cancel`);
    return;
  }

  const merchantId = EZPAY_MERCHANT_ID.value();
  const hashKey = EZPAY_HASH_KEY.value();
  const hashIV = EZPAY_HASH_IV.value();

  if (!merchantId || !hashKey || !hashIV) {
    console.log('ezPay invoice not configured, skipping cancel');
    return;
  }

  for (const invoiceDoc of invoicesSnap.docs) {
    const invoiceData = invoiceDoc.data();
    const invoiceNumber = invoiceData.invoiceNumber;

    if (!invoiceNumber) {
      console.log(`Invoice doc ${invoiceDoc.id} has no invoiceNumber, skipping`);
      continue;
    }

    const postDataParams: Record<string, string | number> = {
      RespondType: 'JSON',
      Version: '1.0',
      TimeStamp: Math.floor(Date.now() / 1000),
      InvoiceNumber: invoiceNumber,
      InvalidReason: '客戶退費',
    };

    const postDataStr = createTradeInfo(postDataParams);
    const encryptedPostData = ezpayAesEncrypt(postDataStr, hashKey, hashIV);

    try {
      const response = await axios.post(
        EZPAY_INVOICE_INVALID_URL,
        new URLSearchParams({
          MerchantID_: merchantId,
          PostData_: encryptedPostData,
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      const result = response.data;
      console.log('ezPay invoice cancel response:', JSON.stringify(result));

      if (result.Status === 'SUCCESS') {
        await invoiceDoc.ref.update({
          status: 'cancelled',
          cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`Invoice ${invoiceNumber} cancelled successfully`);
      } else {
        console.error(`Invoice cancel failed for ${invoiceNumber}:`, result.Status, result.Message);
      }
    } catch (err) {
      console.error(`Error cancelling invoice ${invoiceNumber}:`, err);
    }
  }
}

/**
 * 判斷發票是否跨期（台灣發票期別：1-2月、3-4月、5-6月、7-8月、9-10月、11-12月）
 */
export function isInvoiceCrossPeriod(invoiceDate: Date): boolean {
  const now = new Date();
  const invoicePeriod = Math.floor(invoiceDate.getMonth() / 2);
  const currentPeriod = Math.floor(now.getMonth() / 2);
  const invoiceYear = invoiceDate.getFullYear();
  const currentYear = now.getFullYear();
  return invoiceYear !== currentYear || invoicePeriod !== currentPeriod;
}

/**
 * 管理員補開發票
 */
export const adminIssueInvoice = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const decoded = await verifyAdmin(req, res);
  if (!decoded) return;

  const { orderId } = req.body;
  if (!orderId) {
    res.status(400).json({ error: '缺少訂單 ID' });
    return;
  }

  try {
    const result = await issueInvoice(orderId);
    res.json({ success: true, invoiceNumber: result?.InvoiceNumber || '' });
  } catch (err) {
    console.error('adminIssueInvoice error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * 管理員作廢發票
 */
export const adminCancelInvoice = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const decoded = await verifyAdmin(req, res);
  if (!decoded) return;

  const { orderId } = req.body;
  if (!orderId) {
    res.status(400).json({ error: '缺少訂單 ID' });
    return;
  }

  try {
    await cancelInvoice(orderId);
    res.json({ success: true });
  } catch (err) {
    console.error('adminCancelInvoice error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * 管理員重新發送發票通知
 */
export const adminResendInvoice = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const decoded = await verifyAdmin(req, res);
  if (!decoded) return;

  const { orderId } = req.body;
  if (!orderId) {
    res.status(400).json({ error: '缺少訂單 ID' });
    return;
  }

  try {
    const orderDoc = await db.collection('orders').doc(orderId).get();
    if (!orderDoc.exists) {
      res.status(404).json({ error: '訂單不存在' });
      return;
    }

    const order = orderDoc.data()!;

    const invoicesSnap = await db.collection('invoices')
      .where('orderId', '==', orderId)
      .where('status', '==', 'issued')
      .get();

    if (invoicesSnap.empty) {
      res.status(400).json({ error: '此訂單無已開立的發票' });
      return;
    }

    const invoiceData = invoicesSnap.docs[0].data();
    const invoiceNumber = invoiceData.invoiceNumber || '';
    const randomNum = invoiceData.randomNum || '';
    const totalAmt = invoiceData.totalAmt || order.amount;
    const issuedAt = invoiceData.issuedAt?.toDate?.() || new Date();
    const itemName = invoiceData.itemName || order.courseTitle || '線上課程';

    // 計算稅額
    const amt = Math.round(Number(totalAmt) / 1.05);
    const taxAmt = Number(totalAmt) - amt;

    // 發票期別
    const invoiceMonth = issuedAt.getMonth();
    const periodStart = invoiceMonth % 2 === 0 ? invoiceMonth + 1 : invoiceMonth;
    const periodEnd = periodStart + 1;
    const periodYear = issuedAt.getFullYear() - 1911; // 民國年
    const periodLabel = `${periodYear}年${String(periodStart).padStart(2, '0')}-${String(periodEnd).padStart(2, '0')}月`;

    const invoiceHtml = generateInvoiceEmailHtml({
      invoiceNumber,
      randomNum,
      periodLabel,
      issuedDate: `${issuedAt.getFullYear()}/${String(issuedAt.getMonth() + 1).padStart(2, '0')}/${String(issuedAt.getDate()).padStart(2, '0')}`,
      sellerName: '九十度工作室',
      sellerTaxId: '81190775',
      buyerEmail: order.userEmail || '',
      itemName,
      qty: 1,
      unitPrice: Number(totalAmt),
      amount: amt,
      taxAmount: taxAmt,
      totalAmount: Number(totalAmt),
    });

    await sendEmail(
      order.userEmail,
      `電子發票開立通知 ${invoiceNumber}`,
      invoiceHtml,
      { userId: order.userId, orderId }
    );

    res.json({ success: true });
  } catch (err) {
    console.error('adminResendInvoice error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * 產生正規電子發票 Email HTML
 */
interface InvoiceEmailData {
  invoiceNumber: string;
  randomNum: string;
  periodLabel: string;
  issuedDate: string;
  sellerName: string;
  sellerTaxId: string;
  buyerEmail: string;
  itemName: string;
  qty: number;
  unitPrice: number;
  amount: number;
  taxAmount: number;
  totalAmount: number;
}

function generateInvoiceEmailHtml(data: InvoiceEmailData): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: 'Noto Sans TC', 'Microsoft JhengHei', sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="border: 2px solid #333; padding: 0;">
    <!-- 發票標題 -->
    <div style="background: #f8f8f8; padding: 15px 20px; border-bottom: 2px solid #333; text-align: center;">
      <h1 style="margin: 0; font-size: 22px; letter-spacing: 2px;">電 子 發 票 證 明 聯</h1>
      <p style="margin: 5px 0 0; font-size: 14px; color: #666;">${data.periodLabel}</p>
    </div>

    <!-- 發票號碼 -->
    <div style="padding: 15px 20px; border-bottom: 1px solid #ddd; text-align: center;">
      <p style="margin: 0; font-size: 28px; font-weight: bold; letter-spacing: 3px; color: #d32f2f;">${data.invoiceNumber}</p>
      <p style="margin: 5px 0 0; font-size: 13px; color: #888;">隨機碼：${data.randomNum}</p>
    </div>

    <!-- 發票資訊 -->
    <div style="padding: 15px 20px; border-bottom: 1px solid #ddd;">
      <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
        <tr>
          <td style="padding: 4px 0; color: #888; width: 100px;">開立日期</td>
          <td style="padding: 4px 0;">${data.issuedDate}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #888;">賣方</td>
          <td style="padding: 4px 0;">${data.sellerName}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #888;">賣方統編</td>
          <td style="padding: 4px 0;">${data.sellerTaxId}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #888;">買方</td>
          <td style="padding: 4px 0;">${data.buyerEmail}</td>
        </tr>
      </table>
    </div>

    <!-- 明細 -->
    <div style="padding: 15px 20px; border-bottom: 1px solid #ddd;">
      <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 1px solid #ddd;">
            <th style="text-align: left; padding: 8px 4px; color: #888;">品名</th>
            <th style="text-align: center; padding: 8px 4px; color: #888;">數量</th>
            <th style="text-align: right; padding: 8px 4px; color: #888;">單價</th>
            <th style="text-align: right; padding: 8px 4px; color: #888;">金額</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 8px 4px;">${data.itemName}</td>
            <td style="text-align: center; padding: 8px 4px;">${data.qty}</td>
            <td style="text-align: right; padding: 8px 4px;">$${data.unitPrice.toLocaleString()}</td>
            <td style="text-align: right; padding: 8px 4px;">$${data.unitPrice.toLocaleString()}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 合計 -->
    <div style="padding: 15px 20px;">
      <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
        <tr>
          <td style="padding: 4px 0; color: #888;">銷售額（未稅）</td>
          <td style="padding: 4px 0; text-align: right;">$${data.amount.toLocaleString()}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #888;">稅額（5%）</td>
          <td style="padding: 4px 0; text-align: right;">$${data.taxAmount.toLocaleString()}</td>
        </tr>
        <tr style="border-top: 2px solid #333;">
          <td style="padding: 8px 0; font-size: 16px; font-weight: bold;">總計</td>
          <td style="padding: 8px 0; text-align: right; font-size: 18px; font-weight: bold; color: #d32f2f;">$${data.totalAmount.toLocaleString()}</td>
        </tr>
      </table>
    </div>
  </div>

  <!-- 備註 -->
  <div style="margin-top: 15px; padding: 15px; background: #f8f8f8; border-radius: 8px; font-size: 12px; color: #888;">
    <p style="margin: 0 0 5px;">本發票為電子發票，依據財政部「電子發票實施作業要點」開立。</p>
    <p style="margin: 0 0 5px;">如需查詢發票資訊，請至財政部電子發票整合服務平台：<a href="https://www.einvoice.nat.gov.tw" style="color: #1a73e8;">https://www.einvoice.nat.gov.tw</a></p>
    <p style="margin: 0;">如有任何問題，請聯繫客服。</p>
  </div>
</body>
</html>`;
}
