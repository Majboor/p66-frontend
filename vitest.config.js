import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Unit tests exercise the pure helpers exported from src/App.jsx. They run in a
// node environment (no DOM needed) so the suite stays fast and dependency-light;
// full DOM/user flows are covered separately by the Playwright e2e suite.
export default defineConfig({
  root: dirname,
  plugins: [react()],
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.{js,jsx}"],
    globals: false,
    reporters: "default"
  }
});
