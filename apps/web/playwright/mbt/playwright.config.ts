import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });

export default defineConfig({
  outputDir: resolve("test-results/mbt/results"),
  testDir: ".",
  testMatch: "issue-06.e2e.ts",
  workers: 1,
  retries: 0,
  reporter: [],
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    locale: "en-US",
    timezoneId: "Asia/Saigon",
    storageState: {
      origins: [],
      cookies: [
        {
          domain: "localhost",
          path: "/",
          name: "calcom-timezone-dialog",
          value: "1",
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      ],
    },
    trace: "off",
    screenshot: "off",
    video: "off",
    actionTimeout: 120_000,
    navigationTimeout: 120_000,
  },
  expect: { timeout: 120_000 },
});
