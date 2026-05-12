# 線上課程銷售平台 — 部署說明書

這是一個完整的線上課程銷售網站（含影片串流），使用 React + Vite 前端 + Firebase 後端 + Bunny.net 影片 CDN。

> **給 Claude Code：** 這份文件是讓你幫客戶部署整個平台用的。請按照以下步驟引導客戶完成設定。

---

## 專案架構

```
├── src/                  # React 前端（Vite + TailwindCSS）
│   ├── pages/            # 頁面（銷售頁、購物車、結帳、管理後台等）
│   ├── components/       # 共用元件
│   ├── contexts/         # React Context（購物車、認證）
│   ├── admin/            # 管理後台頁面
│   └── lib/              # Firebase 初始化等工具
├── functions/            # Firebase Cloud Functions（金流、LINE、Email 等）
│   └── src/              # Cloud Functions 原始碼（TypeScript）
├── scripts/              # 工具腳本
│   ├── upload-video.cjs      # 單支影片上傳到 Bunny.net
│   ├── batch-upload-videos.cjs # 批量上傳影片
│   └── clear-test-data.cjs    # 清除測試資料
├── firebase.json         # Firebase 設定（Hosting、Functions 路由）
├── firestore.rules       # Firestore 安全規則
├── storage.rules         # Storage 安全規則
├── .env                  # 前端環境變數（需填入）
├── .env.example          # 環境變數範本
└── functions/.env        # Cloud Functions 環境變數（需填入）
```

---

## 部署步驟總覽

### 第一步：建立 Firebase 專案

1. 到 Firebase Console (https://console.firebase.google.com/) 建立新專案
2. 啟用以下服務：
   - **Authentication**：啟用「電子郵件/密碼」登入方式
   - **Firestore Database**：建立資料庫（建議選 asia-east1 台灣地區）
   - **Hosting**：啟用 Hosting
   - **Storage**：啟用 Storage
   - **Functions**：需要升級到 Blaze 方案（按量付費）才能使用
3. 在「專案設定 > 一般」中，新增一個「網頁應用程式」，取得 Firebase 設定值

### 第二步：建立 Bunny.net 影片平台

1. 到 Bunny.net (https://bunny.net/) 註冊帳號
2. 建立一個 **Stream Library**（影片串流庫）
3. 取得以下資訊：
   - **Library ID**：在 Stream Library 設定頁面可以找到
   - **API Key**：在 Bunny.net 帳號設定 > API Keys 取得
   - **Signing Key**：在 Stream Library > Security > Token Authentication 開啟並取得

### 第三步：填入環境變數

#### 前端 `.env`（根目錄）

```env
# Firebase（從 Firebase Console 取得）
VITE_FIREBASE_API_KEY=你的apiKey
VITE_FIREBASE_AUTH_DOMAIN=你的專案.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=你的專案ID
VITE_FIREBASE_STORAGE_BUCKET=你的專案.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=你的senderID
VITE_FIREBASE_APP_ID=你的appID

# Bunny.net（從 Bunny.net 取得）
BUNNY_LIBRARY_ID=你的LibraryID
BUNNY_API_KEY=你的APIKey
BUNNY_SIGNING_KEY=你的SigningKey

# 網站網址（部署完成後填入）
FRONTEND_URL=https://你的專案ID.web.app
```

#### Cloud Functions `functions/.env`

```env
# Bunny.net
BUNNY_LIBRARY_ID=你的LibraryID
BUNNY_API_KEY=你的APIKey
BUNNY_SIGNING_KEY=你的SigningKey

# 網站網址
FRONTEND_URL=https://你的專案ID.web.app
```

> **最低需求：** 只需要 Firebase + Bunny.net 就能讓網站運作（可以看課程、看影片）。
> 以下服務是選配，不設定的話該功能會自動停用：

| 選配服務 | 用途 | 需要填入的 Key |
|---------|------|---------------|
| 藍新金流 | 線上刷卡/ATM 付款 | NEWEBPAY_MERCHANT_ID, NEWEBPAY_HASH_KEY, NEWEBPAY_HASH_IV |
| ezPay 電子發票 | 自動開立電子發票 | EZPAY_MERCHANT_ID, EZPAY_HASH_KEY, EZPAY_HASH_IV |
| SendGrid | 寄送 Email 通知 | SENDGRID_API_KEY, SENDGRID_FROM_EMAIL |
| LINE Login/推播 | LINE 登入、LINE 推播通知 | LINE_CHANNEL_ACCESS_TOKEN, LINE_MESSAGING_CHANNEL_ID 等 |
| Google 登入 | Google OAuth 登入 | GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET |
| Facebook 登入 | Facebook OAuth 登入 | FACEBOOK_APP_ID, FACEBOOK_APP_SECRET |

### 第四步：安裝和部署

```bash
# 1. 安裝 Firebase CLI（如果還沒裝的話）
npm install -g firebase-tools

# 2. 登入 Firebase
firebase login

# 3. 連結你的 Firebase 專案
firebase use --add
# 選擇你建立的專案，alias 取 default

# 4. 安裝前端依賴
npm install

# 5. 安裝 Cloud Functions 依賴
cd functions && npm install && cd ..

# 6. 建置前端
npm run build

# 7. 部署全部（Hosting + Functions + Firestore Rules + Storage Rules）
firebase deploy
```

### 第五步：設定管理員

1. 先到部署好的網站上，用 Email 註冊一個帳號（這個帳號將成為管理員）
2. 到 Firebase Console > Authentication，找到該帳號的 UID
3. 到 Firebase Console > Firestore > 手動新增文件：
   - 集合：`admins`
   - 文件 ID：填入上面的 UID
   - 欄位：`role` = `admin`, `createdAt` = 當前時間

### 第六步：上傳課程影片

```bash
# 單支影片上傳
node scripts/upload-video.cjs "影片路徑.mp4" "章節標題" 1

# 批量上傳（依照 01_標題.mp4 格式命名）
node scripts/batch-upload-videos.cjs "影片資料夾路徑"
```

上傳後到後台「課程管理」設定章節對應的 Bunny.net Video ID。

### 第七步（選用）：設定自訂網域

在 Firebase Console > Hosting > 新增自訂網域，按照指示設定 DNS。
設定完成後記得更新 `.env` 和 `functions/.env` 中的 `FRONTEND_URL`。

---

## 功能清單

### 前台
- 課程銷售頁（支援 OG 分享預覽）
- 線上影片觀看（Bunny.net 串流，含防盜連簽名）
- 購物車、結帳（藍新金流刷卡/ATM）
- 訂單查詢、LINE 通知

### 後台（管理員）
- 課程管理（新增/編輯課程、章節管理）
- 訂單管理（查看、退款、狀態更新）
- 報到系統
- 電子發票（ezPay 開立/作廢/重發）
- LINE 推播、Email 通知
- API 設定（在後台直接設定各服務的 Key）

---

## 注意事項

- Cloud Functions 需要 Firebase Blaze 方案，但一般用量幾乎免費
- Bunny.net Stream 有免費額度，超過後按量計費（很便宜）
- 藍新金流需要另外到藍新官網申請商店帳號
- 後台有「API 設定」頁面，部分服務的 Key 也可以直接在後台設定
- `index.html` 中的 OG meta（標題、描述、圖片）需要根據客戶品牌修改
- `og:site_name` 目前是空的，記得填入客戶的品牌名稱
