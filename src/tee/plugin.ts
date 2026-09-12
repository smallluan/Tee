import { readFileSync } from "node:fs";
import { transformWithOxc, type Plugin } from "vite";
import { compileTSXWithMap, isSFCSource } from "./jsx-transform";
import { compileSFC, parseSFC, hashScopeId, scopeCss } from "./sfc";

/**
 * Vite plugin for `.tee` files.
 * TSX (setup returns DOM, styles imported) is the default.
 * Vue-style `<template>` / `<script>` / `<style>` SFCs still compile.
 */
export function tee(): Plugin {
  return {
    name: "vite-plugin-tee",
    enforce: "pre",
    async transform(code, id) {
      const [file, query] = id.split("?");
      if (query?.includes("tee&type=style")) return;
      if (!file.endsWith(".tee")) return;
      if (!isSFCSource(code)) {
        try {
          return compileTSXWithMap(code, file);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.error(message);
          return;
        }
      }
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
    load(id) {
      const [file, query] = id.split("?");
      if (!query?.includes("tee&type=style") || !file.endsWith(".tee")) return;
      this.addWatchFile(file);
      const source = readFileSync(file, "utf8");
      const sfc = parseSFC(source);
      const index = Number(/index=(\d+)/.exec(query)?.[1] ?? 0);
      const block = sfc.styles[index];
      if (!block) return "";
      const css = block.scoped ? scopeCss(block.content, hashScopeId(file)) : block.content;
      return css;
    },
    handleHotUpdate(ctx) {
      if (ctx.file.endsWith(".tee")) return ctx.modules;
    },
  };
}
