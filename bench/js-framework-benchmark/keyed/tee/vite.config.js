import { defineConfig } from "vite";
import { tee } from "tee-framework/plugin";

export default defineConfig({
  base: "/frameworks/keyed/tee/dist/",
  plugins: [tee()],
  build: {
    target: "esnext",
    modulePreload: false,
  },
});
