# 開發規範

## 命名規則對照表

| 類別 | 規則 | 範例 |
|------|------|------|
| 檔案名稱（路由） | camelCase | `authRoutes.js`, `adminProductRoutes.js` |
| 檔案名稱（middleware） | camelCase | `authMiddleware.js`, `errorHandler.js` |
| 檔案名稱（測試） | camelCase + `.test.js` | `auth.test.js`, `adminOrders.test.js` |
| 檔案名稱（前端 JS） | kebab-case | `header-init.js`, `admin-products.js` |
| 檔案名稱（EJS 模板） | kebab-case | `product-detail.ejs`, `order-detail.ejs` |
| 資料庫表名 | snake_case（複數） | `users`, `cart_items`, `order_items` |
| 資料庫欄位名 | snake_case | `user_id`, `created_at`, `password_hash` |
| API 路徑 | kebab-case | `/api/auth/register`, `/api/admin/products` |
| Request Body 欄位 | camelCase | `productId`, `recipientName`, `recipientEmail` |
| Response 欄位 | snake_case（與 DB 一致） | `order_no`, `total_amount`, `image_url` |
| JavaScript 變數 | camelCase | `cartItems`, `totalAmount`, `orderNo` |
| JavaScript 函式 | camelCase | `dualAuth()`, `getOwnerCondition()`, `generateOrderNo()` |
| 環境變數 | UPPER_SNAKE_CASE | `JWT_SECRET`, `ADMIN_EMAIL`, `FRONTEND_URL` |

> **注意**：Request Body 使用 camelCase，但 Response 使用 snake_case（直接映射資料庫欄位）。此為現有設計決策。

## 模組系統

本專案使用 **CommonJS**（`require` / `module.exports`）。

```javascript
// 引入
const express = require('express');
const db = require('../database');
const authMiddleware = require('../middleware/authMiddleware');

// 匯出
module.exports = router;
module.exports = authMiddleware;
module.exports = db;
```

注意事項：
- `vitest.config.js` 使用 ESM（`import`），因為 Vitest 要求
- 測試檔案（`tests/*.test.js`）使用 CommonJS
- 前端 JS（`public/js/`）在瀏覽器中以 `<script>` 載入，使用全域變數模式

## 新增 API 端點步驟

1. **建立或選擇路由檔案**：在 `src/routes/` 下，依功能分類
2. **定義路由**：

```javascript
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  // 驗證輸入
  // 執行業務邏輯
  // 回傳統一格式
  res.json({
    data: { /* 結果 */ },
    error: null,
    message: '成功'
  });
});

module.exports = router;
```

3. **掛載路由**：在 `app.js` 中加入：

```javascript
app.use('/api/your-path', require('./src/routes/yourRoutes'));
```

4. **加入認證**（如需要）：

```javascript
// 全路由認證
router.use(authMiddleware);
router.use(authMiddleware, adminMiddleware);

// 單一路由認證
router.get('/profile', authMiddleware, (req, res) => { ... });
```

5. **撰寫 JSDoc**（用於 OpenAPI 生成）：

```javascript
/**
 * @openapi
 * /api/your-path:
 *   get:
 *     summary: 端點說明
 *     tags: [YourTag]
 *     ...
 */
```

6. **撰寫測試**：在 `tests/` 下新增對應測試檔案
7. **更新 vitest.config.js**：在 `sequence.files` 中加入新測試檔案（注意順序依賴）

## 新增 Middleware 步驟

1. 在 `src/middleware/` 下建立檔案
2. 遵循以下結構：

```javascript
function yourMiddleware(req, res, next) {
  // 邏輯處理
  // 成功：呼叫 next()
  // 失敗：直接回應
  if (/* 失敗條件 */) {
    return res.status(4xx).json({
      data: null,
      error: 'ERROR_CODE',
      message: '中文錯誤訊息'
    });
  }
  next();
}

module.exports = yourMiddleware;
```

3. 在 `app.js`（全域）或路由檔案（局部）中掛載

## 新增資料庫表步驟

1. 在 `src/database.js` 的 `initializeDatabase()` 中加入 `CREATE TABLE IF NOT EXISTS` 語句
2. ID 使用 `uuid.v4()` 生成的 TEXT 類型
3. 時間欄位使用 `TEXT DEFAULT (datetime('now'))`
4. 加入適當的 `CHECK` 約束和 `FOREIGN KEY`
5. 若需要種子資料，在 `initializeDatabase()` 中新增 seed 函式

```sql
CREATE TABLE IF NOT EXISTS your_table (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (ref_id) REFERENCES other_table(id)
);
```

## 環境變數表

| 變數 | 用途 | 必要性 | 預設值 |
|------|------|--------|--------|
| `JWT_SECRET` | JWT 簽章密鑰 | **必要**（缺少會崩潰） | 無 |
| `PORT` | 伺服器監聽埠號 | 選填 | `3001` |
| `BASE_URL` | 伺服器基礎 URL | 選填 | `http://localhost:3001` |
| `FRONTEND_URL` | CORS 允許來源 | 選填 | `http://localhost:3001`（app.js fallback） |
| `ADMIN_EMAIL` | 種子管理員信箱 | 選填 | `admin@hexschool.com` |
| `ADMIN_PASSWORD` | 種子管理員密碼 | 選填 | `12345678` |
| `NODE_ENV` | 執行環境 | 選填 | 無（影響 bcrypt salt rounds：`test` → 1，其他 → 10） |
| `ECPAY_MERCHANT_ID` | 綠界商店代號 | 選填（目前未使用） | `3002607` |
| `ECPAY_HASH_KEY` | 綠界 HashKey | 選填（目前未使用） | — |
| `ECPAY_HASH_IV` | 綠界 HashIV | 選填（目前未使用） | — |
| `ECPAY_ENV` | 綠界環境 | 選填（目前未使用） | `staging` |

## JSDoc / OpenAPI 格式說明

路由檔案中使用 `@openapi` JSDoc 標記，供 `swagger-jsdoc` 解析生成 OpenAPI 3.0.3 規格。

### 範例

```javascript
/**
 * @openapi
 * /api/products:
 *   get:
 *     summary: 取得商品列表
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     products:
 *                       type: array
 *                       items:
 *                         type: object
 *                     pagination:
 *                       type: object
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 */
```

### 標記規則

- `tags`：功能分類，使用 `[Auth]`、`[Products]`、`[Cart]`、`[Orders]`、`[Admin Products]`、`[Admin Orders]`
- `security`：需認證的端點加上 `- bearerAuth: []`，購物車端點同時列出 `- sessionId: []`
- `responses`：每個可能的 HTTP 狀態碼都應列出（200/201/400/401/403/404/409）
- 所有回應 schema 必須包含 `data`、`error`、`message` 三個頂層欄位

## 計畫歸檔流程

1. 計畫檔案命名格式：`YYYY-MM-DD-<feature-name>.md`
2. 計畫文件結構：User Story → Spec → Tasks
3. 功能完成後：移至 `docs/plans/archive/`
4. 更新 `docs/FEATURES.md` 和 `docs/CHANGELOG.md`

### 計畫範本

```markdown
# YYYY-MM-DD 功能名稱

## User Story
作為 [角色]，我希望 [功能]，以便 [目的]。

## Spec
### API 規格
- 端點、方法、認證、Request/Response

### 資料庫變更
- 新增/修改的表與欄位

### 業務規則
- 驗證邏輯、錯誤處理、邊界條件

## Tasks
- [ ] 建立資料庫遷移
- [ ] 實作 API 端點
- [ ] 撰寫測試
- [ ] 更新文件
```
