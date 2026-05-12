/**
 * Bunny.net 影片上傳腳本
 *
 * 使用方式：
 *   node scripts/upload-video.js <影片檔案路徑> <章節標題> [章節順序]
 *
 * 範例：
 *   node scripts/upload-video.js "C:/Videos/第一章.mp4" "第一章：AI 基礎概念" 1
 *
 * 環境變數（從 functions/.env 自動讀取）：
 *   BUNNY_API_KEY - Bunny.net API Key
 *   BUNNY_LIBRARY_ID - Bunny.net Stream Library ID
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// 讀取 functions/.env
const envPath = path.join(__dirname, '..', 'functions', '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...vals] = line.split('=');
  if (key && vals.length) env[key.trim()] = vals.join('=').trim();
});

const API_KEY = env.BUNNY_API_KEY;
const LIBRARY_ID = env.BUNNY_LIBRARY_ID;

if (!API_KEY) {
  console.error('錯誤：請在 functions/.env 中設定 BUNNY_API_KEY');
  process.exit(1);
}

if (!LIBRARY_ID) {
  console.error('錯誤：請在 functions/.env 中設定 BUNNY_LIBRARY_ID');
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('使用方式: node scripts/upload-video.js <影片路徑> <章節標題> [章節順序]');
  process.exit(1);
}

const filePath = args[0];
const chapterTitle = args[1];
const chapterOrder = parseInt(args[2]) || 0;

if (!fs.existsSync(filePath)) {
  console.error(`錯誤：找不到檔案 ${filePath}`);
  process.exit(1);
}

function httpsRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function uploadFile(url, filePath) {
  return new Promise((resolve, reject) => {
    const fileSize = fs.statSync(filePath).size;
    const parsedUrl = new URL(url);

    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname,
      method: 'PUT',
      headers: {
        'AccessKey': API_KEY,
        'Content-Type': 'application/octet-stream',
        'Content-Length': fileSize,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);

    // 串流上傳並顯示進度
    const fileStream = fs.createReadStream(filePath);
    let uploaded = 0;

    fileStream.on('data', (chunk) => {
      uploaded += chunk.length;
      const percent = Math.round((uploaded / fileSize) * 100);
      process.stdout.write(`\r上傳中... ${percent}% (${(uploaded / 1024 / 1024).toFixed(1)}MB / ${(fileSize / 1024 / 1024).toFixed(1)}MB)`);
    });

    fileStream.pipe(req);
  });
}

async function main() {
  const fileName = path.basename(filePath, path.extname(filePath));
  const fileSize = fs.statSync(filePath).size;

  console.log(`\n📹 準備上傳影片`);
  console.log(`   檔案：${filePath}`);
  console.log(`   大小：${(fileSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`   章節：${chapterTitle}`);
  console.log('');

  // Step 1: 在 Bunny.net 建立影片
  console.log('1️⃣  建立 Bunny.net 影片...');
  const createResult = await httpsRequest({
    hostname: 'video.bunnycdn.com',
    path: `/library/${LIBRARY_ID}/videos`,
    method: 'POST',
    headers: {
      'AccessKey': API_KEY,
      'Content-Type': 'application/json',
    },
  }, JSON.stringify({ title: chapterTitle }));

  if (createResult.status !== 200) {
    console.error('建立影片失敗:', createResult.data);
    process.exit(1);
  }

  const videoId = createResult.data.guid;
  console.log(`   Video ID: ${videoId}`);

  // Step 2: 上傳影片檔案
  console.log('2️⃣  上傳影片檔案...');
  const uploadUrl = `https://video.bunnycdn.com/library/${LIBRARY_ID}/videos/${videoId}`;
  const uploadResult = await uploadFile(uploadUrl, filePath);
  console.log('');

  if (uploadResult.status !== 200) {
    console.error('上傳失敗:', uploadResult.data);
    process.exit(1);
  }

  console.log('   ✅ 上傳成功！');
  console.log('');
  console.log('📋 結果：');
  console.log(`   Video ID: ${videoId}`);
  console.log(`   章節標題: ${chapterTitle}`);
  console.log(`   章節順序: ${chapterOrder}`);
  console.log('');
  console.log('請將以上 Video ID 更新到課程管理的章節設定中。');
  console.log(`或執行：node scripts/update-chapter.js ${videoId} "${chapterTitle}" ${chapterOrder}`);
}

main().catch(err => {
  console.error('錯誤:', err.message);
  process.exit(1);
});
