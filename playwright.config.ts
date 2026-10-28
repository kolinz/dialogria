import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45000,
  use: { baseURL: "http://127.0.0.1:5174", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 375, height: 812 } } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5174/login",
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      PORT: "3003",
      WEB_PORT: "5174",
      API_PROXY_TARGET: "http://127.0.0.1:3003",
      WEB_ORIGIN: "http://127.0.0.1:5174",
      DATABASE_PATH: ".e2e-data/db.sqlite",
      STORAGE_ROOT: ".e2e-data/storage",
    },
  },
});
