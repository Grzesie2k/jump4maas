import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "../shared"),
    },
  },
  server: {
    port: 3000,
  },
  define: {
    // Umożliwia nadpisanie URL serwera przez env przy buildzie produkcyjnym
    "import.meta.env.VITE_SERVER_URL": JSON.stringify(
      process.env.VITE_SERVER_URL ?? "ws://localhost:2567"
    ),
  },
});
