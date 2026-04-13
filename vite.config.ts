import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "./", // Importante para Electron
  server: {
    port: 5173,
    strictPort: true,
    open: false,
  },
  build: {
    target: "es2022",
    // Smaller initial parse + cache-friendly chunks in production (slightly snappier cold start).
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom"],
          motion: ["framer-motion"],
        },
      },
    },
  },
});
