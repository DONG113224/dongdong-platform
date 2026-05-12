/**
 * 批量上傳影片到 Bunny.net 並自動更新課程章節
 *
 * 使用方式：
 *   node scripts/batch-upload-videos.js <影片資料夾路徑>
 *
 * 範例：
 *   node scripts/batch-upload-videos.js "C:/Videos/課程影片"
 *
 * 影片檔案命名規則：
 *   01_章節標題.mp4
 *   02_第二章.mp4
 *   前面的數字會作為章節順序，底線後面是章節標題
 *   沒有數字前綴的話按檔名排序
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

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

if (!API_KEY || !LIBRARY_ID) {
  console.error('錯誤：請在 functions/.env 中設定 BUNNY_API_KEY 和 BUNNY_LIBRARY_ID');
  process.exit(1);
}

const folderPath = process.argv[2];
if (!folderPath) {
  console.log('使用方式: node scripts/batch-upload-videos.js <影片資料夾路徑>');
  process.exit(1);
}

if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
  console.error(`錯誤：找不到資料夾 ${folderPath}`);
  process.exit(1);
}

const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'];

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

function uploadFile(videoId, filePath) {
  return new Promise((resolve, reject) => {
    const fileSize = fs.statSync(filePath).size;
    const options = {
      hostname: 'video.bunnycdn.com',
      path: `/library/${LIBRARY_ID}/videos/${videoId}`,
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

    const fileStream = fs.createReadStream(filePath);
    let uploaded = 0;

    fileStream.on('data', (chunk) => {
      uploaded += chunk.length;
      const percent = Math.round((uploaded / fileSize) * 100);
      process.stdout.write(`\r   上傳中... ${percent}%`);
    });

    fileStream.pipe(req);
  });
}

function parseFileName(fileName) {
  const name = path.basename(fileName, path.extname(fileName));
  const match = name.match(/^(\d+)[_\-\s](.+)$/);
  if (match) {
    return { order: parseInt(match[1]), title: match[2].trim() };
  }
  return { order: 0, title: name };
}

async function main() {
  // 掃描影片檔案
  const files = fs.readdirSync(folderPath)
    .filter(f => videoExtensions.includes(path.extname(f).toLowerCase()))
    .map(f => ({
      path: path.join(folderPath, f),
      ...parseFileName(f),
      size: fs.statSync(path.join(folderPath, f)).size,
    }))
    .sort((a, b) => a.order - b.order);

  if (files.length === 0) {
    console.error('資料夾中沒有找到影片檔案');
    process.exit(1);
  }

  console.log(`\n📹 找到 ${files.length} 個影片：\n`);
  files.forEach((f, i) => {
    console.log(`   ${i + 1}. ${f.title} (${(f.size / 1024 / 1024).toFixed(1)} MB)`);
  });
  console.log('');

  const results = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    console.log(`\n[${i + 1}/${files.length}] 📤 ${file.title}`);

    // 建立影片
    const createResult = await httpsRequest({
      hostname: 'video.bunnycdn.com',
      path: `/library/${LIBRARY_ID}/videos`,
      method: 'POST',
      headers: {
        'AccessKey': API_KEY,
        'Content-Type': 'application/json',
      },
    }, JSON.stringify({ title: file.title }));

    if (createResult.status !== 200) {
      console.error(`   ❌ 建立失敗:`, createResult.data);
      continue;
    }

    const videoId = createResult.data.guid;
    console.log(`   Video ID: ${videoId}`);

    // 上傳
    const uploadResult = await uploadFile(videoId, file.path);
    console.log('');

    if (uploadResult.status !== 200) {
      console.error(`   ❌ 上傳失敗:`, uploadResult.data);
      continue;
    }

    console.log(`   ✅ 上傳成功`);
    results.push({
      order: file.order || (i + 1),
      title: file.title,
      videoId,
      size: file.size,
    });
  }

  // 輸出結果
  console.log('\n\n========================================');
  console.log('📋 上傳結果：');
  console.log('========================================\n');

  results.forEach((r) => {
    console.log(`  第 ${r.order} 章：${r.title}`);
    console.log(`  Video ID: ${r.videoId}\n`);
  });

  // 輸出 JSON 方便程式使用
  const jsonPath = path.join(folderPath, 'upload-results.json');
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log(`\n結果已儲存至：${jsonPath}`);
  console.log('\n請到後台「課程管理」更新各章節的 Bunny.net Video ID，或請 Claude 幫你更新。');
}

main().catch(err => {
  console.error('錯誤:', err.message);
  process.exit(1);
});
