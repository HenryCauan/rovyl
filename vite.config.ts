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
});
