import { parseHTML } from "./html.ts";

export interface SFCDescriptor {
  template?: string;
  script?: string;
  scriptLang: "js" | "ts";
  styles: string[];
}

/** Split a .tee file into template / script / style, counting nested `<template>` (t-slot). */
export function parseSFC(source: string): SFCDescriptor {
  const styles: string[] = [];
  let template: string | undefined;
  let script: string | undefined;
  let scriptLang: "js" | "ts" = "js";
  let i = 0;
  while (i < source.length) {
    const slice = source.slice(i);
    const open = slice.match(/<(template|script|style)\b([^>]*?)>/i);
    if (!open || open.index == null) break;
    const tag = open[1].toLowerCase();
    const abs = i + open.index;
    const block = readBlock(source, abs, tag, open[0].length);
    if (!block) break;
    if (tag === "template" && template == null) template = trimBlock(block.content);
    else if (tag === "script" && script == null) {
      script = trimBlock(block.content);
      scriptLang = /\blang\s*=\s*['"]ts['"]/i.test(open[2]) ? "ts" : "js";
    } else if (tag === "style") styles.push(trimBlock(block.content));
    i = block.end;
  }
  return { template, script, scriptLang, styles };
}

function readBlock(source: string, start: number, tag: string, openLen: number): { content: string; end: number } | null {
  const contentStart = start + openLen;
  if (tag !== "template") {
    const close = new RegExp(`</${tag}\\s*>`, "i");
    const rest = source.slice(contentStart);
    const found = close.exec(rest);
    if (!found || found.index == null) return null;
    return { content: rest.slice(0, found.index), end: contentStart + found.index + found[0].length };
  }
  let depth = 1;
  let i = contentStart;
  while (i < source.length && depth > 0) {
    const nextOpen = source.slice(i).search(/<template\b/i);
    const nextClose = source.slice(i).search(/<\/template\s*>/i);
    if (nextClose < 0) return null;
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth += 1;
      i += nextOpen + 9;
      continue;
    }
    depth -= 1;
    if (depth === 0) {
      const closeAt = i + nextClose;
      const closeMatch = source.slice(closeAt).match(/<\/template\s*>/i);
      return { content: source.slice(contentStart, closeAt), end: closeAt + (closeMatch?.[0].length ?? 11) };
    }
    i += nextClose + 11;
  }
  return null;
}

function trimBlock(content: string): string {
  return content.replace(/^\n/, "").replace(/\n\s*$/, "\n").trimEnd();
}

/** Turn a .tee source file into a JS module. HTML is parsed here (build time), not in the browser. */
export function compileSFC(source: string, filename = "anon.tee"): string {
  const sfc = parseSFC(source);
  const ast = parseHTML(sfc.template ?? "");
  let script = (sfc.script ?? "export default {}").trim();
  if (!/\bexport\s+default\b/.test(script)) script += "\nexport default {}";
  script = script.replace(/\bexport\s+default\b/, "const __default =");
  const styles = sfc.styles
    .map(
      (css, i) =>
        `if (typeof document !== "undefined") { const __style${i} = document.createElement("style"); __style${i}.setAttribute("data-tee", ${JSON.stringify(filename + ":" + i)}); __style${i}.textContent = ${JSON.stringify(css)}; document.head.appendChild(__style${i}); }`,
    )
    .join("\n");
  return `${script}

import { define as __teeDefine, mountAST as __mountAST } from "tee";

const __ast = ${JSON.stringify(ast)};

function __render(ctx, parent) {
  __mountAST(__ast, parent, ctx.scope, ctx);
}

__default.render = __render;
if (__default.tag) __teeDefine(__default.tag, __default);
${styles}
export default __default;
`;
}
