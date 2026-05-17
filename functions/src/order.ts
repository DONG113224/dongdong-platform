import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { verifyAuth, verifyAdmin } from './utils/auth';
import { aesEncrypt, aesDecrypt, sha256Hash, createTradeInfo } from './utils/newebpay';
import { sendEmail, sendLineMessageToUser } from './utils/notify';
import { escapeHtml } from './utils/sanitize';
import { issueInvoice } from './invoice';
import {
  NEWEBPAY_MERCHANT_ID,
  NEWEBPAY_HASH_KEY,
  NEWEBPAY_HASH_IV,
  NEWEBPAY_API_URL,
  FRONTEND_URL,
  LINE_MESSAGING_CHANNEL_SECRET,
} from './config';

const db = admin.firestore();

/**
 * 產生符合藍新規格的訂單編號
 * 只允許英數字和底線，最多 30 字元
 */
function generateMerchantOrderNo(): string {
  const now = new Date();
  const dateStr = now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0') +
    now.getHours().toString().padStart(2, '0') +
    now.getMinutes().toString().padStart(2, '0') +
    now.getSeconds().toString().padStart(2, '0');
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ORD${dateStr}${rand}`; // e.g. ORD20260317143052A1B2C3 (22 chars)
}

// POST /api/createOrder
export const createOrder = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const decoded = await verifyAuth(req, res);
  if (!decoded) return;

  const { courseId, paymentMethod, invoiceInfo, utmSource, utmMedium, utmCampaign } = req.body;

  if (!courseId || !paymentMethod) {
    res.status(400).json({ error: '缺少必要欄位' });
    return;
  }

  // 從 Firestore 查詢課程價格，不信任客戶端傳入的 amount
  const courseDoc = await db.collection('courses').doc(courseId).get();
  if (!courseDoc.exists) {
    res.status(404).json({ error: '課程不存在' });
    return;
  }
  const courseData = courseDoc.data()!;
  if (!courseData.isPublished) {
    res.status(400).json({ error: '此課程尚未發布' });
    return;
  }
  const fullPrice = courseData.price as number;
  const courseTitle = courseData.title as string || '';

  if (!fullPrice || fullPrice <= 0) {
    res.status(400).json({ error: '課程價格設定有誤' });
    return;
  }

  // ====== 升級折抵邏輯 ======
  // 找出用戶買過的「引流課」訂單，其 upgradeTo === 當前 courseId
  // 且在升級期限內，可折抵 upgradeDiscount
  let appliedDiscount = 0;
  let discountSource: { introOrderId: string; introCourseId: string; introCourseTitle: string } | null = null;

  try {
    const introQuery = await db.collection('orders')
      .where('userId', '==', decoded.uid)
      .where('status', '==', 'paid')
      .get();

    const candidates: Array<{ orderId: string; courseId: string; courseTitle: string; paidAt: Date; upgradeDiscount: number; upgradeWindowDays: number }> = [];

    for (const orderDoc of introQuery.docs) {
      const o = orderDoc.data();
      if (!o.courseId) continue;
      // 載入該訂單對應課程，看是否設定升級到當前 courseId
      const introCourseDoc = await db.collection('courses').doc(o.courseId).get();
      if (!introCourseDoc.exists) continue;
      const introCourseData = introCourseDoc.data()!;
      if (introCourseData.upgradeTo !== courseId) continue;
      if (!introCourseData.upgradeDiscount || introCourseData.upgradeDiscount <= 0) continue;

      const paidAt = o.paidAt?.toDate ? o.paidAt.toDate() : new Date(o.paidAt);
      const windowDays = introCourseData.upgradeWindowDays ?? 7;
      if (windowDays > 0) {
        const expireAt = new Date(paidAt.getTime() + windowDays * 24 * 60 * 60 * 1000);
        if (new Date() > expireAt) continue; // 過期
      }

      candidates.push({
        orderId: orderDoc.id,
        courseId: o.courseId,
        courseTitle: introCourseData.title || '',
        paidAt,
        upgradeDiscount: introCourseData.upgradeDiscount,
        upgradeWindowDays: windowDays,
      });
    }

    if (candidates.length > 0) {
      // 取折抵金額最大的一筆
      candidates.sort((a, b) => b.upgradeDiscount - a.upgradeDiscount);
      const best = candidates[0];
      appliedDiscount = best.upgradeDiscount;
      discountSource = {
        introOrderId: best.orderId,
        introCourseId: best.courseId,
        introCourseTitle: best.courseTitle,
      };
    }
  } catch (err) {
    console.error('Upgrade discount check failed:', err);
    // 折抵失敗不擋訂單，按原價走
  }

  const amount = Math.max(0, fullPrice - appliedDiscount);

  // 檢查用戶是否退費過此課程
  const refundedSnap = await db.collection('orders')
    .where('userId', '==', decoded.uid)
    .where('courseId', '==', courseId)
    .where('status', '==', 'refunded')
    .limit(1)
    .get();

  const hasRefunded = !refundedSnap.empty;
  const { acceptNoRefund } = req.body;

  if (hasRefunded && !acceptNoRefund) {
    res.json({ requiresNoRefundConfirm: true });
    return;
  }

  const merchantOrderNo = generateMerchantOrderNo();
  const orderRef = db.collection('orders').doc();
  const orderId = orderRef.id;

  // 從 Firestore 取得用戶資料，驗證必填欄位
  const userDoc = await db.collection('users').doc(decoded.uid).get();
  const userData = userDoc.data();
  const userEmail = userData?.email || decoded.email || '';
  const displayName = userData?.displayName || '';
  const userPhone = userData?.phone || '';

  if (!displayName || !userEmail || !userPhone) {
    res.status(400).json({ error: '請先完成個人資料填寫（姓名、電話、Email）' });
    return;
  }

  const orderData: Record<string, unknown> = {
    id: orderId,
    merchantOrderNo,
    userId: decoded.uid,
    userEmail,
    courseId,
    courseTitle: courseTitle || '',
    amount: Number(amount),
    fullPrice: Number(fullPrice),
    appliedDiscount: Number(appliedDiscount),
    discountSource,
    status: 'pending',
    paymentMethod,
    newebpayTradeNo: '',
    virtualAccount: null,
    paidAt: null,
    reminderSentDays: [],
    invoiceInfo: invoiceInfo || { type: 'b2c_email' },
    utmSource: utmSource || '',
    utmMedium: utmMedium || '',
    utmCampaign: utmCampaign || '',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    // 退費重購：自動放棄退費權益
    ...(hasRefunded && {
      refundWaived: true,
      refundWaivedAt: admin.firestore.FieldValue.serverTimestamp(),
      refundWaivedReason: `經 ${displayName} 同意，放棄退費權益`,
    }),
  };

  await orderRef.set(orderData);

  // Build NewebPay trade info
  const merchantId = NEWEBPAY_MERCHANT_ID.value();
  const hashKey = NEWEBPAY_HASH_KEY.value();
  const hashIV = NEWEBPAY_HASH_IV.value();
  const frontendUrl = FRONTEND_URL.value();
  const timeStamp = Math.floor(Date.now() / 1000).toString();

  // 取課程名稱前 50 字元（藍新 ItemDesc 限制）
  const itemDesc = (courseTitle || '線上課程').substring(0, 50);

  const tradeInfoParams: Record<string, string | number> = {
    MerchantID: merchantId,
    RespondType: 'JSON',
    TimeStamp: timeStamp,
    Version: '2.3',
    MerchantOrderNo: merchantOrderNo,
    Amt: Number(amount),
    ItemDesc: itemDesc,
    Email: userEmail,
    NotifyURL: `${frontendUrl}/api/newebpayNotify`,
    ReturnURL: `${frontendUrl}/order-result?orderId=${orderId}`,
    ClientBackURL: `${frontendUrl}/member?tab=orders`,
  };

  if (paymentMethod === 'credit_card') {
    tradeInfoParams.CREDIT = 1;
  } else {
    tradeInfoParams.VACC = 1;
    // ATM 取號後回傳帳號資訊的頁面
    tradeInfoParams.CustomerURL = `${frontendUrl}/api/atmCallback`;
    // ATM 有效期限：3 天後
    const expDate = new Date();
    expDate.setDate(expDate.getDate() + 3);
    const expStr = expDate.getFullYear().toString() +
      (expDate.getMonth() + 1).toString().padStart(2, '0') +
      expDate.getDate().toString().padStart(2, '0');
    tradeInfoParams.ExpireDate = expStr;
  }

  const tradeInfoStr = createTradeInfo(tradeInfoParams);
  const tradeInfo = aesEncrypt(tradeInfoStr, hashKey, hashIV);
  const tradeSha = sha256Hash(`HashKey=${hashKey}&${tradeInfo}&HashIV=${hashIV}`);

  const apiUrl = NEWEBPAY_API_URL.value();

  // 發送訂單建立通知（不阻塞回應）
  (async () => {
    try {
      const userDoc = await db.collection('users').doc(decoded.uid).get();
      const userData = userDoc.data();
      const userLineId = userData?.lineId || '';

      let paymentInfo = '';
      let paymentInfoHtml = '';
      if (paymentMethod === 'credit_card') {
        paymentInfo = `付款方式：信用卡\n付款連結：${apiUrl}`;
        paymentInfoHtml = `<p>付款方式：信用卡</p><p>付款連結：<a href="${frontendUrl}/order-result?orderId=${orderId}">${frontendUrl}/order-result?orderId=${orderId}</a></p>`;
      } else {
        paymentInfo = `付款方式：ATM轉帳\n轉帳資訊將於藍新回傳後提供`;
        paymentInfoHtml = `<p>付款方式：ATM轉帳</p><p>轉帳資訊將於藍新回傳後提供</p>`;
      }

      const lineAtUrl = process.env.VITE_LINE_AT_URL || '';
      const lineGuide = lineAtUrl ? `\n加入 LINE@ 好友並傳送任意訊息，即可開啟即時訂單通知功能\nLINE@：${lineAtUrl}` : '';
      const lineGuideHtml = lineAtUrl ? `<hr/><p>加入 LINE@ 好友並傳送任意訊息，即可開啟即時訂單通知功能</p><p><a href="${lineAtUrl}">點此加入 LINE@ 好友</a></p>` : '';

      const textContent = `感謝您的報名！\n您的訂單編號為：${merchantOrderNo}\n訂單頁面：${frontendUrl}/order-result?orderId=${orderId}\n\n${paymentInfo}\n\n完款後會給您上課使用說明\n\n請在72小時內完款\n逾時會自動取消訂單${lineGuide}`;

      const htmlContent = `
        <p>感謝您的報名！</p>
        <p>您的訂單編號為：${merchantOrderNo}</p>
        <p>訂單頁面：<a href="${frontendUrl}/order-result?orderId=${orderId}">${frontendUrl}/order-result?orderId=${orderId}</a></p>
        ${paymentInfoHtml}
        <p>完款後會給您上課使用說明</p>
        <p>請在72小時內完款</p>
        <p>逾時會自動取消訂單</p>
        ${lineGuideHtml}
      `;

      await sendEmail(
        userEmail,
        '感謝報名 - 訂單已建立',
        htmlContent,
        { userId: decoded.uid, orderId }
      );

      await sendLineMessageToUser(decoded.uid, textContent, orderId);
    } catch (err) {
      console.error('Order creation notification error:', err);
    }
  })();

  // 回傳表單資料，前端用 form POST 方式提交到藍新
  res.json({
    paymentUrl: apiUrl,
    formData: {
      MerchantID: merchantId,
      TradeInfo: tradeInfo,
      TradeSha: tradeSha,
      Version: '2.3',
    },
    orderId,
  });
});

// POST /api/newebpayNotify — 藍新付款完成 Webhook
export const newebpayNotify = onRequest({ cors: false }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  const { TradeInfo, TradeSha } = req.body;
  const hashKey = NEWEBPAY_HASH_KEY.value();
  const hashIV = NEWEBPAY_HASH_IV.value();

  // 驗證 SHA256 簽章
  const checkSha = sha256Hash(`HashKey=${hashKey}&${TradeInfo}&HashIV=${hashIV}`);
  if (checkSha !== TradeSha) {
    console.error('SHA256 verification failed');
    res.status(400).send('Invalid signature');
    return;
  }

  // 解密交易資料
  const decrypted = aesDecrypt(TradeInfo, hashKey, hashIV);
  const tradeData = JSON.parse(decrypted);

  const { Status, Result } = tradeData;
  console.log('NewebPay notify received:', JSON.stringify({ Status, Message: tradeData.Message, PaymentType: Result?.PaymentType }));

  if (Status !== 'SUCCESS') {
    console.log('Payment not successful:', Status, tradeData.Message);
    res.status(200).send('OK');
    return;
  }

  const merchantOrderNo = Result.MerchantOrderNo;
  const merchantId = NEWEBPAY_MERCHANT_ID.value();

  // CheckCode 驗證（防資料竄改）
  if (Result.CheckCode) {
    const checkCodeStr = `HashIV=${hashIV}&Amt=${Result.Amt}&MerchantID=${merchantId}&MerchantOrderNo=${merchantOrderNo}&TradeNo=${Result.TradeNo}&HashKey=${hashKey}`;
    const expectedCheckCode = sha256Hash(checkCodeStr);
    if (expectedCheckCode !== Result.CheckCode) {
      console.error('CheckCode verification failed');
      res.status(400).send('Invalid CheckCode');
      return;
    }
  }

  // 用 merchantOrderNo 找訂單
  const ordersSnapshot = await db.collection('orders')
    .where('merchantOrderNo', '==', merchantOrderNo)
    .limit(1)
    .get();

  if (ordersSnapshot.empty) {
    console.error('Order not found for merchantOrderNo:', merchantOrderNo);
    res.status(404).send('Order not found');
    return;
  }

  const orderDoc = ordersSnapshot.docs[0];
  const orderData = orderDoc.data();

  // ATM 取號通知（PaymentType=VACC 且有 BankCode/CodeNo 但沒有 PayBankCode）
  // 這是取號成功，不是付款成功
  if (Result.PaymentType === 'VACC' && Result.BankCode && Result.CodeNo && !Result.PayBankCode) {
    console.log('ATM account created:', Result.BankCode, Result.CodeNo);
    await orderDoc.ref.update({
      virtualAccount: `(${Result.BankCode}) ${Result.CodeNo}`,
      newebpayTradeNo: Result.TradeNo || '',
    });
    res.status(200).send('OK');
    return;
  }

  if (orderData.status === 'paid') {
    res.status(200).send('Already processed');
    return;
  }

  // 更新訂單狀態為已付款
  const updateData: Record<string, unknown> = {
    status: 'paid',
    newebpayTradeNo: Result.TradeNo || '',
    paymentType: Result.PaymentType || '',
    // ATM 付款人資訊（智慧ATM 2.0）
    ...(Result.PayBankCode && { payBankCode: Result.PayBankCode }),
    ...(Result.PayerAccount5Code && { payerAccount5Code: Result.PayerAccount5Code }),
    paidAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  // ATM 實際付款時的轉帳資訊
  if (Result.PayBankCode) {
    updateData.virtualAccount = `(${Result.PayBankCode}) ${Result.PayerAccount5Code || ''}`;
  }

  await orderDoc.ref.update(updateData);

  // 將課程加入用戶已購買清單
  const userRef = db.collection('users').doc(orderData.userId);
  await userRef.update({
    purchasedCourses: admin.firestore.FieldValue.arrayUnion(orderData.courseId),
  });

  // 開立電子發票（暫停自動開立，等正式環境切換後再啟用）
  // try {
  //   await issueInvoice(orderDoc.id);
  //   console.log('Invoice issued for order:', orderDoc.id);
  // } catch (err) {
  //   console.error('Invoice issue error:', err);
  // }

  // 發送付款成功通知
  try {
    const frontendUrl = FRONTEND_URL.value();
    const userDoc = await userRef.get();
    const userData = userDoc.data();
    const displayName = userData?.displayName || '';
    const courseUrl = `${frontendUrl}/course/${orderData.courseId}`;

    const emailHtml = `
      <p>${escapeHtml(displayName)} 您好，已經收到您的款項</p>
      <p>已經可以開始上課囉^^</p>
      <p>上課連結：<a href="${courseUrl}">${courseUrl}</a></p>
    `;

    const lineText = `${displayName} 您好，已經收到您的款項\n\n已經可以開始上課囉^^\n\n上課連結：${courseUrl}`;

    await sendEmail(
      orderData.userEmail,
      `付款成功 - ${orderData.courseTitle}`,
      emailHtml,
      { userId: orderData.userId, orderId: orderDoc.id }
    );

    await sendLineMessageToUser(orderData.userId, lineText, orderDoc.id);
  } catch (err) {
    console.error('Notification error:', err);
  }

  res.status(200).send('OK');
});

// POST /api/cancelOrder — 客戶自行取消未付款訂單
export const cancelOrder = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const decoded = await verifyAuth(req, res);
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

  // 只能取消自己的訂單
  if (orderData.userId !== decoded.uid) {
    res.status(403).json({ error: '無權限' });
    return;
  }

  // 只能取消待付款的訂單
  if (orderData.status !== 'pending') {
    res.status(400).json({ error: '只能取消待付款訂單' });
    return;
  }

  await orderRef.update({ status: 'cancelled' });

  res.json({ success: true });
});

// POST /api/retryPayment — 用既有訂單重新產生付款表單
export const retryPayment = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const decoded = await verifyAuth(req, res);
  if (!decoded) return;

  const { orderId, newPaymentMethod } = req.body;
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

  if (orderData.userId !== decoded.uid) {
    res.status(403).json({ error: '無權限' });
    return;
  }

  if (orderData.status !== 'pending') {
    res.status(400).json({ error: '只能重新付款待付款訂單' });
    return;
  }

  // 產生新的訂單編號（藍新不允許重複）
  const paymentMethod = newPaymentMethod || orderData.paymentMethod;
  const newMerchantOrderNo = generateMerchantOrderNo();

  // 更新訂單：新編號 + 可能的新付款方式 + 清除舊的虛擬帳號
  const updateFields: Record<string, unknown> = {
    merchantOrderNo: newMerchantOrderNo,
    virtualAccount: null,
  };
  if (newPaymentMethod && newPaymentMethod !== orderData.paymentMethod) {
    updateFields.paymentMethod = newPaymentMethod;
  }
  await orderRef.update(updateFields);

  const merchantId = NEWEBPAY_MERCHANT_ID.value();
  const hashKey = NEWEBPAY_HASH_KEY.value();
  const hashIV = NEWEBPAY_HASH_IV.value();
  const frontendUrl = FRONTEND_URL.value();
  const apiUrl = NEWEBPAY_API_URL.value();
  const timeStamp = Math.floor(Date.now() / 1000).toString();
  const merchantOrderNo = newMerchantOrderNo;
  const itemDesc = (orderData.courseTitle || '線上課程').substring(0, 50);

  const tradeInfoParams: Record<string, string | number> = {
    MerchantID: merchantId,
    RespondType: 'JSON',
    TimeStamp: timeStamp,
    Version: '2.3',
    MerchantOrderNo: merchantOrderNo,
    Amt: Number(orderData.amount),
    ItemDesc: itemDesc,
    Email: decoded.email || orderData.userEmail || '',
    NotifyURL: `${frontendUrl}/api/newebpayNotify`,
    ReturnURL: `${frontendUrl}/order-result?orderId=${orderId}`,
    ClientBackURL: `${frontendUrl}/member?tab=orders`,
  };

  if (paymentMethod === 'credit_card') {
    tradeInfoParams.CREDIT = 1;
  } else {
    tradeInfoParams.VACC = 1;
    tradeInfoParams.CustomerURL = `${frontendUrl}/api/atmCallback`;
    const expDate = new Date();
    expDate.setDate(expDate.getDate() + 3);
    const expStr = expDate.getFullYear().toString() +
      (expDate.getMonth() + 1).toString().padStart(2, '0') +
      expDate.getDate().toString().padStart(2, '0');
    tradeInfoParams.ExpireDate = expStr;
  }

  const tradeInfoStr = createTradeInfo(tradeInfoParams);
  const tradeInfo = aesEncrypt(tradeInfoStr, hashKey, hashIV);
  const tradeSha = sha256Hash(`HashKey=${hashKey}&${tradeInfo}&HashIV=${hashIV}`);

  res.json({
    paymentUrl: apiUrl,
    formData: {
      MerchantID: merchantId,
      TradeInfo: tradeInfo,
      TradeSha: tradeSha,
      Version: '2.3',
    },
    orderId,
  });
});

// POST /api/atmCallback — 藍新 ATM 取號後的 CustomerURL 回傳
export const atmCallback = onRequest({ cors: false }, async (req, res) => {
  const frontendUrl = FRONTEND_URL.value();

  if (req.method !== 'POST') {
    res.redirect(`${frontendUrl}/member?tab=orders`);
    return;
  }

  // 從 rawBody 重新解析，避免 body parser 截斷
  let TradeInfo = req.body.TradeInfo;
  let TradeSha = req.body.TradeSha;

  // 如果 body parser 截斷了，從 rawBody 重新解析
  if (req.rawBody) {
    const params = new URLSearchParams(req.rawBody.toString());
    TradeInfo = params.get('TradeInfo') || TradeInfo;
    TradeSha = params.get('TradeSha') || TradeSha;
  }

  console.log('ATM callback TradeInfo length:', TradeInfo?.length, 'aligned:', TradeInfo ? (TradeInfo.length / 2) % 16 === 0 : false);
  console.log('ATM callback TradeInfo:', TradeInfo);
  console.log('ATM callback TradeSha:', TradeSha);

  if (!TradeInfo || !TradeSha) {
    console.error('ATM callback missing TradeInfo or TradeSha');
    res.redirect(`${frontendUrl}/member?tab=orders`);
    return;
  }

  const hashKey = NEWEBPAY_HASH_KEY.value();
  const hashIV = NEWEBPAY_HASH_IV.value();

  try {
    const decrypted = aesDecrypt(TradeInfo, hashKey, hashIV);
    const tradeData = JSON.parse(decrypted);
    const { Result } = tradeData;

    console.log('ATM callback:', JSON.stringify({ Status: tradeData.Status, BankCode: Result?.BankCode, CodeNo: Result?.CodeNo }));

    const merchantOrderNo = Result.MerchantOrderNo;

    const ordersSnapshot = await db.collection('orders')
      .where('merchantOrderNo', '==', merchantOrderNo)
      .limit(1)
      .get();

    if (!ordersSnapshot.empty) {
      const orderDoc = ordersSnapshot.docs[0];

      if (Result.BankCode && Result.CodeNo) {
        await orderDoc.ref.update({
          virtualAccount: `(${Result.BankCode}) ${Result.CodeNo}`,
          newebpayTradeNo: Result.TradeNo || '',
        });
      }

      res.redirect(`${frontendUrl}/order-result?orderId=${orderDoc.id}`);
    } else {
      res.redirect(`${frontendUrl}/member?tab=orders`);
    }
  } catch (err) {
    console.error('ATM callback error:', err);
    res.redirect(`${frontendUrl}/member?tab=orders`);
  }
});

// POST /api/freeOrder — 管理員免單（金額歸零、標記已付款）
export const freeOrder = onRequest({ cors: true }, async (req, res) => {
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

  const orderRef = db.collection('orders').doc(orderId as string);
  const orderDoc = await orderRef.get();

  if (!orderDoc.exists) {
    res.status(404).json({ error: '訂單不存在' });
    return;
  }

  const orderData = orderDoc.data()!;

  if (orderData.status !== 'pending') {
    res.status(400).json({ error: '只能對待付款訂單進行免單' });
    return;
  }

  await orderRef.update({
    amount: 0,
    status: 'paid',
    paidAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // 將課程加入用戶已購買清單
  const userRef = db.collection('users').doc(orderData.userId);
  await userRef.update({
    purchasedCourses: admin.firestore.FieldValue.arrayUnion(orderData.courseId),
  });

  res.json({ success: true });
});

// POST /api/lineWebhook — LINE@ Messaging API Webhook
export const lineWebhook = onRequest({ cors: false }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(200).send('OK');
    return;
  }

  // HMAC-SHA256 簽名驗證
  const channelSecret = LINE_MESSAGING_CHANNEL_SECRET.value();
  const rawBody = req.rawBody;
  if (!rawBody) {
    console.error('LINE webhook: missing rawBody');
    res.status(400).send('Bad Request');
    return;
  }
  const expectedSignature = crypto
    .createHmac('SHA256', channelSecret)
    .update(rawBody)
    .digest('base64');
  if (expectedSignature !== req.headers['x-line-signature']) {
    console.error('LINE webhook: signature verification failed');
    res.status(403).send('Forbidden');
    return;
  }

  const events = req.body?.events || [];

  for (const event of events) {
    try {
      const lineUserId = event.source?.userId;
      if (!lineUserId) continue;

      // follow 事件（加好友）或 message 事件
      if (event.type === 'follow' || event.type === 'message') {
        // 查找有這個 lineId（from LINE Login）的用戶
        // 由於 Provider 不同，lineId 不同，我們存為 messagingLineId
        // 先查有沒有已經存過的
        const existingSnap = await db.collection('users')
          .where('messagingLineId', '==', lineUserId)
          .limit(1)
          .get();

        if (existingSnap.empty) {
          // 取得用戶的 LINE profile 來比對
          const LINE_TOKEN = require('./config').LINE_CHANNEL_ACCESS_TOKEN.value();
          const profileRes = await require('axios').default.get(
            `https://api.line.me/v2/bot/profile/${lineUserId}`,
            { headers: { Authorization: `Bearer ${LINE_TOKEN}` } }
          );
          const displayName = profileRes.data.displayName;

          // 用 displayName + phone 比對（不完美但實用）
          // 或直接存到所有有 lineId 的用戶
          const lineUsersSnap = await db.collection('users')
            .where('lineId', '!=', '')
            .get();

          // 如果只有一個有 lineId 的用戶，直接更新
          // 否則用 displayName 比對
          for (const userDoc of lineUsersSnap.docs) {
            const userData = userDoc.data();
            if (!userData.messagingLineId) {
              if (userData.displayName === displayName || lineUsersSnap.size === 1) {
                await userDoc.ref.update({ messagingLineId: lineUserId });
                console.log(`Linked messagingLineId ${lineUserId} to user ${userDoc.id}`);
                break;
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('LINE webhook error:', err);
    }
  }

  res.status(200).send('OK');
});
