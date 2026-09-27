# 功能清單與完成狀態

## 功能總覽

| 功能區塊 | 狀態 | 說明 |
|----------|------|------|
| 使用者認證 | ✅ 完成 | 註冊、登入、個人資料 |
| 商品瀏覽 | ✅ 完成 | 公開商品列表與詳情 |
| 購物車管理 | ✅ 完成 | 雙模式認證（JWT / Session ID） |
| 訂單管理 | ✅ 完成 | 建立、查詢、模擬付款 |
| 綠界金流串接 | ✅ 完成 | ECPay AIO 付款、QueryTradeInfo 查詢驗證 |
| 後台商品管理 | ✅ 完成 | 商品 CRUD |
| 後台訂單管理 | ✅ 完成 | 訂單查詢與狀態篩選 |
| 前台頁面 | ✅ 完成 | EJS + Tailwind CSS |
| 後台頁面 | ✅ 完成 | EJS + Tailwind CSS |
| 測試 | ✅ 完成 | Vitest + supertest，6 個測試檔案 |
| API 文件 | ✅ 完成 | Swagger/OpenAPI 生成 |

---

## 使用者認證

### POST /api/auth/register — 註冊新帳號

**行為描述**：建立新使用者帳號並回傳 JWT token，讓使用者註冊後立即處於登入狀態。

**Request Body**：

| 欄位 | 型別 | 必填 | 驗證規則 |
|------|------|------|----------|
| email | string | 是 | 符合 `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`，全域唯一 |
| password | string | 是 | 最少 6 字元 |
| name | string | 是 | 非空 |

**業務邏輯**：
- 密碼以 bcrypt 雜湊儲存（正式環境 salt rounds = 10，測試環境 = 1）
- 新使用者 role 固定為 `'user'`，無法透過 API 建立 admin
- Email 唯一性由資料庫 UNIQUE 約束保證

**錯誤情境**：

| 狀態碼 | 錯誤碼 | 情境 |
|--------|--------|------|
| 400 | VALIDATION_ERROR | 缺少 email / password / name |
| 400 | VALIDATION_ERROR | Email 格式不正確 |
| 400 | VALIDATION_ERROR | 密碼少於 6 字元 |
| 409 | CONFLICT | Email 已被註冊 |

### POST /api/auth/login — 登入

**行為描述**：驗證帳密並回傳 JWT token。登入失敗時使用模糊訊息（「Email 或密碼錯誤」），防止使用者列舉攻擊。

**Request Body**：

| 欄位 | 型別 | 必填 |
|------|------|------|
| email | string | 是 |
| password | string | 是 |

**業務邏輯**：
- 使用 `bcrypt.compareSync()` 比對密碼
- 無論是 email 不存在或密碼錯誤，一律回 401 + 相同訊息
- Token 有效期 7 天，payload 包含 `{ userId, email, role }`

**錯誤情境**：

| 狀態碼 | 錯誤碼 | 情境 |
|--------|--------|------|
| 400 | VALIDATION_ERROR | 缺少 email / password |
| 401 | UNAUTHORIZED | Email 不存在或密碼錯誤 |

### GET /api/auth/profile — 取得個人資料

**行為描述**：回傳當前登入使用者的基本資料。需要有效的 JWT token。

**認證**：JWT（authMiddleware）

**回應欄位**：id, email, name, role, created_at

**錯誤情境**：

| 狀態碼 | 錯誤碼 | 情境 |
|--------|--------|------|
| 401 | UNAUTHORIZED | 未提供 token / token 無效或過期 |
| 404 | NOT_FOUND | 使用者已被刪除（token 仍有效但 DB 中已不存在） |

---

## 商品瀏覽

### GET /api/products — 商品列表

**行為描述**：公開端點，回傳分頁商品列表，依建立時間降序排列。

**Query 參數**：

| 參數 | 型別 | 預設值 | 範圍 |
|------|------|--------|------|
| page | integer | 1 | ≥ 1 |
| limit | integer | 10 | 1 ~ 100 |

**業務邏輯**：
- 分頁計算：`offset = (page - 1) * limit`
- 無效 page/limit 值自動修正（`parseInt` 失敗則取預設值，再以 `Math.max`/`Math.min` 限制範圍）
- 回傳 pagination 物件：`{ total, page, limit, totalPages }`

### GET /api/products/:id — 商品詳情

**行為描述**：公開端點，回傳單一商品完整資訊。

**錯誤情境**：

| 狀態碼 | 錯誤碼 | 情境 |
|--------|--------|------|
| 404 | NOT_FOUND | 商品 ID 不存在 |

---

## 購物車管理

> **認證模式**：dualAuth — 優先 JWT，若無則使用 X-Session-Id header。兩者皆無則 401。

### GET /api/cart — 查看購物車

