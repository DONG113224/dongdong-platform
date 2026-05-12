import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { sendEmail, sendLineMessageToUser } from './utils/notify';
import { escapeHtml } from './utils/sanitize';
import { FRONTEND_URL } from './config';

const db = admin.firestore();

// Every day at 12:00 noon UTC+8
export const reminderScheduler = onSchedule(
  { schedule: '0 12 * * *', timeZone: 'Asia/Taipei' },
  async () => {
    const now = new Date();
    const frontendUrl = FRONTEND_URL.value();

    // Check for 1 and 3 day old pending orders
    for (const daysAgo of [1, 3]) {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() - daysAgo);
      targetDate.setHours(0, 0, 0, 0);

      const nextDate = new Date(targetDate);
      nextDate.setDate(nextDate.getDate() + 1);

      const ordersSnapshot = await db
        .collection('orders')
        .where('status', '==', 'pending')
        .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(targetDate))
        .where('createdAt', '<', admin.firestore.Timestamp.fromDate(nextDate))
        .get();

      for (const orderDoc of ordersSnapshot.docs) {
        const order = orderDoc.data();

        // Skip if already sent for this day
        if (order.reminderSentDays?.includes(daysAgo)) continue;

        const orderLink = `${frontendUrl}/order-result?orderId=${orderDoc.id}`;
        const merchantOrderNo = order.merchantOrderNo || orderDoc.id;

        // Get user info
        const userDoc = await db.collection('users').doc(order.userId).get();
        const userData = userDoc.data();
        const displayName = userData?.displayName || '';

        let paymentInfo = '';
        let paymentInfoHtml = '';
        if (order.paymentMethod === 'credit_card') {
          paymentInfo = `付款方式：信用卡\n訂單頁面：${orderLink}`;
          paymentInfoHtml = `<p>付款方式：信用卡</p><p>訂單頁面：<a href="${orderLink}">${orderLink}</a></p>`;
        } else if (order.virtualAccount) {
          paymentInfo = `付款方式：ATM轉帳\n轉帳資訊：${order.virtualAccount}`;
          paymentInfoHtml = `<p>付款方式：ATM轉帳</p><p>轉帳資訊：${escapeHtml(order.virtualAccount)}</p>`;
        } else {
          paymentInfo = `付款方式：ATM轉帳\n訂單頁面：${orderLink}`;
          paymentInfoHtml = `<p>付款方式：ATM轉帳</p><p>訂單頁面：<a href="${orderLink}">${orderLink}</a></p>`;
        }

        const textContent = `${displayName} 您好，您報名的線上課程【線上課程】\n您尚未完款，記得於下單後72小時內完款唷^^\n\n訂單編號為：${merchantOrderNo}\n訂單頁面：${orderLink}\n${paymentInfo}`;

        const htmlContent = `
<div style="font-family:'Noto Sans TC',sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:30px;border-radius:12px 12px 0 0;text-align:center">
    <h1 style="color:white;margin:0;font-size:24px">線上課程平台</h1>
  </div>
  <div style="background:white;padding:30px;border:1px solid #eee;border-top:0">
    <p style="font-size:16px;color:#333;line-height:1.8">${escapeHtml(displayName)} 你好，</p>
    <p style="font-size:16px;color:#333;line-height:1.8">
      注意到你之前有將<strong>「線上課程」</strong>加入購物車，但還沒有完成付款 🤔
    </p>
    <p style="font-size:16px;color:#333;line-height:1.8">
      目前限時特價 <strong style="color:#e53e3e">NT$6,980</strong>（原價 NT$26,800），隨時可能調回原價！
    </p>
    ${paymentInfoHtml}
    <div style="text-align:center;margin:30px 0">
      <a href="${orderLink}" style="display:inline-block;background:#e53e3e;color:white;padding:14px 40px;border-radius:8px;text-decoration:none;font-size:16px;font-weight:bold">
        立即完成付款
      </a>
    </div>
    <p style="font-size:14px;color:#666;line-height:1.8">
      ✅ 購買後立即開始上課，不限觀看期限<br>
      ✅ 七天不滿意全額退費保證<br>
      ✅ 加入專屬 LINE 學員社群
    </p>
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
    <p style="font-size:13px;color:#999;line-height:1.6">
      如果你已經完成報名，請忽略這封信。<br>
      有任何問題歡迎透過 LINE@ 詢問。
    </p>
  </div>
</div>
        `;

        try {
          await sendEmail(
            order.userEmail,
            `付款提醒 - ${order.courseTitle}`,
            htmlContent,
            { userId: order.userId, orderId: orderDoc.id }
          );

          await sendLineMessageToUser(order.userId, textContent, orderDoc.id);

          // Update reminderSentDays
          await orderDoc.ref.update({
            reminderSentDays: admin.firestore.FieldValue.arrayUnion(daysAgo),
          });
        } catch (err) {
          console.error(`Reminder error for order ${orderDoc.id}:`, err);
        }
      }
    }

    // 購物車提醒：加入購物車超過 24 小時但沒建立訂單的用戶
    try {
      const cartCutoff = new Date(now);
      cartCutoff.setHours(cartCutoff.getHours() - 24);

      const cartSnapshot = await db.collection('cartEvents')
        .where('addedAt', '<', admin.firestore.Timestamp.fromDate(cartCutoff))
        .get();

      for (const cartDoc of cartSnapshot.docs) {
        const cartData = cartDoc.data();
        if (cartData.reminderSent) continue;

        // 檢查是否已建立訂單
        const ordersSnap = await db.collection('orders')
          .where('userId', '==', cartData.userId)
          .where('courseId', '==', cartData.courseId)
          .limit(1)
          .get();

        if (!ordersSnap.empty) {
          // 已建立訂單，刪除購物車紀錄
          await cartDoc.ref.delete();
          continue;
        }

        // 取得用戶 email
        const userDoc = await db.collection('users').doc(cartData.userId).get();
        const userData = userDoc.data();
        if (!userData?.email) continue;

        const cartHtml = `
<div style="font-family:'Noto Sans TC',sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:30px;border-radius:12px 12px 0 0;text-align:center">
    <h1 style="color:white;margin:0;font-size:24px">線上課程平台</h1>
  </div>
  <div style="background:white;padding:30px;border:1px solid #eee;border-top:0">
    <p style="font-size:16px;color:#333;line-height:1.8">${escapeHtml(userData.displayName || '')} 你好，</p>
    <p style="font-size:16px;color:#333;line-height:1.8">
      注意到你之前有將<strong>「線上課程」</strong>加入購物車，但還沒有完成報名 🤔
    </p>
    <p style="font-size:16px;color:#333;line-height:1.8">
      這堂課會教你如何用 AI 工具實際操盤 30 種產業，幫你省下大量時間和成本。<br>
      目前限時特價 <strong style="color:#e53e3e">NT$6,980</strong>（原價 NT$26,800），隨時可能調回原價！
    </p>
    <div style="text-align:center;margin:30px 0">
      <a href="${frontendUrl}" style="display:inline-block;background:#e53e3e;color:white;padding:14px 40px;border-radius:8px;text-decoration:none;font-size:16px;font-weight:bold">
        立即完成報名
      </a>
    </div>
    <p style="font-size:14px;color:#666;line-height:1.8">
      ✅ 購買後立即開始上課，不限觀看期限<br>
      ✅ 七天不滿意全額退費保證<br>
      ✅ 加入專屬 LINE 學員社群
    </p>
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
    <p style="font-size:13px;color:#999;line-height:1.6">
      如果你已經完成報名，請忽略這封信。<br>
      有任何問題歡迎透過 LINE@ 詢問。
    </p>
  </div>
</div>`;

        try {
          await sendEmail(
            userData.email,
            '你的購物車還有課程等著你 🛒',
            cartHtml,
            { userId: cartData.userId }
          );
          await cartDoc.ref.update({ reminderSent: true });
          console.log(`Cart reminder sent to ${userData.email}`);
        } catch (cartErr) {
          console.error(`Cart reminder error for ${cartData.userId}:`, cartErr);
        }
      }
    } catch (cartError) {
      console.error('Cart reminder error:', cartError);
    }

    // Auto-cancel expired orders (pending for more than 72 hours)
    const cutoffDate = new Date(now);
    cutoffDate.setHours(cutoffDate.getHours() - 72);

    const expiredSnapshot = await db
      .collection('orders')
      .where('status', '==', 'pending')
      .where('createdAt', '<', admin.firestore.Timestamp.fromDate(cutoffDate))
      .get();

    for (const orderDoc of expiredSnapshot.docs) {
      try {
        await orderDoc.ref.update({
          status: 'cancelled',
        });
        console.log(`Auto-cancelled expired order: ${orderDoc.id}`);
      } catch (err) {
        console.error(`Auto-cancel error for order ${orderDoc.id}:`, err);
      }
    }
  }
);
