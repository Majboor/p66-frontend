import { defineConfig, devices } from "@playwright/test";

// Allow a locally-installed chromium (headless shell) to be reused via an env
// var; CI installs its own browser so the field is simply omitted there.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
const PORT = Number(process.env.PW_PORT || 8492);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,
  use: {
    baseURL,
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: executablePath ? { executablePath } : {}
      }
    }
  ],
  webServer: {
    // Build once, then serve the production bundle the way real users get it.
    command: `npm run build && npx vite preview --config vite.config.js --port ${PORT} --host 127.0.0.1`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
