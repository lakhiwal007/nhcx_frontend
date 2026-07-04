import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  base: "/nhcx/service/",
  plugins: [react()],
  server: {
    allowedHosts: [
      "brought-mooing-vanquish.ngrok-free.dev",
      "disclose-heaving-disloyal.ngrok-free.dev",
    ],
    proxy: {
      "/nhcx/api": {
        target: "https://disclose-heaving-disloyal.ngrok-free.dev",
        changeOrigin: true,
        secure: false,
        headers: {
          "ngrok-skip-browser-warning": "69420",
        },
      },
    },
  },
});
