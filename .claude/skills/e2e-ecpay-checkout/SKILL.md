---
name: e2e-ecpay-checkout
description: 以 Playwright MCP 對本專案（花漾生活，localhost:3001）跑完整下單 E2E：登入 seed admin → 加一件商品到購物車 → 結帳建立訂單 → 綠界測試環境選「網路ATM」＋「台灣土地銀行」模擬付款 → 返站確認已付款，並以 API 驗證訂單／購物車／庫存，結束附各步驟截圖。使用者要求 E2E、端對端、跑一次下單付款、驗證結帳或綠界付款流程、回歸測試金流時使用，即使沒明說「Playwright」也適用；單元／API 測試（vitest）不適用。
---

# E2E：結帳 → 綠界網路ATM（台灣土地銀行）付款

以 Playwright MCP 操作真實瀏覽器，走完下單到付款完成。每次執行會在開發用 `database.sqlite` 建一筆真實訂單、扣該商品庫存 1，並在綠界 stage 產生一筆測試交易；不會有真實扣款。

## 操作原則

- 每一步先 `browser_snapshot` 再操作，以 role＋文字定位；snapshot 的 `ref` 每次都會變，不要沿用舊值或寫死。
- 本站頁面（首頁商品、購物車、訂單頁）由前端 fetch 後才渲染，導頁／點擊後回傳的 snapshot 常是空殼。截圖或讀值前先 `browser_wait_for` 該步的預期文字。
- 綠界元素名稱用精確比對（Playwright `exact`）：listitem「ATM」會子字串命中「WebATM」。
- 截圖存 `.playwright-mcp/e2e-ecpay-checkout/<YYYYMMDD-HHmmss>/NN-<step>.png`（Playwright MCP 只允許寫入專案目錄，scratchpad 會被拒；`.playwright-mcp/` 已在 `.gitignore`）。同一次執行共用一個 timestamp 目錄，避免覆蓋前次結果。
- 任一步失敗：先截 `NN-failed.png`、收 `browser_console_messages(level: error)`，停在該步回報，不要盲目重試付款。

## 1. 啟動 server

1. `lsof -nP -iTCP:3001 -sTCP:LISTEN`；已有 listener 就沿用，並 `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/` 確認 200。
2. 沒有就 `npm run css:build`，再背景執行 `node server.js`，看到 `Server running on port 3001` 才繼續。
   - 若報 `Fatal: JWT_SECRET is not set`：`server.js` 靠 dotenv 讀 `.env`，Claude Code 的 Bash sandbox 禁讀 `.env*`。改在 sandbox 外背景啟動（`dangerouslyDisableSandbox: true` + `run_in_background`）。不要讀、印或寫死 `.env` 內容。
3. 記下 server 是否由本次啟動，收尾時回報。

## 2. 乾淨起點與登入

1. 帳密取自 `src/database.js` 的 `seedAdminUser()` 預設值（可被 `ADMIN_EMAIL`／`ADMIN_PASSWORD` 覆寫；若使用者另給則用使用者的）。
2. `browser_navigate` → `http://localhost:3001/login`，以 `browser_evaluate` 確認 `localStorage.flower_token` 為空；有值表示殘留前次登入，執行 `localStorage.clear()` 後重新整理，讓登入步驟真的被驗到。
3. 填 textbox「Email」「密碼」，按 button「登入」。
4. 成功條件：導回 `/`，header 出現 button「登出」。截 `01-logged-in.png`。

## 3. 前置狀態：清購物車、選商品、記庫存

用 `browser_evaluate` 直接打 API（token 在 `localStorage.flower_token`；回應格式 `{ data, error, message }`）：

```js
async () => {
  const h = { Authorization: 'Bearer ' + localStorage.getItem('flower_token') };
  const cart = await fetch('/api/cart', { headers: h }).then(r => r.json());
  for (const it of cart.data.items) await fetch('/api/cart/' + it.id, { method: 'DELETE', headers: h });
  const { data } = await fetch('/api/products').then(r => r.json());
  const p = data.products.find(p => p.stock > 0);
  return { removed: cart.data.items.length, id: p?.id, name: p?.name, price: p?.price, stock: p?.stock };
}
```

- 購物車原有品項會被清掉（否則訂單總額與預期不符），回報時註明清了幾項。
- 沒有 `stock > 0` 的商品 → 停止並回報（seed 庫存已耗盡）。
- 記下 `id`／`name`／`price`／起始 `stock`，第 7 步要比對。

## 4. 加入購物車並結帳

