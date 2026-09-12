/**
 * Editor support for `.tee` files.
 * TSX modules are the whole file (grammar = source.tsx).
 * Vue-style SFCs still split template / script / style for IntelliSense.
 */

export interface BlockRange {
  tag: "template" | "script" | "style";
  attrs: string;
  openStart: number;
  contentStart: number;
  contentEnd: number;
  closeEnd: number;
}

export interface TemplateExpr {
  start: number;
  end: number;
  text: string;
  directive?: string;
}

export interface Binding {
  name: string;
  type: string;
}

export type TeeLocation =
  | { kind: "script" }
  | { kind: "style" }
  | { kind: "expr"; start: number; end: number; text: string; directive?: string }
  | { kind: "tag" }
  | { kind: "template" }
  | { kind: "outside" };

const SELF_API: Binding[] = [
  { name: "$el", type: "Element | undefined" },
  { name: "$refs", type: "Record<string, Element | undefined>" },
  { name: "$emit", type: "(event: string, payload?: unknown) => void" },
  { name: "$nextTick", type: "(fn?: () => void) => Promise<void>" },
];

/** Native DOM events. `t-on:${name}` binds addEventListener(name). */
export const TEE_DOM_EVENTS = [
  "abort",
  "animationend",
  "animationiteration",
  "animationstart",
  "auxclick",
  "beforeinput",
  "blur",
  "canplay",
  "canplaythrough",
  "change",
  "click",
  "close",
  "compositionend",
  "compositionstart",
  "compositionupdate",
  "contextmenu",
  "copy",
  "cut",
  "dblclick",
  "drag",
  "dragend",
  "dragenter",
  "dragleave",
  "dragover",
  "dragstart",
  "drop",
  "durationchange",
  "ended",
  "error",
  "focus",
  "focusin",
  "focusout",
  "input",
  "invalid",
  "keydown",
  "keypress",
  "keyup",
  "load",
  "loadeddata",
  "loadedmetadata",
  "loadstart",
  "mousedown",
  "mouseenter",
  "mouseleave",
  "mousemove",
  "mouseout",
  "mouseover",
  "mouseup",
  "paste",
  "pause",
  "play",
  "playing",
  "pointercancel",
  "pointerdown",
  "pointerenter",
  "pointerleave",
  "pointermove",
  "pointerout",
  "pointerover",
  "pointerup",
  "progress",
  "ratechange",
  "reset",
  "resize",
  "scroll",
  "scrollend",
  "seeked",
  "seeking",
  "select",
  "stalled",
  "submit",
  "suspend",
  "timeupdate",
  "toggle",
  "touchcancel",
  "touchend",
  "touchmove",
  "touchstart",
  "transitionend",
  "transitionrun",
  "transitionstart",
  "volumechange",
  "waiting",
  "wheel",
] as const;

const BARE = new Set(["t-else", "t-pre", "t-once", "t-cloak"]);

export const TEE_DIRECTIVES: Array<{ name: string; insert: string; detail: string }> = [
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
  { name: "t-slot", insert: 't-slot="$1"', detail: "Named slot filler on a custom tag." },
  ...TEE_DOM_EVENTS.map((event) => ({
    name: `t-on:${event}`,
    insert: `t-on:${event}="$1"`,
    detail: `Native ${event} event. Modifiers: .prevent .stop .once .self .capture`,
  })),
  { name: "t-on:click.prevent", insert: 't-on:click.prevent="$1"', detail: "click + preventDefault." },
  { name: "t-on:submit.prevent", insert: 't-on:submit.prevent="$1"', detail: "submit + preventDefault." },
];

export function directiveInsert(name: string, tsx: boolean): string {
  if (BARE.has(name)) return name;
  if (tsx) return `${name}={$1}`;
  const found = TEE_DIRECTIVES.find((item) => item.name === name);
  return found?.insert ?? `${name}="$1"`;
}

/** Cursor is inside an opening tag (`<input t-on:`), TSX or HTML. */
export function inOpenTag(source: string, offset: number): boolean {
  const start = source.lastIndexOf("<", offset);
  if (start < 0) return false;
  const chunk = source.slice(start, offset);
  if (chunk.includes(">")) return false;
  return /^<\/?[A-Za-z][\w:-]*(?:\s[\s\S]*)?$/.test(chunk);
}

export function attributePrefix(source: string, offset: number): string {
  let start = offset;
  while (start > 0 && /[\w:.-]/.test(source[start - 1])) start -= 1;
  return source.slice(start, offset);
}

