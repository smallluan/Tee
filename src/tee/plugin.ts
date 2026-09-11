import { transformWithOxc, type Plugin } from "vite";
import { compileSFC, parseSFC } from "./sfc.ts";

/**
 * Vite plugin for `.tee` single-file components.
 * Same idea as Vue's `.vue`: intercept the file at build time, split blocks,
 * compile the template to an AST factory, then emit a JS module.
 */
export function tee(): Plugin {
  return {
    name: "vite-plugin-tee",
    enforce: "pre",
    async transform(code, id) {
      const file = id.split("?")[0];
      if (!file.endsWith(".tee")) return;
      const js = compileSFC(code, file);
      const lang = parseSFC(code).scriptLang;
      if (lang === "ts") {
        const out = await transformWithOxc(js, file.replace(/\.tee$/, ".ts"), {
          lang: "ts",
          sourcemap: true,
        });
        return { code: out.code, map: out.map };
      }
      return { code: js, map: null };
    },
  };
}
