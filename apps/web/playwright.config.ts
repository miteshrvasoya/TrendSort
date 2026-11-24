import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
    launchOptions: { executablePath: process.env.PW_CHROMIUM, args: ["--no-sandbox"] },
  },
  webServer: [
    {
      command: "pnpm --filter @trendbridge/api start",
      url: "http://localhost:4000/health",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "pnpm start",
      url: "http://localhost:3000/login",
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
