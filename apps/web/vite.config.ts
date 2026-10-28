import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT) || 5173,
    proxy: {
      "/api": process.env.API_PROXY_TARGET || "http://127.0.0.1:3001",
      "/socket.io": {
        target: process.env.API_PROXY_TARGET || "http://127.0.0.1:3001",
        ws: true,
      },
    },
  },
  build: { outDir: "dist" },
});
