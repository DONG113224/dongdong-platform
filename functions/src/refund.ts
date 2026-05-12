import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import axios from 'axios';
import { verifyAdmin, verifyAuth } from './utils/auth';
import { aesEncrypt, sha256Hash, createTradeInfo } from './utils/newebpay';
import { sendEmail, sendLineMessage } from './utils/notify';
import { escapeHtml } from './utils/sanitize';
import { cancelInvoice, isInvoiceCrossPeriod } from './invoice';
import {
  NEWEBPAY_MERCHANT_ID,
  NEWEBPAY_HASH_KEY,
  NEWEBPAY_HASH_IV,
  NEWEBPAY_API_URL,
} from './config';

const db = admin.firestore();

/**
 * 呼叫藍新退款 API（CreditCard/Close）
 * 藍新退款流程：先請款（CloseType=1），再退款（CloseType=2）
 * 但如果是「取消授權」而非退款，需要用不同 API
 */
/**
 * 呼叫藍新退款 API
 * 策略：先嘗試 Cancel（取消授權，適用未請款），失敗再用 Close（退款，適用已請款）
 * 統一使用 MerchantOrderNo + IndexType=1 查詢，避免 TradeNo 格式問題
 */
async function callNewebpayRefund(
  tradeNo: string,
  amount: number,
  merchantOrderNo?: string
): Promise<{ success: boolean; message: string }> {
  const merchantId = NEWEBPAY_MERCHANT_ID.value();
  const hashKey = NEWEBPAY_HASH_KEY.value();
  const hashIV = NEWEBPAY_HASH_IV.value();
  const apiUrl = NEWEBPAY_API_URL.value();
  const isProduction = apiUrl.includes('//core.newebpay.com');
  const baseUrl = isProduction
    ? 'https://core.newebpay.com'
    : 'https://ccore.newebpay.com';

  const timeStamp = Math.floor(Date.now() / 1000).toString();

  // 優先用 MerchantOrderNo (IndexType=1)，避免 TradeNo 格式問題
  const useOrderNo = !!merchantOrderNo;
  const indexKey = useOrderNo ? 'MerchantOrderNo' : 'TradeNo';
  const indexValue = useOrderNo ? merchantOrderNo : tradeNo;
  const indexType = useOrderNo ? 1 : 2;

  console.log(`[Refund] Processing refund: ${indexKey}=${indexValue}, Amt=${amount}`);

  // Step 1: 嘗試 Cancel（取消授權，適用於未請款交易）
  try {
    const cancelPostData = createTradeInfo({
      RespondType: 'JSON',
      Version: '1.0',
      MerchantID: merchantId,
      [indexKey]: indexValue,
      Amt: amount,
      TimeStamp: timeStamp,
      IndexType: indexType,
    });

    const cancelTradeInfo = aesEncrypt(cancelPostData, hashKey, hashIV);
    const cancelTradeSha = sha256Hash(`HashKey=${hashKey}&${cancelTradeInfo}&HashIV=${hashIV}`);

    const cancelParams = new URLSearchParams();
    cancelParams.append('MerchantID_', merchantId);
    cancelParams.append('PostData_', cancelTradeInfo);
    cancelParams.append('TradeSha', cancelTradeSha);

    console.log(`[Refund] Trying Cancel API (取消授權)...`);
    const cancelResponse = await axios.post(
      `${baseUrl}/API/CreditCard/Cancel`,
      cancelParams.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0',
        },
      }
    );

    console.log('[Refund] Cancel response:', JSON.stringify(cancelResponse.data));
    const cancelResult = cancelResponse.data;

    if (cancelResult.Status === 'SUCCESS') {
      return { success: true, message: '取消授權成功' };
    }

    console.log(`[Refund] Cancel failed: ${cancelResult.Status} - ${cancelResult.Message}`);

    // TRA10048: 已進入請款狀態，需要用 Close 退款
    // 其他錯誤也嘗試 Close
  } catch (err) {
    console.error('[Refund] Cancel API error:', err);
  }

  // Step 2: 嘗試 Close（退款，適用於已請款交易）
  try {
    const closePostData = createTradeInfo({
      RespondType: 'JSON',
      Version: '1.1',
      MerchantID: merchantId,
      [indexKey]: indexValue,
      Amt: amount,
      TimeStamp: timeStamp,
      IndexType: indexType,
      CloseType: 2,
    });

    const closeTradeInfo = aesEncrypt(closePostData, hashKey, hashIV);
    const closeTradeSha = sha256Hash(`HashKey=${hashKey}&${closeTradeInfo}&HashIV=${hashIV}`);

    const closeParams = new URLSearchParams();
    closeParams.append('MerchantID_', merchantId);
    closeParams.append('PostData_', closeTradeInfo);
    closeParams.append('TradeSha', closeTradeSha);

    console.log(`[Refund] Trying Close API (退款)...`);
    const closeResponse = await axios.post(
      `${baseUrl}/API/CreditCard/Close`,
      closeParams.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0',
        },
      }
    );

    console.log('[Refund] Close response:', JSON.stringify(closeResponse.data));
    const closeResult = closeResponse.data;

    if (closeResult.Status === 'SUCCESS') {
      return { success: true, message: '退款成功' };
    }

    // TRA10045: 正在退款中或退款失敗 — 先取消上次卡住的退款再重試
    if (closeResult.Status === 'TRA10045') {
      console.log('[Refund] TRA10045 detected, canceling stuck refund then retrying...');
      try {
        // 取消上次卡住的退款 (Cancel=1)
        const cancelStuckPostData = createTradeInfo({
          RespondType: 'JSON',
          Version: '1.1',
          MerchantID: merchantId,
          [indexKey]: indexValue,
          Amt: amount,
          TimeStamp: Math.floor(Date.now() / 1000).toString(),
          IndexType: indexType,
          CloseType: 2,
          Cancel: 1,
        });

        const cancelStuckTradeInfo = aesEncrypt(cancelStuckPostData, hashKey, hashIV);
        const cancelStuckTradeSha = sha256Hash(`HashKey=${hashKey}&${cancelStuckTradeInfo}&HashIV=${hashIV}`);

        const cancelStuckParams = new URLSearchParams();
        cancelStuckParams.append('MerchantID_', merchantId);
        cancelStuckParams.append('PostData_', cancelStuckTradeInfo);
        cancelStuckParams.append('TradeSha', cancelStuckTradeSha);

        const cancelStuckRes = await axios.post(
          `${baseUrl}/API/CreditCard/Close`,
          cancelStuckParams.toString(),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' } }
        );

        console.log('[Refund] Cancel stuck refund response:', JSON.stringify(cancelStuckRes.data));

        if (cancelStuckRes.data.Status === 'SUCCESS') {
          // 重新執行退款
          const retryPostData = createTradeInfo({
            RespondType: 'JSON',
            Version: '1.1',
            MerchantID: merchantId,
            [indexKey]: indexValue,
            Amt: amount,
            TimeStamp: Math.floor(Date.now() / 1000).toString(),
            IndexType: indexType,
            CloseType: 2,
          });

          const retryTradeInfo = aesEncrypt(retryPostData, hashKey, hashIV);
          const retryTradeSha = sha256Hash(`HashKey=${hashKey}&${retryTradeInfo}&HashIV=${hashIV}`);

          const retryParams = new URLSearchParams();
          retryParams.append('MerchantID_', merchantId);
          retryParams.append('PostData_', retryTradeInfo);
          retryParams.append('TradeSha', retryTradeSha);

          const retryRes = await axios.post(
            `${baseUrl}/API/CreditCard/Close`,
            retryParams.toString(),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' } }
          );

          console.log('[Refund] Retry refund response:', JSON.stringify(retryRes.data));

          if (retryRes.data.Status === 'SUCCESS') {
            return { success: true, message: '退款成功（已自動清除卡住的退款紀錄）' };
          }

          return {
            success: false,
            message: `藍新退款重試失敗：${retryRes.data.Message || '未知錯誤'}（${retryRes.data.Status}）`,
          };
        }
      } catch (retryErr) {
        console.error('[Refund] Cancel-and-retry error:', retryErr);
      }

      return {
        success: false,
        message: '該筆交易退款卡住，自動重試也失敗，請到藍新後台確認退款準備金是否足夠',
      };
    }

    return {
      success: false,
      message: `藍新退款失敗：${closeResult.Message || '未知錯誤'}（${closeResult.Status}）`,
    };
  } catch (err) {
    console.error('[Refund] Close API error:', err);
    return { success: false, message: '藍新退款 API 連線失敗' };
  }
}

