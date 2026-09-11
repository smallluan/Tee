"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/tee/tee-lsp.ts
var tee_lsp_exports = {};
__export(tee_lsp_exports, {
  TeeLanguageProject: () => TeeLanguageProject,
  createTeeLanguageProject: () => createTeeLanguageProject
});
module.exports = __toCommonJS(tee_lsp_exports);
var import_node_path = require("node:path");

// src/tee/tee-virtual.ts
var SELF_API = [
  { name: "$el", type: "Element | undefined" },
  { name: "$refs", type: "Record<string, Element | undefined>" },
  { name: "$emit", type: "(event: string, payload?: unknown) => void" },
  { name: "$nextTick", type: "(fn?: () => void) => Promise<void>" }
];
var TEE_DIRECTIVES = [
  { name: "t-if", insert: 't-if="$1"', detail: "Conditionally mount this node." },
  { name: "t-else-if", insert: 't-else-if="$1"', detail: "Else-if branch of a t-if chain." },
  { name: "t-else", insert: "t-else", detail: "Else branch of a t-if chain." },
  { name: "t-show", insert: 't-show="$1"', detail: "Insert or remove this node from the real DOM." },
  { name: "t-repeat", insert: 't-repeat="$1 in $2"', detail: "Repeat this node. `item in list` or `(item, index) in list`." },
  { name: "t-for", insert: 't-for="$1 in $2"', detail: "Alias of t-repeat." },
  { name: "t-key", insert: 't-key="$1"', detail: "Stable key for t-repeat reuse." },
  { name: "t-model", insert: 't-model="$1"', detail: "Two-way bind an input." },
  { name: "t-model.trim", insert: 't-model.trim="$1"', detail: "t-model, trim whitespace." },
  { name: "t-model.number", insert: 't-model.number="$1"', detail: "t-model, coerce to number." },
  { name: "t-model.lazy", insert: 't-model.lazy="$1"', detail: "t-model, sync on change." },
  { name: "t-html", insert: 't-html="$1"', detail: "Set innerHTML from an expression." },
  { name: "t-text", insert: 't-text="$1"', detail: "Set textContent from an expression." },
  { name: "t-ref", insert: 't-ref="$1"', detail: "Expose this element on $refs." },
  { name: "t-pre", insert: "t-pre", detail: "Skip compiling this subtree." },
  { name: "t-once", insert: "t-once", detail: "Bind this subtree once, then freeze." },
  { name: "t-cloak", insert: "t-cloak", detail: "Hide until compiled." },
  { name: "t-bind", insert: 't-bind="$1"', detail: "Spread an object of attributes." },
  { name: "t-bind:class", insert: 't-bind:class="$1"', detail: "Class binding: string, array, or { name: cond }." },
  { name: "t-bind:style", insert: 't-bind:style="$1"', detail: "Style binding: object of CSS properties." },
  { name: "t-on:click", insert: 't-on:click="$1"', detail: "Click handler. Modifiers: .prevent .stop .once .self .capture" },
  { name: "t-on:click.prevent", insert: 't-on:click.prevent="$1"', detail: "click + preventDefault." },
  { name: "t-on:input", insert: 't-on:input="$1"', detail: "Input handler." },
  { name: "t-on:submit", insert: 't-on:submit="$1"', detail: "Submit handler." },
  { name: "t-on:submit.prevent", insert: 't-on:submit.prevent="$1"', detail: "submit + preventDefault." },
  { name: "t-slot", insert: 't-slot="$1"', detail: "Named slot filler on a custom tag." }
];
function parseSFCBlocks(source) {
  const blocks = [];
  let i = 0;
  while (i < source.length) {
    const slice = source.slice(i);
    const open = slice.match(/<(template|script|style)\b([^>]*?)>/i);
    if (!open || open.index == null) break;
    const tag = open[1].toLowerCase();
    const abs = i + open.index;
    const block = readBlock(source, abs, tag, open[0].length);
    if (!block) break;
    blocks.push({
      tag,
      attrs: open[2],
      openStart: abs,
      contentStart: abs + open[0].length,
      contentEnd: block.contentEnd,
      closeEnd: block.end
    });
    i = block.end;
  }
  return blocks;
}
function readBlock(source, start, tag, openLen) {
  const contentStart = start + openLen;
  if (tag !== "template") {
    const close = new RegExp(`</${tag}\\s*>`, "i");
    const rest = source.slice(contentStart);
    const found = close.exec(rest);
    if (!found || found.index == null) return null;
    return { contentEnd: contentStart + found.index, end: contentStart + found.index + found[0].length };
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
      return { contentEnd: closeAt, end: closeAt + (closeMatch?.[0].length ?? 11) };
    }
    i += nextClose + 11;
  }
  return null;
}
function findTemplateExprs(source, from, to) {
  const exprs = [];
  let i = from;
  while (i < to) {
    if (source.startsWith("<!--", i)) {
      const end = source.indexOf("-->", i + 4);
      i = end < 0 ? to : end + 3;
      continue;
    }
    if (source.startsWith("{{", i)) {
      const end = source.indexOf("}}", i + 2);
      if (end < 0 || end >= to) break;
      exprs.push({ start: i + 2, end, text: source.slice(i + 2, end) });
      i = end + 2;
      continue;
    }
    if (source[i] === "<") {
      const tagEnd = findTagClose(source, i, to);
      if (tagEnd < 0) break;
      collectDirectiveExprs(source, i, tagEnd, exprs);
      i = tagEnd + 1;
      continue;
    }
    i += 1;
  }
  return exprs;
}
function findTagClose(source, start, limit) {
  let quote = null;
  for (let i = start; i < limit; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ">") return i;
  }
  return -1;
}
function collectDirectiveExprs(source, start, tagEnd, out) {
  let i = start;
  while (i < tagEnd && source[i] !== " " && source[i] !== "\n" && source[i] !== "	" && source[i] !== ">") i += 1;
  while (i < tagEnd) {
    while (i < tagEnd && /\s/.test(source[i])) i += 1;
    if (i >= tagEnd) break;
    const nameStart = i;
    while (i < tagEnd && /[\w.:-]/.test(source[i])) i += 1;
    const name = source.slice(nameStart, i);
    while (i < tagEnd && /\s/.test(source[i])) i += 1;
    if (source[i] !== "=") continue;
    i += 1;
    while (i < tagEnd && /\s/.test(source[i])) i += 1;
    const quote = source[i];
    if (quote !== '"' && quote !== "'") continue;
    i += 1;
    const valueStart = i;
    while (i < tagEnd && source[i] !== quote) i += 1;
    const valueEnd = i;
    if (i < tagEnd) i += 1;
    if (/^t-[\w.:-]+$/i.test(name) && !/^t-(else|pre|once|cloak)$/i.test(name)) {
      out.push({ start: valueStart, end: valueEnd, text: source.slice(valueStart, valueEnd), directive: name });
    }
  }
}
function setBinding(map, name, type) {
  const prev = map.get(name);
  if (prev && prev !== "any" && type === "any") return;
  map.set(name, type);
}
function extractBindings(script) {
  const map = /* @__PURE__ */ new Map();
  for (const api of SELF_API) map.set(api.name, api.type);
  const selfAssign = /\bself\.([A-Za-z_$][\w$]*)\s*=\s*/g;
  let match;
  while (match = selfAssign.exec(script)) {
    const rhs = sliceExpr(script, selfAssign.lastIndex);
    setBinding(map, match[1], inferType(rhs));
  }
  const thisAssign = /\bthis\.([A-Za-z_$][\w$]*)\s*=\s*/g;
  while (match = thisAssign.exec(script)) {
    const rhs = sliceExpr(script, thisAssign.lastIndex);
    setBinding(map, match[1], inferType(rhs));
  }
  for (const block of findObjectBlocks(script, /\bdata\s*\(\s*\)\s*\{/g)) {
    const ret = block.indexOf("return");
    if (ret < 0) continue;
    const brace = block.indexOf("{", ret);
    if (brace < 0) continue;
    for (const [name, type] of objectProps(block, brace)) setBinding(map, name, type);
  }
  for (const block of findObjectBlocks(script, /\bdata\s*:\s*(?:\(\s*\)\s*=>\s*)?\{/g)) {
    for (const [name, type] of objectProps(block, 0)) {
      if (name === "return") continue;
      setBinding(map, name, type);
    }
  }
  const dataArrow = /\bdata\s*:\s*\(\s*\)\s*=>\s*\(\s*\{/g;
  while (match = dataArrow.exec(script)) {
    const brace = script.indexOf("{", match.index + match[0].length - 1);
    if (brace < 0) continue;
    for (const [name, type] of objectProps(sliceBalanced(script, brace), 0)) setBinding(map, name, type);
  }
  for (const block of findObjectBlocks(script, /\bcomputed\s*:\s*\{/g)) {
    for (const [name] of objectProps(block, 0)) setBinding(map, name, "any");
  }
  for (const block of findObjectBlocks(script, /\bmethods\s*:\s*\{/g)) {
    for (const [name] of objectProps(block, 0)) setBinding(map, name, "(...args: never[]) => any");
  }
  for (const returned of findReturnObjects(script)) {
    for (const [name, type] of objectProps(returned, 0)) setBinding(map, name, type);
  }
  for (const alias of findRepeatAliases(script)) setBinding(map, alias, "any");
  return [...map.entries()].map(([name, type]) => ({ name, type }));
}
var TEE_NAMED_EXPORTS = [
  { name: "setup", detail: "setup((self) => { self.count = 0 }): TagDef \u2014 script and template share `self`." },
  { name: "computed", detail: "computed(() => expr): Ref<T> \u2014 cached field on self; template has no .value." },
  { name: "watch", detail: "watch(source, cb, options?): stop \u2014 runs after mapped data changes." },
  { name: "watchEffect", detail: "watchEffect(effect): stop" },
  { name: "onMounted", detail: "onMounted(fn) \u2014 DOM is already on the map." },
  { name: "onUnmounted", detail: "onUnmounted(fn)" },
  { name: "ref", detail: "ref(value): Ref<T> \u2014 returning it from setup writes the inner value onto self." },
  { name: "Tee", detail: "Tee.create / Tee.define / Tee.setup \u2014 app entry." },
  { name: "create", detail: "create(options): TeeApp" },
  { name: "define", detail: "define(tag, def): TagDef" },
  { name: "nextTick", detail: "nextTick(fn?): Promise<void>" },
  { name: "version", detail: "string \u2014 Tee version." },
  { name: "use", detail: "use(plugin): typeof Tee" },
  { name: "current", detail: "current(): Ctx \u2014 the self object while setup is running." },
  { name: "tee", detail: "tee(): Vite plugin for .tee SFCs." }
];
function extractRepeatAliases(template) {
  const names = [];
  const re = /\bt-(?:repeat|for)\s*=\s*(["'])([^"']+)\1/gi;
  let match;
  while (match = re.exec(template)) {
    const value = match[2].trim();
    const parsed = value.match(/^\(?\s*([A-Za-z_$][\w$]*)\s*(?:,\s*([A-Za-z_$][\w$]*))?\s*\)?\s+(?:in|of)\s+/);
    if (!parsed) continue;
    names.push(parsed[1]);
    if (parsed[2]) names.push(parsed[2]);
  }
  return names;
}
function findRepeatAliases(script) {
  return extractRepeatAliases(script);
}
function findReturnObjects(script) {
  const out = [];
  const re = /\breturn\s*\{/g;
  let match;
  while (match = re.exec(script)) {
    const start = match.index + match[0].length - 1;
    out.push(sliceBalanced(script, start));
  }
  return out;
}
function findObjectBlocks(script, opener) {
  const out = [];
  let match;
  const re = new RegExp(opener.source, opener.flags);
  while (match = re.exec(script)) {
    const brace = script.indexOf("{", match.index + match[0].length - 1);
    if (brace < 0) continue;
    out.push(sliceBalanced(script, brace));
  }
  return out;
}
function objectProps(block, braceOffset) {
  const start = block[braceOffset] === "{" ? braceOffset + 1 : 1;
  const props = [];
  let i = start;
  let depth = 1;
  while (i < block.length && depth > 0) {
    const ch = block[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      i += 1;
      continue;
    } else if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(block, i);
      continue;
    }
    if (depth !== 1) {
      i += 1;
      continue;
    }
    while (i < block.length && /\s|,/.test(block[i])) i += 1;
    if (block[i] === "}") break;
    const nameMatch = block.slice(i).match(/^([A-Za-z_$][\w$]*)/);
    if (!nameMatch) {
      i += 1;
      continue;
    }
    const name = nameMatch[1];
    i += name.length;
    while (i < block.length && /\s/.test(block[i])) i += 1;
    if (block[i] === "(" || block[i] === "{") {
      props.push([name, "(...args: never[]) => any"]);
      i = skipBalanced(block, i);
      continue;
    }
    if (block[i] === ":") {
      i += 1;
      while (i < block.length && /\s/.test(block[i])) i += 1;
      const rhs = sliceExpr(block, i);
      props.push([name, inferType(rhs)]);
      i += Math.max(rhs.length, 1);
      continue;
    }
    props.push([name, "any"]);
  }
  return props;
}
function sliceBalanced(source, braceAt) {
  return source.slice(braceAt, skipBalanced(source, braceAt));
}
function skipBalanced(source, i) {
  const open = source[i];
  const close = open === "{" ? "}" : open === "(" ? ")" : open === "[" ? "]" : "";
  if (!close) return i + 1;
  let depth = 0;
  for (let k = i; k < source.length; k++) {
    const ch = source[k];
    if (ch === '"' || ch === "'" || ch === "`") {
      k = skipString(source, k) - 1;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return k + 1;
    }
  }
  return source.length;
}
function skipString(source, i) {
  const q = source[i];
  i += 1;
  while (i < source.length) {
    if (source[i] === "\\") {
      i += 2;
      continue;
    }
    if (source[i] === q) return i + 1;
    i += 1;
  }
  return source.length;
}
function sliceExpr(source, start) {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(source, i) - 1;
      continue;
    }
    if (ch === "(" || ch === "{" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "}" || ch === "]") {
      if (depth === 0) return source.slice(start, i);
      depth -= 1;
    } else if (depth === 0 && (ch === "," || ch === ";" || ch === "\n")) {
      return source.slice(start, i);
    }
  }
  return source.slice(start);
}
function inferType(rhs) {
  const s = rhs.trim();
  if (!s) return "any";
  if (/^computed\s*\(/.test(s)) return "any";
  const ref = /^ref\s*\(([\s\S]*)\)\s*$/.exec(s);
  if (ref) return inferType(ref[1]);
  if (/^(true|false)\b/.test(s)) return "boolean";
  if (/^['"`]/.test(s)) return "string";
  if (/^[-+]?\d+(\.\d+)?\b/.test(s)) return "number";
  if (/^(async\s+)?(function\b|\(|[A-Za-z_$][\w$]*\s*=>|\(\s*\)\s*=>)/.test(s)) return "(...args: never[]) => any";
  return "any";
}
function locateTee(source, offset) {
  const blocks = parseSFCBlocks(source);
  for (const block of blocks) {
    if (offset < block.openStart || offset > block.closeEnd) continue;
    if (block.tag === "script") {
      if (offset >= block.contentStart && offset <= block.contentEnd) return { kind: "script" };
      return { kind: "outside" };
    }
    if (block.tag === "style") return { kind: "style" };
    if (block.tag !== "template") continue;
    if (offset < block.contentStart || offset > block.contentEnd) return { kind: "template" };
    const exprs = findTemplateExprs(source, block.contentStart, block.contentEnd);
    for (const expr of exprs) {
      if (offset >= expr.start && offset <= expr.end) {
        return { kind: "expr", start: expr.start, end: expr.end, text: expr.text, directive: expr.directive };
      }
    }
    if (inStartTag(source, block.contentStart, block.contentEnd, offset)) return { kind: "tag" };
    return { kind: "template" };
  }
  return { kind: "outside" };
}
function inStartTag(source, from, to, offset) {
  let i = from;
  while (i < to) {
    if (source.startsWith("<!--", i)) {
      const end = source.indexOf("-->", i + 4);
      i = end < 0 ? to : end + 3;
      continue;
    }
    if (source[i] === "<" && source[i + 1] !== "/") {
      const close = findTagClose(source, i, to);
      if (close < 0) return false;
      if (offset > i && offset <= close) return true;
      i = close + 1;
      continue;
    }
    i += 1;
  }
  return false;
}
function collectComponentBindings(source) {
  const blocks = parseSFCBlocks(source);
  const script = blocks.find((b) => b.tag === "script");
  const template = blocks.find((b) => b.tag === "template");
  const map = /* @__PURE__ */ new Map();
  if (script) {
    for (const b of extractBindings(source.slice(script.contentStart, script.contentEnd))) {
      map.set(b.name, b.type);
    }
  }
  if (template) {
    for (const name of extractRepeatAliases(source.slice(template.contentStart, template.contentEnd))) {
      if (!map.has(name)) map.set(name, "any");
    }
  }
  return [...map.entries()].map(([name, type]) => ({ name, type }));
}
function inTeeNamedImport(source, offset) {
  const start = source.lastIndexOf("import", offset);
  if (start < 0) return false;
  const chunk = source.slice(start, offset);
  if (!chunk.includes("{")) return false;
  if (/}\s*from\s*/.test(chunk)) return false;
  const ahead = source.slice(offset, offset + 160);
  const stmt = chunk + ahead;
  return /from\s*['"]tee(?:-framework)?(?:\/plugin)?['"]/.test(stmt) || /from\s*['"]tee['"]/.test(stmt);
}
function identAt(source, offset) {
  let start = offset;
  let end = offset;
  while (start > 0 && /[A-Za-z0-9_$-]/.test(source[start - 1])) start -= 1;
  while (end < source.length && /[A-Za-z0-9_$-]/.test(source[end])) end += 1;
  if (start === end) return null;
  return { name: source.slice(start, end), start, end };
}

// src/tee/tee-lsp.ts
var TeeLanguageProject = class {
  constructor(_tsLib, root) {
    this.root = root;
  }
  root;
  docs = /* @__PURE__ */ new Map();
  upsert(fileName, text) {
    this.docs.set((0, import_node_path.normalize)(fileName), { fileName: (0, import_node_path.normalize)(fileName), text });
  }
  completions(fileName, offset) {
    const doc = this.docs.get((0, import_node_path.normalize)(fileName));
    if (!doc) return [];
    const loc = locateTee(doc.text, offset);
    if (loc.kind === "tag") return directiveCompletions(doc.text, offset);
    if (loc.kind === "expr") return bindingCompletions(doc.text);
    if (loc.kind === "script") {
      if (inTeeNamedImport(doc.text, offset)) {
        return TEE_NAMED_EXPORTS.map((item) => ({
          name: item.name,
          kind: "function",
          detail: item.detail
        }));
      }
      const before = doc.text.slice(Math.max(0, offset - 8), offset);
      if (/\bself\.$/.test(before) || /\bthis\.$/.test(before)) return bindingCompletions(doc.text);
      const word = identAt(doc.text, offset);
      const bindings = bindingCompletions(doc.text);
      const exports2 = TEE_NAMED_EXPORTS.map((item) => ({
        name: item.name,
        kind: "function",
        detail: item.detail
      }));
      if (word && (word.name === "self" || word.name === "this")) return bindings;
      return uniqueCompletions([...bindings, ...exports2]);
    }
    return [];
  }
  hover(fileName, offset) {
    const doc = this.docs.get((0, import_node_path.normalize)(fileName));
    if (!doc) return null;
    const loc = locateTee(doc.text, offset);
    if (loc.kind === "tag") {
      const dir2 = directiveAt(doc.text, offset);
      if (!dir2) return null;
      return { text: `${dir2.name}
${dir2.detail}`, start: offset, end: offset };
    }
    const ident = identAt(doc.text, offset);
    if (!ident) return null;
    const exported = TEE_NAMED_EXPORTS.find((item) => item.name === ident.name);
    if (exported) return { text: exported.detail, start: ident.start, end: ident.end };
    const binding = collectComponentBindings(doc.text).find((b) => b.name === ident.name);
    if (binding) return { text: `${binding.name}: ${binding.type}`, start: ident.start, end: ident.end };
    const dir = TEE_DIRECTIVES.find((d) => d.name === ident.name);
    if (dir) return { text: dir.detail, start: ident.start, end: ident.end };
    return null;
  }
  definition(_fileName, _offset) {
    return [];
  }
  dispose() {
  }
};
function createTeeLanguageProject(tsLib, root) {
  return new TeeLanguageProject(tsLib, root);
}
function bindingCompletions(source) {
  return collectComponentBindings(source).map((b) => ({
    name: b.name,
    kind: b.type.includes("=>") ? "method" : "property",
    detail: b.type
  }));
}
function directiveCompletions(source, offset) {
  const before = source.slice(Math.max(0, offset - 40), offset);
  const partial = /(?:^|\s)(t-[\w.:-]*)$/.exec(before)?.[1] ?? "";
  return TEE_DIRECTIVES.filter((d) => !partial || d.name.startsWith(partial)).map((d) => ({
    name: d.name,
    kind: "keyword",
    detail: d.detail,
    insertText: d.insert
  }));
}
function directiveAt(source, offset) {
  const around = source.slice(Math.max(0, offset - 48), offset + 48);
  const match = around.match(/t-[\w.:-]+/);
  if (!match) return null;
  const found = TEE_DIRECTIVES.find((d) => d.name === match[0]);
  return found ? { name: found.name, detail: found.detail } : { name: match[0], detail: "Tee template directive" };
}
function uniqueCompletions(items) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const item of items) {
    if (seen.has(item.name)) continue;
    seen.add(item.name);
    out.push(item);
  }
  return out;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  TeeLanguageProject,
  createTeeLanguageProject
});