**行為描述**：回傳當前使用者/訪客的購物車品項列表與總金額。品項包含即時商品資訊（名稱、價格、庫存、圖片）。

**回應結構**：
```json
{
  "data": {
    "items": [
      {
        "id": "cart_item_id",
        "product_id": "product_id",
        "quantity": 2,
        "product": {
          "name": "粉色玫瑰花束",
          "price": 1680,
          "stock": 30,
          "image_url": "https://..."
        }
      }
    ],
    "total": 3360
  }
}
```

**業務邏輯**：
- total 為即時計算：`Σ(product.price × quantity)`
- 使用 `getOwnerCondition()` 判斷查詢條件：JWT 用 `user_id`，訪客用 `session_id`

### POST /api/cart — 加入商品到購物車

**行為描述**：將指定商品加入購物車。若商品已在購物車中，**累加數量**而非建立新項目。

**Request Body**：

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| productId | string | 是 | 商品 ID |
| quantity | integer | 否 | 數量，預設 1，必須為正整數 |

**業務邏輯**：
1. 檢查 productId 是否存在 → 404
2. 檢查商品是否已在購物車中
   - **已存在**：計算 `newQty = existingQty + qty`，檢查 `newQty ≤ stock`，通過則 UPDATE
   - **不存在**：檢查 `qty ≤ stock`，通過則 INSERT
3. 庫存檢查在加入時執行（非下單時才檢查）

**錯誤情境**：

| 狀態碼 | 錯誤碼 | 情境 |
|--------|--------|------|
| 400 | VALIDATION_ERROR | 缺少 productId |
| 400 | VALIDATION_ERROR | quantity 不是正整數 |
| 400 | STOCK_INSUFFICIENT | 數量超過庫存（含累加後） |
| 404 | NOT_FOUND | 商品不存在 |

### PATCH /api/cart/:itemId — 修改數量

**行為描述**：直接設定購物車品項的新數量（非累加）。

**Request Body**：

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| quantity | integer | 是 | 新數量，必須為正整數 |

**業務邏輯**：
- 所有權檢查：品項必須屬於當前使用者/session
- 庫存檢查：新數量不得超過商品庫存
- 數量為絕對值設定（直接取代，非增減）

**錯誤情境**：

| 狀態碼 | 錯誤碼 | 情境 |
|--------|--------|------|
| 400 | VALIDATION_ERROR | quantity 不是正整數 |
| 400 | STOCK_INSUFFICIENT | 數量超過庫存 |
| 404 | NOT_FOUND | 品項不存在或非本人所有 |

### DELETE /api/cart/:itemId — 移除品項

**行為描述**：從購物車移除指定品項。

**業務邏輯**：
- 所有權檢查：品項必須屬於當前使用者/session
- 無批次刪除（清空購物車需逐一刪除）

**錯誤情境**：

| 狀態碼 | 錯誤碼 | 情境 |
|--------|--------|------|
| 404 | NOT_FOUND | 品項不存在或非本人所有 |

---

## 訂單管理

> **認證模式**：全部需要 JWT（authMiddleware），不支援訪客下單。

### POST /api/orders — 建立訂單

**行為描述**：將購物車品項轉換為訂單。使用資料庫 transaction 確保「建立訂單 + 品項快照 + 扣庫存 + 清空購物車」的原子性。

**Request Body**：

| 欄位 | 型別 | 必填 | 驗證規則 |
|------|------|------|----------|
| recipientName | string | 是 | 非空 |
| recipientEmail | string | 是 | 符合 email 正則 |
| recipientAddress | string | 是 | 非空 |

**業務邏輯**：
1. 驗證收件人三個欄位皆存在
2. 驗證 recipientEmail 格式
3. 從 `cart_items JOIN products` 取得購物車品項（僅查 `user_id`，不含 session）
4. 購物車為空 → 400 CART_EMPTY
5. 逐品項檢查庫存，不足者收集名稱 → 400「以下商品庫存不足：名稱1, 名稱2」
6. 計算 `totalAmount = Σ(price × quantity)`
7. 生成 `orderNo = ORD-YYYYMMDD-{5碼UUID大寫}`
8. **Transaction**：INSERT order → INSERT order_items（快照名稱+價格） → UPDATE stock → DELETE cart_items
9. 回傳 201 + 訂單詳情

**錯誤情境**：

| 狀態碼 | 錯誤碼 | 情境 |
|--------|--------|------|
| 400 | VALIDATION_ERROR | 缺少收件人欄位 |
| 400 | VALIDATION_ERROR | Email 格式不正確 |
| 400 | CART_EMPTY | 購物車為空 |
| 400 | STOCK_INSUFFICIENT | 庫存不足（訊息中列出所有不足商品名稱） |

### GET /api/orders — 訂單列表

**行為描述**：回傳當前使用者的所有訂單，依建立時間降序排列。無分頁。

