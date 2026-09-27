# 架構文件

## 目錄結構

```
├── app.js                          # Express 應用設定：view engine、靜態檔案、middleware 串接、路由掛載、404/錯誤處理
├── server.js                       # 伺服器啟動入口，監聽 PORT（預設 3001）
├── package.json                    # 專案設定與 npm scripts
├── vitest.config.js                # Vitest 測試設定（循序執行、檔案順序）
├── swagger-config.js               # Swagger/OpenAPI 設定（OpenAPI 3.0.3）
├── generate-openapi.js             # 從 JSDoc 註解生成 openapi.json
├── database.sqlite                 # SQLite 資料庫檔案（自動建立）
├── .env                            # 環境變數（不進版控）
├── .env.example                    # 環境變數範本
│
├── src/
│   ├── database.js                 # 資料庫初始化：建表、WAL 模式、foreign keys、種子資料（admin + 8 個花卉商品）
│   ├── middleware/
│   │   ├── authMiddleware.js       # JWT 驗證：解析 Bearer token → jwt.verify → 查 DB 確認用戶存在 → 設定 req.user
│   │   ├── adminMiddleware.js      # 管理員權限檢查：req.user.role === 'admin'，否則 403
│   │   ├── sessionMiddleware.js    # 提取 X-Session-Id header → 設定 req.sessionId（訪客購物車用）
│   │   └── errorHandler.js         # 全域錯誤處理：安全訊息對照表，500 一律回「伺服器內部錯誤」
│   ├── utils/
│   │   └── ecpay.js                # 綠界 ECPay 工具：CheckMacValue 簽章、URL 編碼、AIO 表單產生、QueryTradeInfo 查詢
│   └── routes/
│       ├── authRoutes.js           # 認證路由：註冊、登入、個人資料
│       ├── productRoutes.js        # 公開商品路由：列表（分頁）、詳情
│       ├── cartRoutes.js           # 購物車路由：CRUD（含 dualAuth 雙模式認證邏輯）
│       ├── orderRoutes.js          # 訂單路由：建立、列表、詳情、模擬付款、綠界付款查詢（全部需 JWT）
│       ├── adminProductRoutes.js   # 後台商品路由：CRUD（需 JWT + admin）
│       ├── adminOrderRoutes.js     # 後台訂單路由：列表（含狀態篩選）、詳情（需 JWT + admin）
│       └── pageRoutes.js           # 頁面路由：渲染 EJS 模板（無認證）+ 綠界付款表單頁
│
├── views/
│   ├── layouts/
│   │   ├── front.ejs               # 前台佈局包裹器（head + header + body + footer + pageScript）
│   │   └── admin.ejs               # 後台佈局包裹器（head + admin-header + sidebar + body）
│   ├── pages/
│   │   ├── index.ejs               # 首頁（商品卡片列表）
│   │   ├── product-detail.ejs      # 商品詳情頁
│   │   ├── cart.ejs                # 購物車頁面
│   │   ├── checkout.ejs            # 結帳頁面
│   │   ├── login.ejs               # 登入頁面
│   │   ├── orders.ejs              # 我的訂單頁面
│   │   ├── order-detail.ejs        # 訂單詳情頁面
│   │   ├── 404.ejs                 # 404 錯誤頁面
│   │   └── admin/
│   │       ├── products.ejs        # 後台商品管理頁面
│   │       └── orders.ejs          # 後台訂單管理頁面
│   └── partials/
│       ├── head.ejs                # HTML head 區塊
│       ├── header.ejs              # 前台導覽列
│       ├── admin-header.ejs        # 後台導覽列
│       ├── admin-sidebar.ejs       # 後台側邊欄
│       ├── footer.ejs              # 頁尾
│       └── notification.ejs        # 通知元件
│
├── public/
│   ├── css/
│   │   ├── input.css               # Tailwind CSS 輸入檔
│   │   └── output.css              # 編譯後的 CSS
│   ├── stylesheets/
│   │   └── style.css               # 額外自訂樣式
│   └── js/
│       ├── api.js                  # 前端 API 客戶端工具（fetch 封裝）
│       ├── auth.js                 # 前端認證輔助（token 管理）
│       ├── header-init.js          # 導覽列初始化
│       ├── notification.js         # 通知系統
│       └── pages/
│           ├── index.js            # 首頁腳本
│           ├── product-detail.js   # 商品詳情頁腳本
│           ├── cart.js             # 購物車頁腳本
│           ├── checkout.js         # 結帳頁腳本
│           ├── login.js            # 登入頁腳本
│           ├── orders.js           # 訂單列表頁腳本
│           ├── order-detail.js     # 訂單詳情頁腳本
│           ├── admin-products.js   # 後台商品管理腳本
│           └── admin-orders.js     # 後台訂單管理腳本
│
└── tests/
    ├── setup.js                    # 測試輔助：getAdminToken()、registerUser()
    ├── auth.test.js                # 認證 API 測試
    ├── products.test.js            # 商品 API 測試
    ├── cart.test.js                # 購物車 API 測試
    ├── orders.test.js              # 訂單 API 測試
    ├── adminProducts.test.js       # 後台商品 API 測試
    └── adminOrders.test.js         # 後台訂單 API 測試
```