// POST /api/refund (admin-only refund)
export const handleRefund = onRequest({ cors: true }, async (req, res) => {
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

  const orderRef = db.collection('orders').doc(orderId);
  const orderDoc = await orderRef.get();

  if (!orderDoc.exists) {
    res.status(404).json({ error: '訂單不存在' });
    return;
  }

  const orderData = orderDoc.data()!;

  if (orderData.status !== 'paid') {
    res.status(400).json({ error: '只能退款已付款訂單' });
    return;
  }

  // Credit card: call NewebPay refund API
  if (orderData.paymentMethod === 'credit_card' && orderData.newebpayTradeNo) {
    const refundResult = await callNewebpayRefund(orderData.newebpayTradeNo, orderData.amount, orderData.merchantOrderNo);
    if (!refundResult.success) {
      res.status(500).json({ error: refundResult.message });
      return;
    }
  }

  // Cancel invoice
  try {
    await cancelInvoice(orderId);
  } catch (err) {
    console.error('Cancel invoice error:', err);
  }

  // Update order status
  await orderRef.update({
    status: 'refunded',
    refundStatus: 'refunded',
    refundCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Remove course from user's purchasedCourses
  const userRef = db.collection('users').doc(orderData.userId);
  await userRef.update({
    purchasedCourses: admin.firestore.FieldValue.arrayRemove(orderData.courseId),
  });

  // Send refund notifications
  try {
    await sendEmail(
      orderData.userEmail,
      `退款通知 - ${orderData.courseTitle}`,
      `
        <h2>退款已處理</h2>
        <p>課程「${escapeHtml(orderData.courseTitle || '')}」已完成退款。</p>
        <p>退款金額：NT$ ${orderData.amount.toLocaleString()}</p>
      `,
      { userId: orderData.userId, orderId }
    );

    const userDoc = await userRef.get();
    const userData = userDoc.data();
    if (userData?.lineId) {
      await sendLineMessage(
        userData.lineId,
        `退款通知：「${orderData.courseTitle}」已退款 NT$ ${orderData.amount.toLocaleString()}`
      );
    }
  } catch (err) {
    console.error('Refund notification error:', err);
  }

  res.json({ success: true });
});

// POST /api/requestRefund (customer-facing refund request)
export const requestRefund = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const decoded = await verifyAuth(req, res);
  if (!decoded) return;

  const { orderId, bankName, branchName, accountNumber, accountName } = req.body as {
    orderId?: string;
    bankName?: string;
    branchName?: string;
    accountNumber?: string;
    accountName?: string;
  };

  if (!orderId) {
    res.status(400).json({ error: '缺少訂單 ID' });
    return;
  }

  const orderRef = db.collection('orders').doc(orderId);
  const orderDoc = await orderRef.get();

  if (!orderDoc.exists) {
    res.status(404).json({ error: '訂單不存在' });
    return;
  }

  const orderData = orderDoc.data()!;

  // Verify the order belongs to the requesting user
  if (orderData.userId !== decoded.uid) {
    res.status(403).json({ error: '無權操作此訂單' });
    return;
  }

  if (orderData.status !== 'paid') {
    res.status(400).json({ error: '只能退款已付款訂單' });
    return;
  }

  // Check refund deadline (7 days from paidAt)
  if (orderData.paidAt) {
    const paidDate = orderData.paidAt.toDate();
    const deadline = new Date(paidDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    if (new Date() > deadline) {
      res.status(400).json({ error: '已超過退費期限' });
      return;
    }
  }

  // Check if invoice is cross-period
  let requiresForm = false;
  const invoicesSnap = await db.collection('invoices')
    .where('orderId', '==', orderId)
    .where('status', '==', 'issued')
    .get();

  if (!invoicesSnap.empty) {
    const invoiceData = invoicesSnap.docs[0].data();
    if (invoiceData.issuedAt) {
      const invoiceDate = invoiceData.issuedAt.toDate();
      if (isInvoiceCrossPeriod(invoiceDate)) {
        requiresForm = true;
      }
    }
  }

  if (orderData.paymentMethod === 'credit_card') {
    if (requiresForm) {
      // Cross-period: save request, don't process yet
      await orderRef.update({
        refundStatus: 'refund_pending',
        requiresRefundForm: true,
        refundRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      res.json({ success: true, requiresForm: true });
      return;
    }

    // Same period credit card: process immediately
    if (orderData.newebpayTradeNo) {
      const refundResult = await callNewebpayRefund(orderData.newebpayTradeNo, orderData.amount, orderData.merchantOrderNo);
      if (!refundResult.success) {
        res.status(500).json({ error: refundResult.message });
        return;
      }
    }

    // Cancel invoice
    try {
      await cancelInvoice(orderId);
    } catch (err) {
      console.error('Cancel invoice error:', err);
    }

    // Update order status
    await orderRef.update({
      status: 'refunded',
      refundStatus: 'refunded',
      refundCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Remove course from user's purchasedCourses
    const userRef = db.collection('users').doc(orderData.userId);
    await userRef.update({
      purchasedCourses: admin.firestore.FieldValue.arrayRemove(orderData.courseId),
    });

    // Notifications
    try {
      await sendEmail(
        orderData.userEmail,
        `退款通知 - ${orderData.courseTitle}`,
        `
          <h2>退款已處理</h2>
          <p>課程「${orderData.courseTitle}」已完成退款。</p>
          <p>退款金額：NT$ ${orderData.amount.toLocaleString()}</p>
        `,
        { userId: orderData.userId, orderId }
      );

      const userDoc = await userRef.get();
      const userData = userDoc.data();
      if (userData?.lineId) {
        await sendLineMessage(
          userData.lineId,
          `退款通知：「${orderData.courseTitle}」已退款 NT$ ${orderData.amount.toLocaleString()}`
        );
      }
    } catch (err) {
      console.error('Refund notification error:', err);
    }

    res.json({ success: true });
  } else {
    // ATM order: save refund request with bank info
    if (!bankName || !branchName || !accountNumber || !accountName) {
      res.status(400).json({ error: '請填寫完整的銀行帳戶資訊' });
      return;
    }

    const updateData: Record<string, unknown> = {
      refundStatus: 'refund_pending',
      refundBankInfo: {
        bankName,
        branchName,
        accountNumber,
        accountName,
      },
      refundRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (requiresForm) {
      updateData.requiresRefundForm = true;
    }

    await orderRef.update(updateData);

    res.json({ success: true, requiresForm });
  }
});

// POST /api/completeRefund (admin marks ATM refund as complete)
export const completeRefund = onRequest({ cors: true }, async (req, res) => {
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

  const orderRef = db.collection('orders').doc(orderId);
  const orderDoc = await orderRef.get();

  if (!orderDoc.exists) {
    res.status(404).json({ error: '訂單不存在' });
    return;
  }

  const orderData = orderDoc.data()!;

  // Cancel invoice
  try {
    await cancelInvoice(orderId);
  } catch (err) {
    console.error('Cancel invoice error:', err);
  }

  // Update order status
  await orderRef.update({
    status: 'refunded',
    refundStatus: 'refunded',
    refundCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Remove course from user's purchasedCourses
  const userRef = db.collection('users').doc(orderData.userId);
  await userRef.update({
    purchasedCourses: admin.firestore.FieldValue.arrayRemove(orderData.courseId),
  });

  // Notifications
  try {
    await sendEmail(
      orderData.userEmail,
      `退款通知 - ${orderData.courseTitle}`,
      `
        <h2>退款已處理</h2>
        <p>課程「${escapeHtml(orderData.courseTitle || '')}」已完成退款。</p>
        <p>退款金額：NT$ ${orderData.amount.toLocaleString()}</p>
      `,
      { userId: orderData.userId, orderId }
    );

    const userDoc = await userRef.get();
    const userData = userDoc.data();
    if (userData?.lineId) {
      await sendLineMessage(
        userData.lineId,
        `退款通知：「${orderData.courseTitle}」已退款 NT$ ${orderData.amount.toLocaleString()}`
      );
    }
  } catch (err) {
    console.error('Refund notification error:', err);
  }

  res.json({ success: true });
});

// POST /api/uploadRefundForm (customer uploads signed refund form)
export const uploadRefundForm = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const decoded = await verifyAuth(req, res);
  if (!decoded) return;

  const { orderId, photoBase64 } = req.body as {
    orderId?: string;
    photoBase64?: string;
  };

  if (!orderId || !photoBase64) {
    res.status(400).json({ error: '缺少必要參數' });
    return;
  }

  // Check base64 size (roughly 1MB limit)
  const sizeInBytes = Buffer.byteLength(photoBase64, 'utf8');
  if (sizeInBytes > 1.5 * 1024 * 1024) {
    res.status(400).json({ error: '檔案大小不能超過 1MB' });
    return;
  }

  const orderRef = db.collection('orders').doc(orderId);
  const orderDoc = await orderRef.get();

  if (!orderDoc.exists) {
    res.status(404).json({ error: '訂單不存在' });
    return;
  }

  const orderData = orderDoc.data()!;
  if (orderData.userId !== decoded.uid) {
    res.status(403).json({ error: '無權操作此訂單' });
    return;
  }

  await orderRef.update({
    refundFormPhoto: photoBase64,
    refundFormUploadedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  res.json({ success: true });
});
