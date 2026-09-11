import { defineConfig } from "vite";
import { tee } from "tee-framework/plugin";

export default defineConfig({
  plugins: [tee()],
  base: "/frameworks/keyed/tee/dist/",
  build: {
    target: "esnext",
    modulePreload: false,
  },
});
