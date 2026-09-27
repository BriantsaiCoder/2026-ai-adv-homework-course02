# 前台重新設計切版計畫

## Context

依 `docs/design/` 設計稿（pencil 繪製，desktop 1440／mobile 390）重做前台八頁，並與綠界 ECPay 流程結合：商品頁 → 購物車 → 結帳 → 訂單確認 → 綠界付款 → 付款完成／未完成。後台頁面不在範圍內。

使用者已核准（2026-09-27）：

1. 結帳送出後改導向訂單確認頁 `/orders/:id`，再由該頁前往綠界。
2. 運費改由後端計入訂單金額（`total_amount` 與綠界 `TotalAmount` 一致）。
3. 設計稿新增項目全數實作：mobile 漢堡選單、首頁「本季主打」（`products[0]`）、商品格四欄每頁 8 件、麵包屑、「你可能也喜歡」、結帳「付款方式」區塊、訂單確認步驟。

## 設計系統

- 色彩 token 新增於 `public/css/input.css` `@theme`，保留舊 token 供後台使用：stem `#22382E`、rose `#A85B67`、petal `#C4727F`、tissue `#F7EEEA`、kraft `#C9A882`、sage-ink `#4F7A5A`、apricot-ink `#A8612F`、line `#E7E0DA`。
- 字型：標題 Noto Serif TC、內文 Noto Sans TC、價格數字 Fraunces、手寫附卡 LXGW WenKai TC。
- `body` 規則移入 `@layer base`，讓前台 utility class 可覆寫背景色。

## 實作步驟

1. **運費（後端）**：`src/routes/orderRoutes.js` 建立訂單時 `total_amount = 小計 + 運費`（小計未滿 NT$ 500 收 NT$ 150）。先於 `tests/orders.test.js` 寫 RED 測試（以 admin API 建立 NT$ 300 商品驗證收運費；既有 ≥ 500 商品驗證免運）。
2. **共用版型**：`views/layouts/front.ejs`（`<main>` 改為滿版，各頁自管容器）、`partials/header.ejs`（公告列、桌機導覽、mobile `<details>` 漢堡選單）、`partials/footer.ejs`、`partials/icon.ejs`（inline Lucide SVG）、`partials/checkout-steps.ejs`、`public/js/header-init.js`、`public/js/notification.js`。
3. **頁面**：`index`、`product-detail`、`cart`、`checkout`、`login`、`orders`、`order-detail`、`404` 之 EJS 與對應 `public/js/pages/*.js`。
4. **結帳導向**：`public/js/pages/checkout.js` 成功後導向 `/orders/:id`。
5. **訂單詳情狀態**：`pending`＝訂單確認頁；自綠界返回（`?payment=pending`）自動查詢，已付款＝付款完成頁、仍未付款＝付款未完成頁；`failed`＝付款失敗。小計／運費由 `total_amount − Σ品項` 推得，不改 schema。

## Rollback

- 運費：還原 `orderRoutes.js` 之 `total_amount` 計算（單一 commit 可 revert）。已建立之訂單金額不回寫，無資料遷移。
- 結帳導向：還原 `checkout.js` 導向為 `/ecpay/payment/:id`。
- 前台樣式：revert 該 feature branch 之前台 commit；後台未改動。

## 驗證

- `npm test`（含新增運費測試）全數通過。
- `npm run css:build` 成功。
- 瀏覽器實走流程（desktop 1440、mobile 390）：首頁 → 商品頁 → 加入購物車 → 結帳 → 訂單確認 → 綠界測試付款 → 返站付款完成；逐頁與 `docs/design/*.png` 對照。
