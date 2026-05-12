/**
 * 清除 Firestore 測試資料（users, orders, invoices, mergeRequests）
 * 保留 courses, admins, config 集合
 *
 * 使用方式：
 *   node scripts/clear-test-data.js
 */

const admin = require('../functions/node_modules/firebase-admin');
const path = require('path');

// 初始化 Firebase Admin（使用預設憑證）
const serviceAccountPath = path.join(__dirname, '..', 'service-account-key.json');
const fs = require('fs');

if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
} else {
  // 使用 GOOGLE_APPLICATION_CREDENTIALS 或 gcloud 預設憑證
  admin.initializeApp({
    projectId: '', // 填入你的 Firebase Project ID
  });
}

const db = admin.firestore();
const auth = admin.auth();

async function deleteCollection(collectionName) {
  const collectionRef = db.collection(collectionName);
  let totalDeleted = 0;

  while (true) {
    const snapshot = await collectionRef.limit(100).get();
    if (snapshot.empty) break;

    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    totalDeleted += snapshot.size;
    process.stdout.write(`\r   已刪除 ${totalDeleted} 筆 ${collectionName}`);
  }

  console.log(`\r   ✅ ${collectionName}: 共刪除 ${totalDeleted} 筆`);
  return totalDeleted;
}

async function deleteAllAuthUsers() {
  let totalDeleted = 0;

  while (true) {
    const listResult = await auth.listUsers(100);
    if (listResult.users.length === 0) break;

    const uids = listResult.users.map(u => u.uid);
    await auth.deleteUsers(uids);
    totalDeleted += uids.length;
    process.stdout.write(`\r   已刪除 ${totalDeleted} 個 Auth 用戶`);
  }

  console.log(`\r   ✅ Auth 用戶: 共刪除 ${totalDeleted} 個`);
  return totalDeleted;
}

async function main() {
  console.log('\n🧹 開始清除測試資料...\n');

  // 清除 Firestore 集合
  const collections = ['users', 'orders', 'invoices', 'mergeRequests'];
  for (const name of collections) {
    await deleteCollection(name);
  }

  // 清除 Firebase Auth 用戶
  await deleteAllAuthUsers();

  console.log('\n✅ 所有測試資料已清除完畢！\n');
  process.exit(0);
}

main().catch(err => {
  console.error('錯誤:', err.message);
  process.exit(1);
});
