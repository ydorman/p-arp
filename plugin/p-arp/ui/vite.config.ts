import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative asset paths: the release build is served from the plugin's embedded zip
  base: "./",
  server: {
    // The plugin's dev build loads http://localhost:5173/ (PARP_UI_DEV_SERVER=ON)
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
