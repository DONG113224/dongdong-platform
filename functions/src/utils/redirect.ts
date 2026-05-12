import type { Response } from 'express';

/**
 * 使用 HTML + JavaScript 跳轉，避免 iOS Universal Links 攔截 302 redirect
 * 導致用戶被帶到 LINE/Google/Facebook APP 而無法完成 OAuth 流程
 */
export function jsRedirect(res: Response, url: string) {
  const escaped = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>登入中...</title>
</head>
<body style="display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;font-family:sans-serif;background:#f5f5f5">
<div style="text-align:center">
<p style="font-size:18px;color:#333">登入中，請稍候...</p>
<p style="font-size:14px;color:#999;margin-top:12px">若未自動跳轉，請<a href="${escaped}">點此繼續</a></p>
</div>
<script>window.location.replace("${url.replace(/"/g, '\\"')}");</script>
</body>
</html>`);
}
