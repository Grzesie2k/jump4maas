import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "../shared"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    hmr: { port: 3001 },
    proxy: {
      "/matchmake": {
        target: "http://localhost:2567",
        changeOrigin: true,
      },
      "/": {
        target: "ws://localhost:2567",
        ws: true,
        changeOrigin: true,
        bypass: (req) => req.url, // HTTP → Vite; tylko WS upgrade jest proxy'owane
      },
    },
  },
  define: {
    // W dev proxy działa na tym samym porcie co Vite (:3000).
    // W produkcji ustaw VITE_SERVER_URL na właściwy host.
    "import.meta.env.VITE_SERVER_URL": JSON.stringify(
      process.env.VITE_SERVER_URL ?? "ws://localhost:3000"
    ),
  },
});
