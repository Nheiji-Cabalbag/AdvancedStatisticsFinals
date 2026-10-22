import { defineConfig } from "vite";

// In development the browser talks to Vite (5173); /api calls are forwarded to the Express server (3001).
export default defineConfig({
  server: { proxy: { "/api": "http://localhost:3001" } },
});
