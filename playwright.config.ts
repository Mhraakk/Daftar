import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3000);
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, locale: "fa-IR", timezoneId: "Asia/Tehran", viewport: { width: 1440, height: 900 }, trace: "off", screenshot: "only-on-failure" },
  webServer: { command: `npm run start -- -p ${PORT}`, url: `http://localhost:${PORT}/api/health`, reuseExistingServer: true, timeout: 120_000 },
});
