import { defineConfig } from "vite";

export default defineConfig({
  base: "/frameworks/keyed/tee/dist/",
  build: {
    target: "esnext",
    modulePreload: false,
  },
});
