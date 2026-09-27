# 綠界 ECPay AIO 金流串接計畫

## Context

花卉電商專案目前已有完整的購物車 → 結帳 → 建立訂單流程，但付款僅為模擬（前端按鈕直接 PATCH 狀態）。需串接綠界 AIO 金流，讓使用者能跳轉至綠界付款頁面完成付款。

**關鍵限制**：專案僅運行於本地端，無法接收綠界 Server Notify（ReturnURL），因此付款結果改由本地端主動呼叫 `QueryTradeInfo` API 查詢驗證。使用 `SimulatePaid=1` 進行測試。

---

## 整體流程

```
結帳頁填寫收件資訊 → POST /api/orders 建立訂單
  → 前端導向 /ecpay/payment/:orderId
  → Server 產生 ECPay 參數 + CheckMacValue → 回傳自動送出的 HTML 表單
  → 瀏覽器 POST 至綠界付款頁 → 使用者完成付款
  → 綠界透過 ClientBackURL 導回 /orders/:orderId?payment=pending
  → 使用者點擊「查詢付款狀態」→ POST /api/orders/:id/check-payment
  → Server 呼叫 QueryTradeInfo API 驗證 → 更新訂單狀態
```

---

## 實作步驟

### Step 1: 新增 `src/utils/ecpay.js` — ECPay 工具函式

新建檔案，包含以下函式（使用 Node.js 內建 `crypto`，無需額外套件）：

- **`ecpayUrlEncode(str)`** — ECPay 專用 URL 編碼（encodeURIComponent → 替換 %20→+、~→%7e、'→%27 → 轉小寫 → 還原 .NET 特殊字元 %2d→- 等）
- **`generateCheckMacValue(params, hashKey, hashIV)`** — 排序參數 → 組合字串 → ecpayUrlEncode → SHA256 → 轉大寫
- **`verifyCheckMacValue(params, hashKey, hashIV)`** — 以 `crypto.timingSafeEqual` 做時序安全比對
- **`getMerchantTradeDate()`** — 產生台灣時區 `yyyy/MM/dd HH:mm:ss` 格式
- **`buildAioFormHtml(order, items, config)`** — 組合所有 ECPay 參數，產生自動送出 HTML 表單
- **`queryTradeInfo(merchantTradeNo, config)`** — POST 至 `QueryTradeInfo/V5`，解析 URL-encoded 回應

ECPay 設定從 `process.env` 讀取（ECPAY_MERCHANT_ID、ECPAY_HASH_KEY、ECPAY_HASH_IV）。

### Step 2: 修改 `src/database.js` — 新增 merchant_trade_no 欄位

在現有 CREATE TABLE 之後加入 ALTER TABLE migration：

```javascript
try {
  db.exec(`ALTER TABLE orders ADD COLUMN merchant_trade_no TEXT`);
} catch (e) { /* 欄位已存在，忽略 */ }
```

`merchant_trade_no` 由 `order_no` 去除連字號產生（如 `ORD20260412A1B2C`，16 字元，符合 ECPay 20 字元上限）。

### Step 3: 修改 `src/routes/orderRoutes.js`

**3a. POST `/` 建立訂單（line 80-178）**：
- 產生 `merchantTradeNo`（orderNo 去除 `-`）
- INSERT 時寫入 `merchant_trade_no`
- 回應中加入 `merchant_trade_no`

**3b. 新增 `POST /:id/check-payment`**：
- 查詢訂單（驗證 user_id 與 status === 'pending'）
- 呼叫 `queryTradeInfo(order.merchant_trade_no)`
- `TradeStatus === '1'` → 更新狀態為 `paid`，回傳成功
- 其他 → 回傳「尚未付款」訊息
- 遵循統一回應格式 `{ data, error, message }`

**3c. 保留 `PATCH /:id/pay`** 作為開發除錯用途。

### Step 4: 修改 `src/routes/pageRoutes.js` — 新增 ECPay 付款頁路由

新增 `GET /ecpay/payment/:orderId`：
- 從 DB 讀取訂單（含 order_items）
- 驗證訂單存在且狀態為 pending
- 呼叫 `buildAioFormHtml()` 產生 HTML
- `res.send(html)` 直接回傳（非 EJS 模板）
- `ClientBackURL` 設為 `${BASE_URL}/orders/${orderId}?payment=pending`
- `ReturnURL` 設為 `${BASE_URL}/ecpay/notify`（本地不會被呼叫，但為必填欄位）

### Step 5: 修改 `public/js/pages/checkout.js` — 導向 ECPay 付款

將 `submitOrder` 中成功後的導向從：
```javascript
window.location.href = '/orders/' + res.data.id;
```
改為：
```javascript
window.location.href = '/ecpay/payment/' + res.data.id;
```

### Step 6: 修改 `public/js/pages/order-detail.js` — 查詢付款狀態

- 移除 `simulatePay`、`handlePaySuccess`、`handlePayFail`
- 新增 `checkPayment()` — POST `/api/orders/:id/check-payment`，更新 order 狀態
- `onMounted` 中若 `paymentResult === 'pending'`，自動觸發 `checkPayment()`
- 回傳 `checkPayment` 供模板使用

### Step 7: 修改 `views/pages/order-detail.ejs` — 更新付款區域 UI

將原本的「付款成功」/「付款失敗」兩個按鈕替換為：
- **「查詢付款狀態」** 按鈕 — 呼叫 `checkPayment()`
- **「前往付款」** 連結 — 導向 `/ecpay/payment/:orderId`（可重新付款）
- 新增 `pending` 狀態訊息：「付款處理中，請點擊查詢付款狀態確認結果」

---

## 檔案變更總覽

| 檔案 | 動作 | 說明 |
|------|------|------|
| `src/utils/ecpay.js` | 新增 | ECPay 工具函式（編碼、簽章、表單、查詢） |
| `src/database.js` | 修改 | 新增 `merchant_trade_no` 欄位 |
| `src/routes/orderRoutes.js` | 修改 | 訂單建立加入 merchant_trade_no；新增 check-payment 端點 |
| `src/routes/pageRoutes.js` | 修改 | 新增 ECPay 付款表單頁路由 |
| `public/js/pages/checkout.js` | 修改 | 結帳後導向 ECPay 付款頁 |
| `public/js/pages/order-detail.js` | 修改 | 替換模擬付款為查詢付款狀態 |
| `views/pages/order-detail.ejs` | 修改 | 更新付款區域按鈕 |

---

## 驗證方式

1. `npm run start` 啟動伺服器
2. 瀏覽器開啟 → 加入商品至購物車 → 前往結帳
3. 填寫收件資訊 → 確認送出訂單
4. 應自動跳轉至綠界測試付款頁面
5. 使用測試信用卡 `4311-9522-2222-2222`（CVV 任意三碼、到期日任意未來日期、3D 驗證碼 `1234`）完成付款（或因 SimulatePaid=1 自動成功）
6. 綠界導回訂單詳情頁，顯示「付款處理中」訊息
7. 點擊「查詢付款狀態」→ 狀態應更新為「已付款」