## 啟動流程

```
server.js
  └─ require('./app')
       ├─ require('dotenv').config()           # 載入 .env
       ├─ require('./src/database')            # 初始化 DB（建表 + 種子資料）
       │    ├─ 建立 users, products, cart_items, orders, order_items 五張表
       │    ├─ seedAdminUser()                 # 若 admin 不存在則建立
       │    └─ seedProducts()                  # 若 products 為空則插入 8 筆花卉商品
       ├─ 設定 view engine (EJS)
       ├─ 掛載靜態檔案 (public/)
       ├─ 掛載全域 middleware
       │    ├─ cors({ origin: FRONTEND_URL })
       │    ├─ express.json()
       │    ├─ express.urlencoded()
       │    └─ sessionMiddleware               # 提取 X-Session-Id
       ├─ 掛載 API 路由
       │    ├─ /api/auth         → authRoutes
       │    ├─ /api/admin/products → adminProductRoutes (authMiddleware + adminMiddleware)
       │    ├─ /api/admin/orders   → adminOrderRoutes  (authMiddleware + adminMiddleware)
       │    ├─ /api/products     → productRoutes       (公開)
       │    ├─ /api/cart         → cartRoutes          (dualAuth)
       │    └─ /api/orders       → orderRoutes         (authMiddleware)
       ├─ 掛載頁面路由
       │    └─ /                 → pageRoutes          (公開)
       ├─ 404 handler（API 回 JSON，頁面回 EJS）
       └─ errorHandler（全域錯誤處理）
  └─ app.listen(PORT)                          # 預設 3001
```

## API 路由總覽表

### 認證（/api/auth）

| 方法 | 路徑 | 認證 | 說明 | 檔案 |
|------|------|------|------|------|
| POST | `/api/auth/register` | 無 | 註冊新帳號 | authRoutes.js |
| POST | `/api/auth/login` | 無 | 登入 | authRoutes.js |
| GET | `/api/auth/profile` | JWT | 取得個人資料 | authRoutes.js |

### 商品（/api/products）

| 方法 | 路徑 | 認證 | 說明 | 檔案 |
|------|------|------|------|------|
| GET | `/api/products` | 無 | 商品列表（分頁） | productRoutes.js |
| GET | `/api/products/:id` | 無 | 商品詳情 | productRoutes.js |

### 購物車（/api/cart）

| 方法 | 路徑 | 認證 | 說明 | 檔案 |
|------|------|------|------|------|
| GET | `/api/cart` | dualAuth | 查看購物車 | cartRoutes.js |
| POST | `/api/cart` | dualAuth | 加入商品 | cartRoutes.js |
| PATCH | `/api/cart/:itemId` | dualAuth | 修改數量 | cartRoutes.js |
| DELETE | `/api/cart/:itemId` | dualAuth | 移除項目 | cartRoutes.js |

### 訂單（/api/orders）

