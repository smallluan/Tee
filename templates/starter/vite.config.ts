import { defineConfig } from "vite";
import { tee } from "tee/plugin";

export default defineConfig({
  plugins: [tee()],
  server: {
    port: 43152,
    host: "0.0.0.0",
  },
});
