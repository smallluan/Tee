import { defineConfig } from "vite";
import { tee } from "tee-framework/plugin";

export default defineConfig({
  plugins: [tee()],
  server: {
    port: 43152,
    host: "0.0.0.0",
  },
});