export function parseSFCBlocks(source: string): BlockRange[] {
  const blocks: BlockRange[] = [];
  let i = 0;
  while (i < source.length) {
    const slice = source.slice(i);
    const open = slice.match(/<(template|script|style)\b([^>]*?)>/i);
    if (!open || open.index == null) break;
    const tag = open[1].toLowerCase() as BlockRange["tag"];
    const abs = i + open.index;
    const block = readBlock(source, abs, tag, open[0].length);
    if (!block) break;
    blocks.push({
      tag,
      attrs: open[2],
      openStart: abs,
      contentStart: abs + open[0].length,
      contentEnd: block.contentEnd,
      closeEnd: block.end,
    });
    i = block.end;
  }
  return blocks;
}

function readBlock(
  source: string,
  start: number,
  tag: string,
  openLen: number,
): { contentEnd: number; end: number } | null {
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

export function findTemplateExprs(source: string, from: number, to: number): TemplateExpr[] {
  const exprs: TemplateExpr[] = [];
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

function findTagClose(source: string, start: number, limit: number): number {
  let quote: '"' | "'" | null = null;
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

function collectDirectiveExprs(source: string, start: number, tagEnd: number, out: TemplateExpr[]): void {
  let i = start;
  while (i < tagEnd && source[i] !== " " && source[i] !== "\n" && source[i] !== "\t" && source[i] !== ">") i += 1;
  while (i < tagEnd) {
    while (i < tagEnd && /\s/.test(source[i])) i += 1;
    if (i >= tagEnd) break;
    const nameStart = i;
    while (i < tagEnd && /[\w.:-]/.test(source[i])) i += 1;
    const name = source.slice(nameStart, i);
    if (!name) {
      // `/` in `<input />` (or any punctuation between attributes) must
      // advance. Without this, every language request on a normal starter
      // template loops forever before it can return completions.
      i += 1;
      continue;
    }
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

function setBinding(map: Map<string, string>, name: string, type: string): void {
  const prev = map.get(name);
  if (prev && prev !== "any" && type === "any") return;
  map.set(name, type);
}

export function extractBindings(script: string): Binding[] {
  const map = new Map<string, string>();
  for (const api of SELF_API) map.set(api.name, api.type);

  const selfAssign = /\bself\.([A-Za-z_$][\w$]*)\s*=\s*/g;
  let match: RegExpExecArray | null;
  while ((match = selfAssign.exec(script))) {
    const rhs = sliceExpr(script, selfAssign.lastIndex);
    setBinding(map, match[1], inferType(rhs));
  }

  const thisAssign = /\bthis\.([A-Za-z_$][\w$]*)\s*=\s*/g;
  while ((match = thisAssign.exec(script))) {
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
  while ((match = dataArrow.exec(script))) {
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

/** Public names people import from `tee-framework`. Hover/complete even without tsserver. */
export const TEE_NAMED_EXPORTS: Array<{ name: string; detail: string }> = [
  { name: "setup", detail: "setup(function App(self) { ... }): Tee component — function name is the name; runs once on self." },
  { name: "For", detail: "For — TSX list. <For each={self.items} by=\"id\">{(item, index) => <li>{item.name}</li>}</For>" },
  { name: "Fragment", detail: "Fragment — <>...</> wrapper; no extra DOM node." },
  { name: "computed", detail: "computed(() => expr): Ref<T> — cached field on self; template has no .value." },
  { name: "watch", detail: "watch(source, cb, options?): stop — runs after mapped data changes." },
  { name: "watchEffect", detail: "watchEffect(effect): stop" },
  { name: "onMounted", detail: "onMounted(fn) — DOM is already on the map." },
  { name: "onUnmounted", detail: "onUnmounted(fn)" },
  { name: "ref", detail: "ref(value): Ref<T> — returning it from setup writes the inner value onto self." },
  { name: "Tee", detail: "Tee.create / Tee.define / Tee.setup — app entry." },
  { name: "create", detail: "create(options): TeeApp" },
  { name: "define", detail: "define(tag, def): TagDef" },
  { name: "nextTick", detail: "nextTick(fn?): Promise<void>" },
  { name: "version", detail: "string — Tee version." },
  { name: "use", detail: "use(plugin): typeof Tee" },
  { name: "current", detail: "current(): Ctx — the self object while setup is running." },
  { name: "tee", detail: "tee(): Vite plugin for .tee SFCs." },
];

export function extractRepeatAliases(template: string): string[] {
  const names: string[] = [];
  const re = /\bt-(?:repeat|for)\s*=\s*(["'])([^"']+)\1/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(template))) {
    const value = match[2].trim();
    const parsed = value.match(/^\(?\s*([A-Za-z_$][\w$]*)\s*(?:,\s*([A-Za-z_$][\w$]*))?\s*\)?\s+(?:in|of)\s+/);
    if (!parsed) continue;
    names.push(parsed[1]);
    if (parsed[2]) names.push(parsed[2]);
  }
  return names;
}

function findRepeatAliases(script: string): string[] {
  return extractRepeatAliases(script);
}

function findReturnObjects(script: string): string[] {
  const out: string[] = [];
  const re = /\breturn\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(script))) {
    const start = match.index + match[0].length - 1;
    out.push(sliceBalanced(script, start));
  }
  return out;
}

function findObjectBlocks(script: string, opener: RegExp): string[] {
  const out: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(opener.source, opener.flags);
  while ((match = re.exec(script))) {
    const brace = script.indexOf("{", match.index + match[0].length - 1);
    if (brace < 0) continue;
    out.push(sliceBalanced(script, brace));
  }
  return out;
}

function objectProps(block: string, braceOffset: number): Array<[string, string]> {
  const start = block[braceOffset] === "{" ? braceOffset + 1 : 1;
  const props: Array<[string, string]> = [];
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

function sliceBalanced(source: string, braceAt: number): string {
  return source.slice(braceAt, skipBalanced(source, braceAt));
}

function skipBalanced(source: string, i: number): number {
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

function skipString(source: string, i: number): number {
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

function sliceExpr(source: string, start: number): string {
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

function inferType(rhs: string): string {
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

export function declaredNames(script: string): Set<string> {
  const names = new Set<string>();
  const re = /\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(script))) names.add(match[1]);
  return names;
}

/** Offset-preserving virtual TS: script + template expressions stay, everything else is space. */
export function virtualizeTee(source: string): { text: string; script?: BlockRange; template?: BlockRange } {
  const blocks = parseSFCBlocks(source);
  if (!blocks.length) return { text: source };
  const chars = new Array<string>(source.length);
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    chars[i] = ch === "\n" || ch === "\r" ? ch : " ";
  }
  const script = blocks.find((b) => b.tag === "script");
  const template = blocks.find((b) => b.tag === "template");
  if (script) {
    for (let i = script.contentStart; i < script.contentEnd; i++) chars[i] = source[i];
  }
  if (template) {
    for (const expr of findTemplateExprs(source, template.contentStart, template.contentEnd)) {
      for (let i = expr.start; i < expr.end; i++) chars[i] = source[i];
    }
  }
  return { text: chars.join(""), script, template };
}

export function locateTee(source: string, offset: number): TeeLocation {
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
  return blocks.length ? { kind: "outside" } : { kind: "script" };
}

function inStartTag(source: string, from: number, to: number, offset: number): boolean {
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

export function collectComponentBindings(source: string): Binding[] {
  const blocks = parseSFCBlocks(source);
  if (!blocks.length) return extractBindings(source);
  const script = blocks.find((b) => b.tag === "script");
  const template = blocks.find((b) => b.tag === "template");
  const map = new Map<string, string>();
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

/** True when the cursor is inside `import { … } from "tee-framework"` / `"tee"`. */
export function inTeeNamedImport(source: string, offset: number): boolean {
  const start = source.lastIndexOf("import", offset);
  if (start < 0) return false;
  const chunk = source.slice(start, offset);
  if (!chunk.includes("{")) return false;
  if (/}\s*from\s*/.test(chunk)) return false;
  const ahead = source.slice(offset, offset + 160);
  const stmt = chunk + ahead;
  return /from\s*['"]tee(?:-framework)?(?:\/plugin)?['"]/.test(stmt) || /from\s*['"]tee['"]/.test(stmt);
}

export function identAt(source: string, offset: number): { name: string; start: number; end: number } | null {
  let start = offset;
  let end = offset;
  while (start > 0 && /[A-Za-z0-9_$-]/.test(source[start - 1])) start -= 1;
  while (end < source.length && /[A-Za-z0-9_$-]/.test(source[end])) end += 1;
  if (start === end) return null;
  return { name: source.slice(start, end), start, end };
}

export function templateHelperText(source: string, offset: number): { file: string; at: number } | null {
  const loc = locateTee(source, offset);
  if (loc.kind !== "expr") return null;
  const blocks = parseSFCBlocks(source);
  const script = blocks.find((b) => b.tag === "script");
  const scriptText = script ? source.slice(script.contentStart, script.contentEnd) : "";
  const taken = declaredNames(scriptText);
  const bindings = collectComponentBindings(source).filter((b) => !taken.has(b.name));
  const decls = bindings.map((b) => `declare const ${b.name}: ${b.type};`).join("\n");
  const exprSoFar = source.slice(loc.start, offset);
  const file = `${scriptText}\n${decls}\nvoid (${exprSoFar}`;
  return { file, at: file.length };
}
