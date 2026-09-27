# 更新日誌

所有重大變更皆記錄於此文件。格式參考 [Keep a Changelog](https://keepachangelog.com/)。

## [Unreleased]

### Added
- 綠界 ECPay AIO 金流串接：結帳後導向綠界付款頁面完成真實付款流程
- 新增 `src/utils/ecpay.js` 工具模組：CheckMacValue 簽章產生/驗證、ECPay 專用 URL 編碼、QueryTradeInfo API 查詢
- 新增 `GET /ecpay/payment/:orderId` 頁面路由：產生自動送出的 ECPay 付款表單
- 新增 `POST /api/orders/:id/check-payment` API：透過 QueryTradeInfo API 主動查詢付款狀態（取代本地端無法接收的 Server Notify）
- 訂單新增 `merchant_trade_no` 欄位：對應綠界 MerchantTradeNo，由 order_no 去除連字號產生
- 前台設計稿（`docs/design/`，desktop 1440／mobile 390）與依稿切版之八頁前台：首頁（本季主打、四欄商品格）、商品頁（麵包屑、你可能也喜歡）、購物車（免運進度）、結帳（步驟條、付款方式）、訂單確認／付款完成／付款未完成、登入、我的訂單、404
- mobile 漢堡選單與 sticky 購買／結帳列
- GitHub Actions CI（`.github/workflows/ci.yml`）：PR 與 push 至 main 時執行 `npm ci` → `npm run css:build` → `npm test`

### Changed
- 訂單金額計入運費：小計未滿 NT$ 500 加收 NT$ 150（`total_amount` 與綠界 `TotalAmount` 一致）
- 結帳送出後改導向訂單確認頁 `/orders/:id`，由該頁前往綠界付款；自綠界返站後仍未付款即顯示「付款未完成」
- 訂單詳情頁面（order-detail.ejs / order-detail.js）：原「付款成功/失敗」模擬按鈕改為「查詢付款狀態」與「前往付款」按鈕；從綠界導回時自動觸發付款狀態查詢

### Fixed
- 訪客購物車於登入／註冊後遺失：`POST /api/auth/login`、`POST /api/auth/register` 帶 `X-Session-Id` 時，於 transaction 內將訪客品項併入使用者購物車（同商品數量相加、上限為庫存），結帳頁不再因空購物車被導回 `/cart`

## [1.0.0] - 2026-04-12

### 新增
- 使用者註冊、登入、個人資料 API
- 商品列表與詳情 API（公開）
- 購物車 CRUD API（雙模式認證：JWT / X-Session-Id）
- 訂單建立、查詢、模擬付款 API
- 後台商品管理 API（CRUD）
- 後台訂單查詢 API（含狀態篩選）
- EJS 前台頁面（首頁、商品詳情、購物車、結帳、訂單）
- EJS 後台頁面（商品管理、訂單管理）
- SQLite 資料庫自動初始化與種子資料
- Vitest 測試套件（6 個測試檔案，循序執行）
- Swagger/OpenAPI 文件生成
- Tailwind CSS 樣式系統
- 專案文件結構建立