| 方法 | 路徑 | 認證 | 說明 | 檔案 |
|------|------|------|------|------|
| POST | `/api/orders` | JWT | 從購物車建立訂單 | orderRoutes.js |
| GET | `/api/orders` | JWT | 自己的訂單列表 | orderRoutes.js |
| GET | `/api/orders/:id` | JWT | 訂單詳情 | orderRoutes.js |
| PATCH | `/api/orders/:id/pay` | JWT | 模擬付款（開發除錯用） | orderRoutes.js |
| POST | `/api/orders/:id/check-payment` | JWT | 查詢綠界付款狀態 | orderRoutes.js |

### 後台商品（/api/admin/products）

| 方法 | 路徑 | 認證 | 說明 | 檔案 |
|------|------|------|------|------|
| GET | `/api/admin/products` | JWT + admin | 商品列表（分頁） | adminProductRoutes.js |
| POST | `/api/admin/products` | JWT + admin | 新增商品 | adminProductRoutes.js |
| PUT | `/api/admin/products/:id` | JWT + admin | 編輯商品 | adminProductRoutes.js |
| DELETE | `/api/admin/products/:id` | JWT + admin | 刪除商品 | adminProductRoutes.js |

### 後台訂單（/api/admin/orders）

| 方法 | 路徑 | 認證 | 說明 | 檔案 |
|------|------|------|------|------|
| GET | `/api/admin/orders` | JWT + admin | 訂單列表（分頁 + 狀態篩選） | adminOrderRoutes.js |
| GET | `/api/admin/orders/:id` | JWT + admin | 訂單詳情（含下單用戶資訊） | adminOrderRoutes.js |

### 頁面路由

| 路徑 | 說明 | 頁面腳本 |
|------|------|----------|
| `/` | 首頁 | pages/index.js |
| `/products/:id` | 商品詳情 | pages/product-detail.js |
| `/cart` | 購物車 | pages/cart.js |
| `/checkout` | 結帳 | pages/checkout.js |
| `/login` | 登入 | pages/login.js |
| `/orders` | 我的訂單 | pages/orders.js |
| `/orders/:id` | 訂單詳情 | pages/order-detail.js |
| `/ecpay/payment/:orderId` | 綠界付款表單（自動送出） | —（直接回傳 HTML） |
| `/admin/products` | 後台商品管理 | pages/admin-products.js |
| `/admin/orders` | 後台訂單管理 | pages/admin-orders.js |

## 統一回應格式

所有 API 端點皆使用以下 JSON 格式回應：

### 成功回應（2xx）

```json
{
  "data": { /* 操作結果，物件或陣列 */ },
  "error": null,
  "message": "操作成功的中文訊息"
}
```

### 列表回應（含分頁）

```json
{
  "data": {
    "products": [ /* ... */ ],
    "pagination": {
      "total": 50,
      "page": 1,
      "limit": 10,
      "totalPages": 5
    }
  },
  "error": null,
  "message": "成功"
}
```

### 錯誤回應（4xx/5xx）

```json
{
  "data": null,
  "error": "ERROR_CODE",
  "message": "中文錯誤訊息"
}
```

### 錯誤碼對照表

| 錯誤碼 | HTTP 狀態碼 | 說明 |
|--------|------------|------|
| `VALIDATION_ERROR` | 400 | 缺少必填欄位、格式不正確、數值超出範圍 |
| `STOCK_INSUFFICIENT` | 400 | 庫存不足 |
| `CART_EMPTY` | 400 | 購物車為空，無法建立訂單 |
| `INVALID_STATUS` | 400 | 訂單狀態不允許此操作（如非 pending 訂單嘗試付款） |
| `UNAUTHORIZED` | 401 | 未登入、Token 無效或已過期、使用者不存在 |
| `FORBIDDEN` | 403 | 權限不足（非管理員存取後台路由） |
| `NOT_FOUND` | 404 | 資源不存在（商品、訂單、購物車項目、使用者） |
| `CONFLICT` | 409 | 資源衝突（Email 已註冊、商品有未完成訂單無法刪除） |
| `INTERNAL_ERROR` | 500 | 伺服器內部錯誤（一律回「伺服器內部錯誤」，不洩露細節） |

## 認證與授權機制

### JWT 認證（authMiddleware）