1. `browser_navigate` → `/products/<id>`，按 button「加入購物車 NT$ …」（主商品那顆，含價格；下方「你可能也喜歡」的「加入購物車」不要按）。
2. `browser_navigate` → `/cart`，確認「共 1 項商品」、總計等於商品價＋運費（小計未滿 NT$ 500 加 NT$ 150，否則免運）。截 `02-cart.png`。
3. 按 button「前往結帳」→ `/checkout`。填 textbox「收件人姓名」「Email」「收件地址」，用明顯的測試假資料（例：`E2E 測試收件人`／seed admin email／`台北市信義區測試路 1 號`）。
4. 按 button「送出訂單」→ 導向 `/orders/<orderId>`，等 heading「確認訂單，前往付款」出現，狀態「待付款」。從 URL 記 `orderId`、從頁面記「訂單編號」。截 `03-order-created.png`。

## 5. 綠界：網路ATM → 台灣土地銀行

1. 按 button「前往綠界付款」。
2. **環境閘門**：確認 URL host 是 `payment-stage.ecpay.com.tw`。若是 `payment.ecpay.com.tw`（正式環境）立即停止、不做任何付款操作，回報使用者。
3. 付款方式清單按 listitem「WebATM」（畫面文字「網路ATM」）。使用者說的「ATM 網路交易」指這個，不是 listitem「ATM」（「ATM虛擬帳號」）。
4. 「選擇銀行」combobox 選 `台灣土地銀行`。綠界選項用「**台**」；使用者常寫「**臺**灣土地銀行」，照字比對會選不到。截 `04-ecpay-webatm-landbank.png`。
5. 按 link「前往付款」→ 跳出提醒 modal（網路ATM 為即時交易、勿重新整理），按 **button**「關閉」（不是 link）後續行。

## 6. 模擬銀行付款並返站

1. 應導到 `https://pay-stage.ecpay.com.tw/MockMPPost/LandWebAtm`（綠界的土銀模擬頁）。以 `browser_evaluate` 讀 `document.querySelector('[name="RC"]').value` 等欄位，確認預填 `RC=0`、`MSG=交易成功`、`CurAmt` 等於訂單總額。截 `05-landbank-mock.png`。
2. 按 button「Save」→ 綠界頁標題「付款成功」，確認訂單編號（綠界格式為去連字號＋兩位序號，如 `ORD202609277C27901`）、付款方式「網路ATM」、金額。截 `06-ecpay-success.png`。
3. 按 link「返回商店」→ `/orders/<orderId>?payment=pending`，頁面會自動向綠界查詢。等到 heading「付款完成，謝謝你」且狀態「已付款」。
   - 約 5 秒仍顯示「待付款」或「付款未完成」：按 button「我已付款，查詢付款狀態」（本機收不到綠界 Server Notify，狀態靠 QueryTradeInfo 查詢更新）。
4. 截 `07-order-paid.png`。

## 7. API 驗證（全部成立才算 PASS）

```js
async () => {
  const h = { Authorization: 'Bearer ' + localStorage.getItem('flower_token') };
  const o = (await fetch('/api/orders/<orderId>', { headers: h }).then(r => r.json())).data;
  const cart = (await fetch('/api/cart', { headers: h }).then(r => r.json())).data;
  const p = (await fetch('/api/products/<productId>').then(r => r.json())).data;
  return { orderNo: o.order_no, status: o.status, total: o.total_amount, cartItems: cart.items.length, stock: p.stock };
}
```

| 檢查 | 期望 |
|---|---|
| 頁面 | 「付款完成，謝謝你」＋狀態「已付款」 |
| `status` | `paid` |
| `total` | 等於第 4 步總計 |
| `cartItems` | `0` |
| `stock` | 起始值 − 1 |

只看到 UI「已付款」不算通過。

## 可忽略的 console error

- `localhost:3001/favicon.ico` 404
- 綠界頁面 `ReferenceError: Swiper is not defined`（綠界自身 script）

其他 error 一律列入回報。

## 回報

1. 首句：PASS／FAIL＋訂單編號＋金額。
2. 步驟表：步驟、結果、關鍵值（清掉的購物車項數、商品、orderId、綠界訂單編號）。
3. 第 7 步驗證值（含庫存前後）。
4. 截圖：全部傳給使用者（Claude desktop 用 `SendUserFile`，否則列出路徑）。
5. 留下的狀態：server 是否仍在 3001 執行、是否由本次啟動；`.playwright-mcp/` 截圖目錄路徑。不主動停 server 或刪截圖，由使用者決定。
