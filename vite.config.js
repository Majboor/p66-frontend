import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  const apiTarget = process.env.VITE_API_TARGET || "http://localhost:3000";

  return {
    root: dirname,
    plugins: [react()],
    build: {
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: false,
      // Split the stable React runtime into its own chunk so app-code redeploys
      // don't bust the vendor cache for returning visitors.
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("/node_modules/react") || id.includes("/node_modules/scheduler")) {
              return "react";
            }
            return undefined;
          }
        }
      }
    },
    preview: {
      host: "0.0.0.0",
      port: 4173
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      proxy: {
        "/api": apiTarget,
        "/health": apiTarget,
        "/exports": apiTarget
      }
    }
  };
});
