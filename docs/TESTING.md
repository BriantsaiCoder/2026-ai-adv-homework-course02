# 測試規範與指南

## 測試框架

| 工具 | 用途 |
|------|------|
| [Vitest](https://vitest.dev/) | 測試執行器（相容 Jest API） |
| [supertest](https://github.com/ladjs/supertest) | HTTP 請求測試（直接對 Express app 發請求，不啟動伺服器） |

## 執行指令

```bash
# 執行全部測試
npm run test

# 等同於
npx vitest run
```

## CI

GitHub Actions（`.github/workflows/ci.yml`）於 PR 與 push 至 main 時，以 Node 24 執行 `npm ci` → `npm run css:build` → `npm test`。CI 以測試用假值注入 `JWT_SECRET`；測試 DB 為 in-memory（見下方 `DB_PATH` 設定），每個測試檔各自建表並植入種子資料。

## 測試設定

**設定檔**：`vitest.config.js`

```javascript
export default defineConfig({
  test: {
    globals: true,          // describe/it/expect 為全域變數，無需 import
    fileParallelism: false, // 停用檔案平行執行（循序執行）
    hookTimeout: 10000,     // beforeAll/afterAll 等 hook 的逾時時間（10 秒）
    env: { DB_PATH: ':memory:' }, // 測試用 in-memory DB，不碰開發用 database.sqlite
  },
});
```

## 測試檔案表

| 檔案 | 測試範圍 | 依賴 |
|------|----------|------|
| `tests/setup.js` | 輔助函式（非測試檔案） | — |
| `tests/auth.test.js` | 註冊、登入、重複 email、個人資料 | 無（種子資料由 `database.js` 初始化時建立） |
| `tests/products.test.js` | 商品列表、分頁、詳情、404 | 依賴種子商品存在 |
| `tests/cart.test.js` | 加入購物車、查看、更新數量、刪除、訪客 vs 登入 | 依賴商品存在 + 使用者認證 |
| `tests/orders.test.js` | 建立訂單、空購物車、認證要求、訂單列表、詳情、付款 | `beforeAll` 自建購物車品項 |
| `tests/ecpayPayment.test.js` | 綠界付款嘗試換號（MerchantTradeNo 不重複、check-payment 查最新編號）、目前編號已付款不換號、查詢失敗或未簽章錯誤回應時不換號並導向 `?payment=unavailable`、回應被竄改或挪用他筆交易時 check-payment 回 500 且換號流程不標記 paid（stub 全域 `fetch` 回傳已簽章回應，不連綠界）；另以綠界 staging 真實回應原文（含 ItemName 帶 `+`、`%` 的交易、從未送出編號的 `10200047`）驗證解析與簽章算法相容 | 依賴商品存在 + 使用者認證 |
| `tests/adminProducts.test.js` | 後台商品列表、新增、更新、刪除、權限檢查 | 依賴 admin 帳號 |
| `tests/adminOrders.test.js` | 後台訂單列表、詳情、狀態篩選 | `beforeAll` 自建訂單 + admin 帳號 |

## 執行順序

Vitest 依預設 include 自動收集 `*.test.js`，檔案順序不固定。各檔有獨立的 `:memory:` DB，順序不影響結果。

**為何要循序執行**：`fileParallelism: false` 使測試檔案逐一執行。由於 `DB_PATH=:memory:` 且 Vitest 預設 forks pool 每個測試檔各跑一個 process，各檔拿到獨立、剛建表並植入種子資料的 DB，檔案之間不共享資料；各檔所需的購物車、訂單等前置資料皆於自身 `beforeAll` 建立。

## 輔助函式說明

**檔案**：`tests/setup.js`

### `getAdminToken()`

```javascript
async function getAdminToken()
```

- **用途**：以種子管理員帳號（`admin@hexschool.com` / `12345678`）登入，回傳 JWT token
- **回傳**：`string`（JWT token）
- **使用場景**：所有需要 admin 權限的測試

### `registerUser(overrides?)`

```javascript
async function registerUser(overrides = {})
```

- **用途**：註冊新測試使用者並回傳認證資訊
- **參數**：
  - `overrides.email`：自訂 email（預設：`test-{timestamp}-{random}@example.com`）
  - `overrides.password`：自訂密碼（預設：`password123`）
  - `overrides.name`：自訂名稱（預設：`測試使用者`）
- **回傳**：`{ token: string, user: { id, email, name, role } }`
- **使用場景**：需要一般使用者 token 的測試

### 共用匯出

```javascript
module.exports = { app, request, getAdminToken, registerUser };
```

- `app`：Express 應用實例（從 `../app` 引入）
- `request`：supertest 函式（已綁定 app）

## 撰寫新測試的步驟

### 1. 建立測試檔案

在 `tests/` 下建立 `yourFeature.test.js`：

```javascript
const { app, request, getAdminToken, registerUser } = require('./setup');

describe('Your Feature', () => {
  let token;
  let adminToken;

  beforeAll(async () => {
    // 取得測試用 token
    const { token: userToken } = await registerUser();
    token = userToken;
    adminToken = await getAdminToken();
  });

  describe('GET /api/your-endpoint', () => {
    it('should return data successfully', async () => {
      const res = await request(app)
        .get('/api/your-endpoint')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.error).toBeNull();
    });

    it('should return 401 without token', async () => {
      const res = await request(app)
        .get('/api/your-endpoint');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('UNAUTHORIZED');
    });
  });
});
```

### 2. 新測試檔無需登錄

Vitest 依預設 include 自動收集 `*.test.js`，新檔案無需登錄。各檔有獨立的 `:memory:` DB，前置資料在同檔 `beforeAll` 建立，勿依賴其他檔案的資料。

### 3. 測試模式

```javascript
// 測試成功案例
it('should create resource', async () => {
  const res = await request(app)
    .post('/api/resource')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'test', value: 123 });

  expect(res.status).toBe(201);
  expect(res.body.data.name).toBe('test');
});

// 測試驗證錯誤
it('should return 400 for missing fields', async () => {
  const res = await request(app)
    .post('/api/resource')
    .set('Authorization', `Bearer ${token}`)
    .send({});

  expect(res.status).toBe(400);
  expect(res.body.error).toBe('VALIDATION_ERROR');
});

// 測試權限
it('should return 403 for non-admin', async () => {
  const res = await request(app)
    .get('/api/admin/resource')
    .set('Authorization', `Bearer ${token}`);  // 一般使用者

  expect(res.status).toBe(403);
  expect(res.body.error).toBe('FORBIDDEN');
});

// 測試訪客模式（X-Session-Id）
it('should work with session ID', async () => {
  const sessionId = 'test-session-' + Date.now();
  const res = await request(app)
    .get('/api/cart')
    .set('X-Session-Id', sessionId);

  expect(res.status).toBe(200);
});
```

## 常見陷阱

### 1. 跨檔資料依賴

各測試檔的 DB 彼此獨立，無法依賴其他檔案建立的資料。新測試需要的使用者、購物車、訂單等前置資料，應在同檔的 `beforeAll` 自行建立。

### 2. 同檔內共用資料庫狀態

同一測試檔內的測試共用同一個 in-memory DB，前面測試寫入的資料（例如扣減的庫存）會影響同檔後續測試。設計測試時應考慮：
- 使用唯一的 email/名稱，避免衝突
- `registerUser()` 已自動生成唯一 email（含 timestamp + random）

### 3. bcrypt 速度

測試環境下 `NODE_ENV=test` 會將 bcrypt salt rounds 降至 1，加速密碼雜湊。若未設定 `NODE_ENV=test`，每次註冊/登入會使用 10 rounds，顯著拖慢測試速度。

> **注意**：seed admin 的 bcrypt rounds 取決於 `database.js` 首次執行時的 `NODE_ENV`。但 `authRoutes.js` 中的 `register` 端點固定使用 `bcrypt.hashSync(password, 10)`（寫死 10 rounds），不受 NODE_ENV 影響。

### 4. hookTimeout 設定

`hookTimeout: 10000`（10 秒）。若 `beforeAll` 中需要多次 HTTP 請求（如註冊 + 登入 + 加入購物車），應注意是否超時。

### 5. 資料清理非必要

除 `orders.test.js` 運費測試的 `afterAll` 外，測試未實作資料清理，也不需要：in-memory DB 隨測試 process 結束而消失，每次執行都從種子資料重新開始，不會累積到開發用的 `database.sqlite`（先前共用該檔時，重複執行會耗盡種子商品庫存而連鎖失敗）。

### 6. supertest 直接使用 app

測試透過 `request(app)` 直接對 Express 實例發送請求，不會啟動實際 HTTP 伺服器。這意味著：
- 不需要管理埠號衝突
- 不會觸發 `server.js` 中的 `app.listen()`
- `database.js` 在 `require('../app')` 時即初始化（建表 + 種子資料）；路徑取自 `DB_PATH` 環境變數，未設定時為專案根目錄的 `database.sqlite`