**回應欄位**：id, order_no, total_amount, status, created_at

### GET /api/orders/:id — 訂單詳情

**行為描述**：回傳訂單完整資訊（含品項列表）。僅能查看自己的訂單。

**業務邏輯**：
- 查詢條件含 `user_id`，他人訂單視為 404
- order_items 中的 product_name / product_price 為下單時快照

**錯誤情境**：

| 狀態碼 | 錯誤碼 | 情境 |
|--------|--------|------|
| 404 | NOT_FOUND | 訂單不存在或非本人所有 |

### PATCH /api/orders/:id/pay — 模擬付款（開發除錯用）

**行為描述**：模擬付款結果，更新訂單狀態。不涉及真實金流，保留作為開發除錯工具。正式付款流程請使用綠界金流。

**Request Body**：

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| action | string | 是 | `"success"` → 狀態改 paid；`"fail"` → 狀態改 failed |

**業務邏輯**：
- 訂單狀態機：`pending → paid` 或 `pending → failed`（不可逆）
- 僅能操作自己的訂單
- 非 pending 狀態的訂單無法付款

**錯誤情境**：

| 狀態碼 | 錯誤碼 | 情境 |
|--------|--------|------|
| 400 | VALIDATION_ERROR | action 不是 success 或 fail |
| 400 | INVALID_STATUS | 訂單狀態不是 pending |
| 404 | NOT_FOUND | 訂單不存在或非本人所有 |

---

## 綠界金流串接（ECPay AIO）

> **認證模式**：付款查詢需 JWT（authMiddleware）；付款頁面路由為公開（orderId 為 UUID 不可猜測）。

### 整體付款流程

```
結帳送出訂單 → POST /api/orders 建立訂單（含 merchant_trade_no）
  → 前端導向 GET /ecpay/payment/:orderId
  → Server 產生 ECPay 參數 + CheckMacValue → 回傳自動送出 HTML 表單
  → 瀏覽器 POST 至綠界付款頁 → 使用者完成付款
  → 綠界透過 ClientBackURL 導回 /orders/:orderId?payment=pending
  → 使用者點擊「查詢付款狀態」或頁面自動觸發查詢
  → POST /api/orders/:id/check-payment → Server 呼叫 QueryTradeInfo API
  → 驗證成功則更新訂單狀態為 paid
```

### GET /ecpay/payment/:orderId — 綠界付款頁面

**行為描述**：產生包含所有 ECPay AIO 參數的 HTML 表單，瀏覽器載入後自動 POST 至綠界付款頁面，將使用者導向綠界完成付款。

**業務邏輯**：
- 從 DB 讀取訂單與品項資訊
- 訂單不存在 → 404
- 訂單狀態非 pending → 302 重導至訂單詳情頁
- 產生 ECPay 所需參數：MerchantID、MerchantTradeNo、MerchantTradeDate（台灣時區）、TotalAmount、ItemName（商品名稱以 `#` 連接，上限 400 bytes）等
- 計算 CheckMacValue（SHA256，ECPay 專用 URL 編碼）
- 設定 ClientBackURL 為 `/orders/:orderId?payment=pending`（付款後瀏覽器導回）
- 設定 ReturnURL 為 `${BASE_URL}/ecpay/notify`（本地端不會被呼叫，但為必填欄位）
- 回傳 Content-Type: text/html，瀏覽器自動送出表單

**ECPay 參數**：

| 參數 | 值 | 說明 |
|------|------|------|
| MerchantID | 環境變數 `ECPAY_MERCHANT_ID` | 測試：3002607 |
| MerchantTradeNo | 訂單的 `merchant_trade_no` | 由 order_no 去除連字號產生，最多 20 字元 |
| PaymentType | `aio` | 固定值 |
| ChoosePayment | `ALL` | 顯示所有付款方式 |
| EncryptType | `1` | SHA256 |

### POST /api/orders/:id/check-payment — 查詢綠界付款狀態

**行為描述**：透過綠界 QueryTradeInfo API 主動查詢付款結果。因本專案運行於本地端，無法接收綠界 Server Notify，故以此端點替代。

**認證**：JWT（authMiddleware）

**業務邏輯**：
1. 查詢訂單（驗證 user_id 與訂單存在）
2. 訂單已非 pending → 直接回傳現有狀態
3. 訂單無 `merchant_trade_no` → 400
4. 呼叫綠界 `POST /Cashier/QueryTradeInfo/V5`（TimeStamp 每次重新產生，有效期 3 分鐘）
5. 驗證回應中的 CheckMacValue
6. `TradeStatus === '1'` → 更新訂單狀態為 `paid`，回傳成功
7. 其他 TradeStatus → 回傳「尚未完成付款」

**錯誤情境**：