- **位置**：`src/middleware/authMiddleware.js`
- **演算法**：HS256
- **有效期**：7 天（`expiresIn: '7d'`）
- **Token Payload**：`{ userId, email, role }`
- **驗證流程**：
  1. 檢查 `Authorization` header 是否存在且以 `Bearer ` 開頭
  2. 提取 token，呼叫 `jwt.verify()` 驗證簽章與過期時間
  3. 查詢資料庫確認 `userId` 對應的使用者仍然存在
  4. 設定 `req.user = { userId, email, role }`
- **失敗回應**：401，訊息依情境為「請先登入」/「Token 無效或已過期」/「使用者不存在，請重新登入」

### 管理員授權（adminMiddleware）

- **位置**：`src/middleware/adminMiddleware.js`
- **前置條件**：必須在 authMiddleware 之後使用
- **驗證邏輯**：`req.user.role === 'admin'`
- **失敗回應**：403 `FORBIDDEN`「權限不足」

### 雙模式認證（dualAuth）

- **位置**：`src/routes/cartRoutes.js`（路由內部函式）
- **僅用於**：購物車四個端點
- **流程**：
  1. 若有 `Authorization: Bearer <token>` header → 走 JWT 驗證（無效則立即 401）
  2. 若無 Bearer token，檢查 `req.sessionId`（由 sessionMiddleware 從 `X-Session-Id` header 提取）
  3. 若兩者皆無 → 401「請提供有效的登入 Token 或 X-Session-Id」
- **注意**：Session ID 無任何伺服器端驗證或持久化，純粹作為訪客識別用

### Session Middleware

- **位置**：`src/middleware/sessionMiddleware.js`
- **行為**：從 `X-Session-Id` request header 提取值，設定 `req.sessionId`
- **全域掛載**：所有請求皆經過此 middleware

## 資料庫 Schema

引擎：SQLite3（better-sqlite3，同步 API）  
檔案：`database.sqlite`（專案根目錄，自動建立）  
模式：WAL（Write-Ahead Logging），啟用 foreign keys

### users

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID v4 |
| email | TEXT | UNIQUE NOT NULL | 使用者信箱（區分大小寫） |
| password_hash | TEXT | NOT NULL | bcrypt 雜湊（salt rounds: 正式 10, 測試 1） |
| name | TEXT | NOT NULL | 使用者名稱 |
| role | TEXT | NOT NULL DEFAULT 'user', CHECK IN ('user','admin') | 角色 |
| created_at | TEXT | NOT NULL DEFAULT datetime('now') | 建立時間 |

### products

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID v4 |
| name | TEXT | NOT NULL | 商品名稱 |
| description | TEXT | 可為 NULL | 商品描述 |
| price | INTEGER | NOT NULL, CHECK(price > 0) | 價格（整數，單位：元） |
| stock | INTEGER | NOT NULL DEFAULT 0, CHECK(stock >= 0) | 庫存數量 |
| image_url | TEXT | 可為 NULL | 商品圖片 URL |
| created_at | TEXT | NOT NULL DEFAULT datetime('now') | 建立時間 |
| updated_at | TEXT | NOT NULL DEFAULT datetime('now') | 更新時間（更新商品時手動設定） |

### cart_items

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID v4 |
| session_id | TEXT | 可為 NULL | 訪客 session ID（與 user_id 互斥，由應用邏輯控制） |
| user_id | TEXT | 可為 NULL, FK → users.id | 登入使用者 ID |
| product_id | TEXT | NOT NULL, FK → products.id | 商品 ID |
| quantity | INTEGER | NOT NULL DEFAULT 1, CHECK(quantity > 0) | 數量 |

