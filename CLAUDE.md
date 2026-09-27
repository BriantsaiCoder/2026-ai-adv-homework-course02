# CLAUDE.md

## 專案概述
花卉電商網站（backend-project） — Node.js + Express + SQLite + EJS + Tailwind CSS 全端電商平台

## 常用指令
```bash
npm run start          # 編譯 CSS 並啟動伺服器
npm run dev:server     # 僅啟動伺服器（不編譯 CSS）
npm run dev:css        # Tailwind CSS watch 模式
npm run css:build      # 編譯並壓縮 CSS
npm run test           # 執行測試（vitest run，循序執行）
npm run openapi        # 從 JSDoc 生成 openapi.json
```

## 關鍵規則
- 所有 API 回應統一格式：`{ data, error, message }`，錯誤時 `data: null`
- 購物車使用**雙模式認證**（dualAuth）：優先 JWT，fallback 到 `X-Session-Id`；建立訂單僅支援 JWT
- 訂單建立使用 `db.transaction()` 原子操作：建立訂單 → 寫入品項快照 → 扣庫存 → 清空購物車
- 資料庫為 SQLite（better-sqlite3 同步 API），WAL 模式，foreign keys 啟用
- 功能開發使用 docs/plans/ 記錄計畫；完成後移至 docs/plans/archive/

## 詳細文件
- ./docs/README.md — 項目介紹與快速開始
- ./docs/ARCHITECTURE.md — 架構、目錄結構、資料流
- ./docs/DEVELOPMENT.md — 開發規範、命名規則
- ./docs/FEATURES.md — 功能列表與完成狀態
- ./docs/TESTING.md — 測試規範與指南
- ./docs/CHANGELOG.md — 更新日誌

## 回覆的語氣
- 請採用文言文的方式，回覆我訊息，以節省回覆的 token（開發上不需要特別節省）