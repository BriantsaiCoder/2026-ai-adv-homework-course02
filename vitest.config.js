import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    fileParallelism: false,
    hookTimeout: 10000,
    env: { DB_PATH: ':memory:' }, // 每個測試檔獨立 in-memory DB，不碰開發用 database.sqlite
  },
});