### orders

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID v4 |
| order_no | TEXT | UNIQUE NOT NULL | 訂單編號，格式：`ORD-YYYYMMDD-XXXXX`（5 碼 UUID 前綴大寫） |
| user_id | TEXT | NOT NULL, FK → users.id | 下單使用者 ID |
| recipient_name | TEXT | NOT NULL | 收件人姓名 |
| recipient_email | TEXT | NOT NULL | 收件人 Email |
| recipient_address | TEXT | NOT NULL | 收件地址 |
| total_amount | INTEGER | NOT NULL | 訂單總金額 |
| status | TEXT | NOT NULL DEFAULT 'pending', CHECK IN ('pending','paid','failed') | 訂單狀態 |
| merchant_trade_no | TEXT | 可為 NULL | 綠界交易編號（由 order_no 去除連字號產生，如 `ORD20260412A1B2C`） |
| created_at | TEXT | NOT NULL DEFAULT datetime('now') | 建立時間 |

### order_items

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID v4 |
| order_id | TEXT | NOT NULL, FK → orders.id | 訂單 ID |
| product_id | TEXT | NOT NULL | 商品 ID（參考用，商品可能已刪除） |
| product_name | TEXT | NOT NULL | 下單時的商品名稱快照 |
| product_price | INTEGER | NOT NULL | 下單時的商品價格快照 |
| quantity | INTEGER | NOT NULL | 購買數量 |

## 資料流：訂單建立流程

這是系統中最複雜的操作，使用 `db.transaction()` 確保原子性：

```
用戶呼叫 POST /api/orders (需 JWT)
│
├─ 1. 驗證收件人資訊（recipientName, recipientEmail, recipientAddress）
├─ 2. 取得用戶購物車所有品項（JOIN products 取得即時價格與庫存）
├─ 3. 檢查購物車是否為空 → 400 CART_EMPTY
├─ 4. 檢查每個品項庫存是否充足 → 400 STOCK_INSUFFICIENT（列出所有不足商品名稱）
├─ 5. 計算 totalAmount = Σ(price × quantity)
├─ 6. 生成 orderNo: ORD-YYYYMMDD-{5碼UUID}
│
└─ 7. 🔒 Transaction 開始
     ├─ INSERT orders 記錄
     ├─ 對每個購物車品項：
     │   ├─ INSERT order_items（快照 product_name, product_price）
     │   └─ UPDATE products SET stock = stock - quantity
     └─ DELETE cart_items WHERE user_id = ?
     🔒 Transaction 結束
│
└─ 8. 回傳 201 + 訂單詳情
```

## 綠界金流付款流程

本系統整合綠界 ECPay AIO 金流。因專案運行於本地端，無法接收綠界 Server Notify（ReturnURL），故採用主動查詢架構：

```
用戶結帳 → POST /api/orders（建立訂單，含 merchant_trade_no）
  │
  ├─ 前端導向 GET /ecpay/payment/:orderId
  │    └─ Server 產生 ECPay AIO 參數（MerchantTradeNo, TotalAmount, ItemName 等）
  │    └─ 計算 CheckMacValue（SHA256，ECPay 專用 URL 編碼）
  │    └─ 回傳自動送出 HTML 表單 → 瀏覽器 POST 至綠界
  │
  ├─ 使用者在綠界付款頁面完成付款
  │
  ├─ 綠界透過 ClientBackURL 將瀏覽器導回
  │    └─ /orders/:orderId?payment=pending
  │
  └─ 付款驗證
       └─ POST /api/orders/:id/check-payment
            ├─ 呼叫綠界 QueryTradeInfo API（TimeStamp 每次重新產生）
            ├─ TradeStatus === '1' → 更新訂單狀態為 paid
            └─ 其他 → 回傳「尚未完成付款」
```

### ECPay 設定

環境變數（`.env`）：

| 變數 | 說明 | 測試值 |
|------|------|--------|
| `ECPAY_MERCHANT_ID` | 特店編號 | 3002607 |
| `ECPAY_HASH_KEY` | 雜湊金鑰 | pwFHCqoQZGmho4w6 |
| `ECPAY_HASH_IV` | 雜湊向量 | EkRm7iFT261dpevs |
| `ECPAY_ENV` | 環境（staging / production） | staging |

### 付款模擬端點（開發除錯用）

保留模擬付款端點供開發除錯使用：

```
PATCH /api/orders/:id/pay
Body: { "action": "success" | "fail" }

狀態機：
  pending ──success──→ paid
  pending ──fail────→ failed
  paid / failed → 400 INVALID_STATUS（不可逆）
```
