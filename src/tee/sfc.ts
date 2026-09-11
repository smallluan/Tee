import { generateRenderBody } from "./codegen.ts";
import { parseHTML } from "./html.ts";

export interface SFCStyleBlock {
  content: string;
  lang: string;
  scoped: boolean;
}

export interface SFCDescriptor {
  template?: string;
  script?: string;
  scriptLang: "js" | "ts";
  styles: SFCStyleBlock[];
}

/** Split a .tee file into template / script / style, counting nested `<template>` (t-slot). */
export function parseSFC(source: string): SFCDescriptor {
  const styles: SFCStyleBlock[] = [];
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
    } else if (tag === "style") {
      const lang = /lang\s*=\s*['"]([\w-]+)['"]/i.exec(open[2])?.[1] ?? "css";
      const scoped = /\bscoped\b/i.test(open[2]);
      styles.push({ content: trimBlock(block.content), lang, scoped });
    }
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

export function hashScopeId(filename: string): string {
  let hash = 2166136261;
  for (let i = 0; i < filename.length; i++) {
    hash ^= filename.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return "data-t-" + (hash >>> 0).toString(36);
}

export function scopeCss(css: string, scopeId: string): string {
  return css.replace(/(^|[{};])(\s*)([.#:[\]*a-zA-Z][^{}@]*)\{/g, (full, lead: string, ws: string, selectors: string) => {
    const trimmed = selectors.trim();
    if (!trimmed) return full;
    const next = trimmed
      .split(",")
      .map((sel) => {
        const piece = sel.trim();
        if (!piece) return sel;
        return `${piece}[${scopeId}]`;
      })
      .join(", ");
    return `${lead}${ws}${next}{`;
  });
}

/** Turn a .tee source file into a JS module. HTML is parsed here (build time), not in the browser. */
export function compileSFC(source: string, filename = "anon.tee"): string {
  const sfc = parseSFC(source);
  const ast = parseHTML(sfc.template ?? "");
  const scopeId = sfc.styles.some((block) => block.scoped) ? hashScopeId(filename) : "";
  let script = (sfc.script ?? "export default {}").trim();
  if (!/\bexport\s+default\b/.test(script)) script += "\nexport default {}";
  script = script.replace(/\bexport\s+default\b/, "const __default =");
  const styleImports = sfc.styles
    .map((block, i) => {
      const lang = block.lang && block.lang !== "css" ? `&lang.${block.lang}` : "";
      return `import ${JSON.stringify(`${filename}?tee&type=style&index=${i}${lang}`)};`;
    })
    .join("\n");
  const body = generateRenderBody(ast);
  return `${script}

import { define as __teeDefine, rt as __rt } from "tee";
${styleImports}

const __scopeId = ${JSON.stringify(scopeId)};

function __render(ctx, parent) {
  if (__scopeId) ctx.scopeId = __scopeId;
  const s = ctx.scope;
${body}}

__default.render = __render;
if (__default.tag) __teeDefine(__default.tag, __default);
export default __default;

if (import.meta.hot) import.meta.hot.accept();
`;
}