| 狀態碼 | 錯誤碼 | 情境 |
|--------|--------|------|
| 400 | NO_TRADE_NO | 訂單無綠界交易編號 |
| 404 | NOT_FOUND | 訂單不存在或非本人所有 |
| 500 | ECPAY_QUERY_ERROR | 呼叫綠界 API 失敗 |

### ECPay 工具模組（src/utils/ecpay.js）

提供以下核心函式：

| 函式 | 說明 |
|------|------|
| `ecpayUrlEncode(str)` | ECPay 專用 URL 編碼（.NET 相容規則） |
| `generateCheckMacValue(params, hashKey, hashIV)` | 產生 SHA256 簽章 |
| `verifyCheckMacValue(params, hashKey, hashIV)` | 時序安全驗證簽章（crypto.timingSafeEqual） |
| `getMerchantTradeDate()` | 產生台灣時區日期字串（yyyy/MM/dd HH:mm:ss） |
| `buildAioFormHtml(order, items, config)` | 產生自動送出的 ECPay 付款表單 HTML |
| `queryTradeInfo(merchantTradeNo, config)` | 呼叫 QueryTradeInfo API 查詢交易狀態 |

### 測試資訊

| 項目 | 值 |
|------|------|
| 測試 MerchantID | 3002607 |
| 測試信用卡 | 4311-9522-2222-2222 |
| CVV | 任意三碼 |
| 到期日 | 任意未來日期 |
| 3D 驗證碼 | 1234 |

---

## 後台商品管理

> **認證模式**：全部需要 JWT + admin 角色（authMiddleware + adminMiddleware）。

### GET /api/admin/products — 商品列表

**行為描述**：與公開商品列表相同邏輯，但需管理員權限。分頁參數同上。

### POST /api/admin/products — 新增商品

**Request Body**：

| 欄位 | 型別 | 必填 | 驗證規則 |
|------|------|------|----------|
| name | string | 是 | 非空 |
| price | integer | 是 | 正整數（> 0） |
| stock | integer | 是 | 非負整數（≥ 0） |
| description | string | 否 | 未提供則為 null |
| image_url | string | 否 | 未提供則為 null |

**錯誤情境**：

| 狀態碼 | 錯誤碼 | 情境 |
|--------|--------|------|
| 400 | VALIDATION_ERROR | name 為空 |
| 400 | VALIDATION_ERROR | price 不是正整數 |
| 400 | VALIDATION_ERROR | stock 不是非負整數 |

### PUT /api/admin/products/:id — 編輯商品

**行為描述**：部分更新商品。僅提供的欄位會被更新，未提供的保留原值。更新時自動設定 `updated_at = datetime('now')`。

**Request Body**：所有欄位皆為選填，驗證規則同新增。

**額外驗證**：
- name 若提供但為空字串 → 400「商品名稱不能為空」

**錯誤情境**：

| 狀態碼 | 錯誤碼 | 情境 |
|--------|--------|------|
| 404 | NOT_FOUND | 商品不存在 |
| 400 | VALIDATION_ERROR | 欄位驗證失敗 |

### DELETE /api/admin/products/:id — 刪除商品

**行為描述**：刪除商品。若商品存在於 pending 狀態的訂單中，則拒絕刪除。

**業務邏輯**：
- 查詢 `order_items JOIN orders` 計算 pending 訂單中包含此商品的數量
- `count > 0` → 409 CONFLICT
- paid / failed 訂單不會阻擋刪除（因品項已快照）

**錯誤情境**：

| 狀態碼 | 錯誤碼 | 情境 |
|--------|--------|------|
| 404 | NOT_FOUND | 商品不存在 |
| 409 | CONFLICT | 商品存在未完成訂單，無法刪除 |

---

## 後台訂單管理

### GET /api/admin/orders — 訂單列表

**行為描述**：回傳所有使用者的訂單，支援分頁與狀態篩選。

**Query 參數**：

| 參數 | 型別 | 預設值 | 說明 |
|------|------|--------|------|
| page | integer | 1 | 頁碼 |
| limit | integer | 10 | 每頁筆數（1~100） |
| status | string | 無 | 篩選：`pending` / `paid` / `failed`，其他值忽略 |

**業務邏輯**：
- status 參數使用白名單驗證：只接受 `['pending', 'paid', 'failed']`，其他值視為未提供
- 回傳所有訂單欄位（含 user_id, recipient_name, recipient_email）

### GET /api/admin/orders/:id — 訂單詳情

**行為描述**：回傳訂單完整資訊，額外包含下單使用者的 name 和 email。無所有權限制。

**回應額外欄位**：
```json
{
  "user": {
    "name": "使用者名稱",
    "email": "user@example.com"
  }
}
```

**錯誤情境**：

| 狀態碼 | 錯誤碼 | 情境 |
|--------|--------|------|
| 404 | NOT_FOUND | 訂單不存在 |
