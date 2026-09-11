import { display, isBooleanAttr, parseRepeat, splitInterpolation, writeText } from "./expr";
import type { Engine } from "./engine";
import { attrValue, isVoidTag, parseHTML, staticAttrs, type ElNode, type TmplNode } from "./html";
import { compileExpr } from "./ir";
import { Instance } from "./instance";
import { touchList } from "./observe";
import { runExpr, runStatement, type Scope, createRootScope } from "./scope";
import { runSetup } from "./chart";
import { Rank, rankOf } from "./strata";
import type { Site, TagDef } from "./types";

export interface CompileContext {
  engine: Engine;
  instance: Instance;
  lookup: (tag: string) => TagDef | undefined;
  fillers?: Record<string, Node[]>;
  parentScope?: Scope;
  scope?: Scope;
  scopeId?: string;
  once?: boolean;
}

export function mountTemplate(html: string, parent: Node, scope: Scope, ctx: CompileContext): void {
  mountAST(parseHTML(html), parent, scope, ctx);
}

export function mountAST(nodes: TmplNode[], parent: Node, scope: Scope, ctx: CompileContext): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.t === "el" && attrValue(node.attrs, "if") != null) {
      const chain: ElNode[] = [node];
      while (i + 1 < nodes.length) {
        const next = nodes[i + 1];
        if (next.t === "text" && !next.value.trim()) {
          i += 1;
          continue;
        }
        if (next.t !== "el") break;
        if (attrValue(next.attrs, "elif") != null) {
          chain.push(next);
          i += 1;
          continue;
        }
        if (attrValue(next.attrs, "else") != null) {
          chain.push(next);
          i += 1;
        }
        break;
      }
      mountIfChain(chain, parent, scope, ctx);
      continue;
    }
    if (node.t === "el" && (attrValue(node.attrs, "elif") != null || attrValue(node.attrs, "else") != null)) {
      continue;
    }
    mountNode(node, parent, scope, ctx);
  }
}

export function parseTemplate(html: string): DocumentFragment {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  return tpl.content;
}

export function hydrate(node: Node, scope: Scope, ctx: CompileContext): void {
  if (ctx.instance.detached) return;
  if (node.nodeType === 3) {
    bindText(node as Text, scope, ctx);
    return;
  }
  if (node.nodeType !== 1) return;

  const el = node as Element;
  if (el.hasAttribute("t-repeat")) {
    bindRepeat(el, scope, ctx);
    return;
  }
  if (el.hasAttribute("t-show")) {
    bindShow(el, scope, ctx);
    return;
  }
  if (el.tagName === "SLOT") {
    bindSlot(el, scope, ctx);
    return;
  }
  const def = ctx.lookup(el.tagName.toLowerCase());
  if (def) {
    bindTag(el, def, scope, ctx);
    return;
  }
  bindAttrs(el, scope, ctx);
  for (const child of [...el.childNodes]) hydrate(child, scope, ctx);
}

export function hydrateFragment(fragment: DocumentFragment | Node, scope: Scope, ctx: CompileContext): void {
  for (const child of [...fragment.childNodes]) hydrate(child, scope, ctx);
}

/** Compile a node that may replace itself (custom tags). Keep it in a fragment so replacements stay reachable. */
function compileDetached(node: Node, scope: Scope, ctx: CompileContext): Node[] {
  const holder = document.createDocumentFragment();
  holder.append(node);
  hydrate(node, scope, ctx);
  return [...holder.childNodes];
}

function bindText(text: Text, scope: Scope, ctx: CompileContext): void {
  const raw = text.textContent ?? "";
  if (!raw.includes("{{")) return;
  const parts = splitInterpolation(raw);
  if (parts.length === 1 && parts[0].static) return;

  const parent = text.parentNode;
  if (!parent) return;
  const live: Text[] = [];
  for (const part of parts) {
    const node = document.createTextNode(part.static ? part.value : "");
    parent.insertBefore(node, text);
    if (!part.static) {
      live.push(node);
      addSite(ctx, {
        kind: "text",
        node,
        label: `{{ ${part.value} }}`,
        rank: rankOf("text", compileExpr(part.value).stable),
        run() {
          applyReactive(this, ctx, scope, part.value, (value) => writeText(node, value));
        },
      });
    }
  }
  parent.removeChild(text);
  void live;
}

function bindAttrs(el: Element, scope: Scope, ctx: CompileContext): void {
  for (const attr of [...el.attributes]) {
    const name = attr.name;
    if (name.startsWith("t-on:")) {
      bindEvent(el, name.slice(5), attr.value, scope);
      el.removeAttribute(name);
      continue;
    }
    if (name.startsWith("t-bind:")) {
      bindAttr(el, name.slice(7), attr.value, scope, ctx);
      el.removeAttribute(name);
      continue;
    }
    if (name === "t-model" || name.startsWith("t-model.")) {
      const mods = name.slice("t-model".length).split(".").filter(Boolean);
      bindModel(el, attr.value, scope, ctx, mods);
      el.removeAttribute(name);
      continue;
    }
    if (attr.value.includes("{{")) bindAttr(el, name, interpolateToExpr(attr.value), scope, ctx);
  }
}

function interpolateToExpr(value: string): string {
  const parts = splitInterpolation(value);
  return parts
    .map((part) => (part.static ? JSON.stringify(part.value) : `(${part.value})`))
    .join(" + ");
}

function applyAttr(el: Element, name: string, value: unknown): void {
  if (name === "class") {
    const next = classToString(value);
    if (next) el.setAttribute("class", next);
    else el.removeAttribute("class");
    return;
  }
  if (name === "style") {
    const next = styleToString(value);
    if (next) el.setAttribute("style", next);
    else el.removeAttribute("style");
    return;
  }
  if (isBooleanAttr(name)) {
    if (value) el.setAttribute(name, "");
    else el.removeAttribute(name);
    return;
  }
  if (value == null || value === false) {
    el.removeAttribute(name);
    return;
  }
  el.setAttribute(name, display(value));
}

function classToString(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(classToString).filter(Boolean).join(" ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, on]) => on)
      .map(([cls]) => cls)
      .join(" ");
  }
  return String(value);
}

function cssKey(name: string): string {
  if (name.startsWith("--")) return name;
  return name.replace(/[A-Z]/g, (ch) => "-" + ch.toLowerCase());
}

function styleToString(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v != null && v !== false && v !== "")
      .map(([k, v]) => `${cssKey(k)}:${v}`)
      .join(";");
  }
  return String(value);
}

const KEY_MODS: Record<string, string> = {
  enter: "Enter",
  tab: "Tab",
  delete: "Delete",
  esc: "Escape",
  space: " ",
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
};

function bindEvent(el: Element, spec: string, src: string, scope: Scope, mods: string[] = []): void {
  let eventName = spec;
  if (spec.includes(".")) {
    const parts = spec.split(".");
    eventName = parts[0];
    mods = parts.slice(1);
  }
  const capture = mods.includes("capture");
  const once = mods.includes("once");
  const handler = (event: Event) => {
    if (mods.includes("self") && event.target !== el) return;
    const keyName = mods.map((m) => KEY_MODS[m]).find(Boolean);
    if (keyName && (event as KeyboardEvent).key !== keyName) return;
    if (mods.includes("prevent")) event.preventDefault();
    if (mods.includes("stop")) event.stopPropagation();
    try {
      runStatement(scope, src, event);
    } catch (error) {
      console.error(error);
    }
  };
  el.addEventListener(eventName, handler, { capture, once });
}

function bindModel(el: Element, path: string, scope: Scope, ctx: CompileContext, mods: string[] = []): void {
  const isCheck = el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio");
  const eventName = mods.includes("lazy") || isCheck || el instanceof HTMLSelectElement ? "change" : "input";
  el.addEventListener(eventName, () => {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
      return;
    }
    let value: unknown = isCheck && el instanceof HTMLInputElement ? el.checked : el.value;
    if (typeof value === "string" && mods.includes("trim")) value = value.trim();
    if (typeof value === "string" && mods.includes("number")) value = value === "" ? "" : Number(value);
    scope.$assign(path, value);
  });
  addSite(ctx, {
    kind: "model",
    node: el,
    label: `model ${path}`,
    rank: rankOf("model", compileExpr(path).stable),
    run() {
      applyReactive(this, ctx, scope, path, (value) => {
        if (el instanceof HTMLInputElement && isCheck) {
          const on = Boolean(value);
          if (el.checked !== on) el.checked = on;
        } else if (
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement ||
          el instanceof HTMLSelectElement
        ) {
          const next = display(value);
          if (el.value !== next) el.value = next;
        }
      });
    },
  });
}

function bindShow(el: Element, scope: Scope, ctx: CompileContext): void {
  const src = el.getAttribute("t-show") ?? "";
  el.removeAttribute("t-show");
  const template = el.cloneNode(true) as Element;
  const anchor = document.createComment("t-show");
  el.replaceWith(anchor);

  let visible = false;
  let current: { inst: Instance; nodes: Node[] } | null = null;

  addSite(ctx, {
    kind: "show",
    node: anchor,
    label: `t-show ${src}`,
    rank: Rank.Structure,
    run() {
      applyReactive(this, ctx, scope, src, (value) => {
        const on = Boolean(value);
        if (on === visible) return;
        if (on && !visible) {
          const node = template.cloneNode(true) as Element;
          const inst = ctx.instance.child();
          const nodes = compileDetached(node, scope, { ...ctx, instance: inst });
          for (const live of nodes) anchor.parentNode?.insertBefore(live, anchor);
          current = { inst, nodes };
          visible = true;
        } else if (!on && visible && current) {
          current.inst.destroy();
          for (const live of current.nodes) live.parentNode?.removeChild(live);
          current = null;
          visible = false;
        }
      });
    },
  });
}

function bindRepeat(el: Element, scope: Scope, ctx: CompileContext): void {
  const stmt = el.getAttribute("t-repeat") ?? "";
  const keySrc = el.getAttribute("t-key");
  el.removeAttribute("t-repeat");
  el.removeAttribute("t-key");
  const parsed = parseRepeat(stmt);
  const template = el.cloneNode(true) as Element;
  const start = document.createComment("t-repeat");
  const end = document.createComment("/t-repeat");
  el.replaceWith(start);
  start.parentNode?.insertBefore(end, start.nextSibling);

  type Row = {
    key: string;
    inst: Instance;
    nodes: Node[];
    scope: Scope;
    item: unknown;
    index: number;
  };
  const rows = new Map<string, Row>();

  addSite(ctx, {
    kind: "repeat",
    node: start,
    label: `t-repeat ${stmt}`,
    rank: Rank.Structure,
    run() {
      applyReactive(this, ctx, scope, parsed.list, (list) => {
        const items = Array.isArray(list) ? list : [];
        const used = new Set<string>();
        const ordered: Row[] = [];

        let structural = false;
        for (let index = 0; index < items.length; index++) {
          const item = items[index];
          let key = keyFor(item, index, keySrc, parsed.item, parsed.index, scope);
          while (used.has(key)) key += "#" + index;
          used.add(key);

          let row = rows.get(key);
          if (!row) {
            structural = true;
            const locals: Record<string, unknown> = {
              [parsed.item]: item,
              [parsed.index]: index,
            };
            const node = template.cloneNode(true) as Element;
            const inst = ctx.instance.child();
            const liveScope = scope.$child(locals);
            const nodes = compileDetached(node, liveScope, { ...ctx, instance: inst });
            row = { key, inst, nodes, scope: liveScope, item, index };
            rows.set(key, row);
          } else {
            if (!Object.is(row.item, item)) {
              row.item = item;
              row.scope[parsed.item] = item;
            }
            if (row.index !== index) {
              structural = true;
              row.index = index;
              row.scope[parsed.index] = index;
            }
          }
          ordered.push(row);
        }

        for (const [key, row] of rows) {
          if (!used.has(key)) {
            structural = true;
            row.inst.destroy();
            for (const live of row.nodes) live.parentNode?.removeChild(live);
            rows.delete(key);
          }
        }

        if (!structural) return;

        let cursor: Node = start;
        for (const row of ordered) {
          for (const live of row.nodes) {
            if (cursor.nextSibling !== live) {
              end.parentNode?.insertBefore(live, cursor.nextSibling);
            }
            cursor = live;
          }
        }
      });
    },
  });
}

function collectFillers(host: Element): Record<string, Node[]> {
  const fillers: Record<string, Node[]> = { default: [] };
  for (const child of [...host.childNodes]) {
    if (child.nodeType === 1 && (child as Element).hasAttribute("t-slot")) {
      const el = child as Element;
      const name = el.getAttribute("t-slot") || "default";
      if (el.tagName === "TEMPLATE") {
        fillers[name] = [...(el as HTMLTemplateElement).content.cloneNode(true).childNodes];
      } else {
        el.removeAttribute("t-slot");
        fillers[name] = [el];
      }
    } else if (child.nodeType === 3 && !child.textContent?.trim()) {
      continue;
    } else {
      fillers.default.push(child);
    }
  }
  return fillers;
}

function bindTag(host: Element, def: TagDef, parentScope: Scope, ctx: CompileContext): void {
  const fillers = collectFillers(host);
  const fragment = parseTemplate(def.template);
  const mount = document.createDocumentFragment();
  mount.append(...fragment.childNodes);

  let scope = parentScope;
  const inst = ctx.instance.child();
  if (def.data || def.computed || def.methods || def.watch || def.setup) {
    const data = def.data ? def.data() : {};
    scope = createRootScope(ctx.engine, data, def.computed, def.methods, def.watch, inst);
    inst.scope = scope;
    def.created?.call(scope);
    if (def.setup) runSetup(scope, def.setup);
  }

  const innerCtx: CompileContext = {
    ...ctx,
    instance: inst,
    fillers,
    parentScope,
  };
  hydrateFragment(mount, scope, innerCtx);

  const first = mount.firstElementChild;
  if (first) {
    for (const attr of [...host.attributes]) {
      if (attr.name.startsWith("t-")) continue;
      if (attr.name === "class" && first.getAttribute("class")) {
        first.setAttribute("class", `${first.getAttribute("class")} ${attr.value}`);
      } else if (!first.hasAttribute(attr.name)) {
        first.setAttribute(attr.name, attr.value);
      }
    }
  }

  host.replaceWith(mount);
  def.mounted?.call(scope);
  inst.hooks.mounted?.();
}

function bindSlot(el: Element, scope: Scope, ctx: CompileContext): void {
  const name = el.getAttribute("name") || "default";
  const fill = ctx.fillers?.[name];
  const dest = document.createDocumentFragment();
  if (fill && fill.length) {
    for (const node of fill) dest.append(node);
    hydrateFragment(dest, ctx.parentScope ?? scope, {
      ...ctx,
      fillers: undefined,
      parentScope: undefined,
    });
  } else {
    for (const child of [...el.childNodes]) dest.append(child);
    hydrateFragment(dest, scope, ctx);
  }
  el.replaceWith(dest);
}

function addSite(
  ctx: CompileContext,
  init: { kind: Site["kind"]; node: Node | null; label: string; rank?: number; run: (this: Site) => void },
): Site {
  const site: Site = {
    id: ctx.engine.nextSiteId(),
    kind: init.kind,
    node: init.node,
    label: init.label,
    rank: init.rank ?? rankOf(init.kind, false),
    run: () => undefined,
  };
  site.run = init.run.bind(site);
  ctx.instance.sites.push(site);
  site.run();
  if (ctx.once) {
    site.dead = true;
    ctx.engine.maps.unlink(site);
  }
  return site;
}

function applyReactive(
  site: Site,
  ctx: CompileContext,
  scope: Scope,
  src: string,
  apply: (value: unknown) => void,
): void {
  if (site.dead) return;
  const engine = ctx.engine;
  const plan = compileExpr(src);
  if (site.linked && !engine.stale(site)) {
    engine.stats.skipClock += 1;
    return;
  }

  const read = (): unknown => {
    if (plan.run) return plan.run((name) => scope.$lookup(name));
    return runExpr(scope, src);
  };

  if (plan.stable && site.linked) {
    let value: unknown;
    try {
      value = read();
    } catch (error) {
      console.error(error);
      value = site.last;
    }
    engine.touch(site);
    if (site.kind !== "show" && site.kind !== "repeat" && Object.is(value, site.last)) {
      engine.stats.skipEqual += 1;
      return;
    }
    site.last = value;
    engine.stats.patch += 1;
    apply(value);
    return;
  }

  engine.startTrack();
  let value: unknown;
  try {
    value = read();
    if (site.kind === "repeat") touchList(value, ctx.engine);
  } catch (error) {
    console.error(error);
    value = site.last;
  } finally {
    engine.commitTrack(site, engine.stopTrack());
  }
  if (site.kind !== "show" && site.kind !== "repeat" && Object.is(value, site.last)) {
    engine.stats.skipEqual += 1;
    return;
  }
  site.last = value;
  engine.stats.patch += 1;
  apply(value);
}

function keyFor(
  item: unknown,
  index: number,
  keySrc: string | null,
  itemName: string,
  indexName: string,
  scope: Scope,
): string {
  if (!keySrc) return String(index);
  const trimmed = keySrc.trim();
  if (trimmed === indexName) return String(index);
  const prefix = itemName + ".";
  if (trimmed.startsWith(prefix)) {
    let cur: unknown = item;
    for (const part of trimmed.slice(prefix.length).split(".")) {
      if (cur == null) return String(index);
      cur = (cur as Record<string, unknown>)[part];
    }
    return String(cur);
  }
  try {
    return String(runExpr(scope.$child({ [itemName]: item, [indexName]: index }), trimmed));
  } catch {
    return String(index);
  }
}

function rtLive(parent: Node, scope: Scope, ctx: CompileContext, src: string): void {
  const text = document.createTextNode("");
  parent.appendChild(text);
  addSite(ctx, {
    kind: "text",
    node: text,
    label: `{{ ${src} }}`,
    rank: rankOf("text", compileExpr(src).stable),
    run() {
      applyReactive(this, ctx, scope, src, (value) => writeText(text, value));
    },
  });
}

function mountNode(node: TmplNode, parent: Node, scope: Scope, ctx: CompileContext): void {
  if (ctx.instance.detached) return;
  if (node.t === "text") {
    parent.appendChild(document.createTextNode(node.value));
    return;
  }
  if (node.t === "live") {
    rtLive(parent, scope, ctx, node.src);
    return;
  }
  if (attrValue(node.attrs, "once") != null) {
    const stripped: ElNode = { ...node, attrs: node.attrs.filter((attr) => attr.kind !== "once") };
    mountNode(stripped, parent, scope, { ...ctx, once: true });
    return;
  }
  if (attrValue(node.attrs, "repeat") != null) {
    mountRepeatNode(node, parent, scope, ctx);
    return;
  }
  if (attrValue(node.attrs, "show") != null) {
    mountShowNode(node, parent, scope, ctx);
    return;
  }
  if (attrValue(node.attrs, "pre") != null) {
    const holder = document.createElement("template");
    holder.innerHTML = serializeNode(node);
    parent.append(...holder.content.childNodes);
    return;
  }
  if (node.tag === "slot") {
    mountSlotNode(node, parent, scope, ctx);
    return;
  }
  if (ctx.lookup(node.tag)) {
    mountTagNode(node, parent, scope, ctx);
    return;
  }
  mountElement(node, parent, scope, ctx);
}

function mountElement(node: ElNode, parent: Node, scope: Scope, ctx: CompileContext): void {
  const el = document.createElement(node.tag);
  if (ctx.scopeId) el.setAttribute(ctx.scopeId, "");
  for (const attr of staticAttrs(node.attrs)) el.setAttribute(attr.name, attr.value);
  for (const attr of node.attrs) {
    if (attr.kind === "on") bindEvent(el, attr.event, attr.value, scope, attr.mods);
    else if (attr.kind === "bind") bindAttr(el, attr.name, attr.value, scope, ctx);
    else if (attr.kind === "model") bindModel(el, attr.value, scope, ctx, attr.mods);
    else if (attr.kind === "html") bindHtml(el, attr.value, scope, ctx);
    else if (attr.kind === "text") bindAttr(el, "textContent", attr.value, scope, ctx);
    else if (attr.kind === "ref") bindRef(el, attr.value, scope);
  }
  if (node.children.length && node.children.every((child) => isStaticNode(child, ctx))) {
    el.innerHTML = node.children.map(serializeNode).join("");
  } else {
    mountAST(node.children, el, scope, ctx);
  }
  el.removeAttribute("t-cloak");
  parent.appendChild(el);
}

function bindHtml(el: Element, src: string, scope: Scope, ctx: CompileContext): void {
  addSite(ctx, {
    kind: "attr",
    node: el,
    label: `[html] ${src}`,
    rank: rankOf("attr", compileExpr(src).stable),
    run() {
      applyReactive(this, ctx, scope, src, (value) => {
        el.innerHTML = value == null ? "" : String(value);
      });
    },
  });
}

function bindRef(el: Element, name: string, scope: Scope): void {
  const refs = (scope.$lookup("$refs") as Record<string, Element> | undefined) ?? undefined;
  if (refs) refs[name] = el;
}

function bindSpread(el: Element, src: string, scope: Scope, ctx: CompileContext): void {
  addSite(ctx, {
    kind: "attr",
    node: el,
    label: `[bind] ${src}`,
    rank: rankOf("attr", compileExpr(src).stable),
    run() {
      applyReactive(this, ctx, scope, src, (value) => {
        if (!value || typeof value !== "object") return;
        for (const [key, next] of Object.entries(value as Record<string, unknown>)) {
          applyAttr(el, key, next);
        }
      });
    },
  });
}

function bindAttr(el: Element, name: string, src: string, scope: Scope, ctx: CompileContext): void {
  if (!name) {
    bindSpread(el, src, scope, ctx);
    return;
  }
  if (name === "class") {
    const base = el.getAttribute("class") || "";
    addSite(ctx, {
      kind: "attr",
      node: el,
      label: `[class] ${src}`,
      rank: rankOf("attr", compileExpr(src).stable),
      run() {
        applyReactive(this, ctx, scope, src, (value) => {
          const next = [base, classToString(value)].filter(Boolean).join(" ");
          if (next) el.setAttribute("class", next);
          else el.removeAttribute("class");
        });
      },
    });
    return;
  }
  if (name === "style") {
    const base = el.getAttribute("style") || "";
    addSite(ctx, {
      kind: "attr",
      node: el,
      label: `[style] ${src}`,
      rank: rankOf("attr", compileExpr(src).stable),
      run() {
        applyReactive(this, ctx, scope, src, (value) => {
          const next = [base, styleToString(value)].filter(Boolean).join(";");
          if (next) el.setAttribute("style", next);
          else el.removeAttribute("style");
        });
      },
    });
    return;
  }
  if (name === "textContent") {
    addSite(ctx, {
      kind: "text",
      node: el,
      label: `[text] ${src}`,
      rank: rankOf("text", compileExpr(src).stable),
      run() {
        applyReactive(this, ctx, scope, src, (value) => {
          const s = display(value);
          if (el.textContent !== s) el.textContent = s;
        });
      },
    });
    return;
  }
  addSite(ctx, {
    kind: "attr",
    node: el,
    label: `[${name}] ${src}`,
    rank: rankOf("attr", compileExpr(src).stable),
    run() {
      applyReactive(this, ctx, scope, src, (value) => applyAttr(el, name, value));
    },
  });
}

function mountShowNode(node: ElNode, parent: Node, scope: Scope, ctx: CompileContext): void {
  const src = attrValue(node.attrs, "show") ?? "";
  const stripped: ElNode = {
    ...node,
    attrs: node.attrs.filter((attr) => attr.kind !== "show"),
  };
  const anchor = document.createComment("t-show");
  parent.appendChild(anchor);
  let visible = false;
  let current: { inst: Instance; nodes: Node[] } | null = null;
  addSite(ctx, {
    kind: "show",
    node: anchor,
    label: `t-show ${src}`,
    rank: Rank.Structure,
    run() {
      applyReactive(this, ctx, scope, src, (value) => {
        const on = Boolean(value);
        if (on === visible) return;
        if (on && !visible) {
          const inst = ctx.instance.child();
          const holder = document.createDocumentFragment();
          mountNode(stripped, holder, scope, { ...ctx, instance: inst });
          const nodes = [...holder.childNodes];
          for (const live of nodes) anchor.parentNode?.insertBefore(live, anchor);
          current = { inst, nodes };
          visible = true;
        } else if (!on && visible && current) {
          current.inst.destroy();
          for (const live of current.nodes) live.parentNode?.removeChild(live);
          current = null;
          visible = false;
        }
      });
    },
  });
}

function mountRepeatNode(node: ElNode, parent: Node, scope: Scope, ctx: CompileContext): void {
  const stmt = attrValue(node.attrs, "repeat") ?? "";
  const keySrc = attrValue(node.attrs, "key") ?? null;
  const stripped: ElNode = {
    ...node,
    attrs: node.attrs.filter((attr) => attr.kind !== "repeat" && attr.kind !== "key"),
  };
  const parsed = parseRepeat(stmt);
  const start = document.createComment("t-repeat");
  const end = document.createComment("/t-repeat");
  parent.appendChild(start);
  parent.appendChild(end);

  type Row = {
    key: string;
    inst: Instance;
    nodes: Node[];
    scope: Scope;
    item: unknown;
    index: number;
  };
  const rows = new Map<string, Row>();

  addSite(ctx, {
    kind: "repeat",
    node: start,
    label: `t-repeat ${stmt}`,
    rank: Rank.Structure,
    run() {
      applyReactive(this, ctx, scope, parsed.list, (list) => {
        const items = Array.isArray(list) ? list : [];
        const used = new Set<string>();
        const ordered: Row[] = [];
        let structural = false;
        for (let index = 0; index < items.length; index++) {
          const item = items[index];
          let key = keyFor(item, index, keySrc, parsed.item, parsed.index, scope);
          while (used.has(key)) key += "#" + index;
          used.add(key);
          let row = rows.get(key);
          if (!row) {
            structural = true;
            const inst = ctx.instance.child();
            const liveScope = scope.$child({ [parsed.item]: item, [parsed.index]: index });
            const holder = document.createDocumentFragment();
            mountNode(stripped, holder, liveScope, { ...ctx, instance: inst });
            row = { key, inst, nodes: [...holder.childNodes], scope: liveScope, item, index };
            rows.set(key, row);
          } else {
            if (!Object.is(row.item, item)) {
              row.item = item;
              row.scope[parsed.item] = item;
            }
            if (row.index !== index) {
              structural = true;
              row.index = index;
              row.scope[parsed.index] = index;
            }
          }
          ordered.push(row);
        }
        for (const [key, row] of rows) {
          if (!used.has(key)) {
            structural = true;
            row.inst.destroy();
            for (const live of row.nodes) live.parentNode?.removeChild(live);
            rows.delete(key);
          }
        }
        if (!structural) return;
        let cursor: Node = start;
        for (const row of ordered) {
          for (const live of row.nodes) {
            if (cursor.nextSibling !== live) end.parentNode?.insertBefore(live, cursor.nextSibling);
            cursor = live;
          }
        }
      });
    },
  });
}

function mountTagNode(node: ElNode, parent: Node, scope: Scope, ctx: CompileContext): void {
  const def = ctx.lookup(node.tag);
  if (!def) return;
  const fillers = collectFillersAst(node.children, scope, ctx);
  const inst = ctx.instance.child();
  const propNames = listPropNames(def.props);
  const data = { ...(def.data ? def.data() : {}) };
  for (const name of propNames) {
    const bound = node.attrs.find((attr) => attr.kind === "bind" && attr.name === name);
    const stat = staticAttrs(node.attrs).find((attr) => attr.name === name);
    if (bound) data[name] = runExpr(scope, bound.value);
    else if (stat) data[name] = stat.value;
    else if (def.props && !Array.isArray(def.props) && def.props[name] && "default" in def.props[name]) {
      data[name] = def.props[name].default;
    }
  }
  for (const attr of node.attrs) {
    if (attr.kind === "on") {
      inst.listeners[attr.event] = (payload: unknown) => {
        const trimmed = attr.value.trim();
        const fn = scope.$lookup(trimmed);
        if (typeof fn === "function" && /^[A-Za-z_$][\w$]*$/.test(trimmed)) {
          fn(payload);
          return;
        }
        runStatement(scope, attr.value, payload as Event);
      };
    }
  }
  applyInject(inst, def.inject, data);
  const innerScope = createRootScope(ctx.engine, data, def.computed, def.methods, def.watch, inst);
  inst.scope = innerScope;
  applyProvide(inst, def.provide, innerScope);
  def.created?.call(innerScope);
  if (def.setup) runSetup(innerScope, def.setup);
  for (const name of propNames) {
    const bound = node.attrs.find((attr) => attr.kind === "bind" && attr.name === name);
    if (!bound) continue;
    addSite(ctx, {
      kind: "attr",
      node: null,
      label: `prop ${name}`,
      rank: rankOf("attr", compileExpr(bound.value).stable),
      run() {
        applyReactive(this, ctx, scope, bound.value, (value) => {
          innerScope.$assign(name, value);
        });
      },
    });
  }
  const innerCtx: CompileContext = { ...ctx, instance: inst, fillers, parentScope: scope, scope: innerScope };
  const mount = document.createDocumentFragment();
  if (def.render) def.render(innerCtx, mount);
  else if (def.template) mountTemplate(def.template, mount, innerScope, innerCtx);
  const first = mount.firstElementChild;
  if (first) {
    for (const attr of staticAttrs(node.attrs)) {
      if (propNames.includes(attr.name)) continue;
      if (attr.name === "class" && first.getAttribute("class")) {
        first.setAttribute("class", `${first.getAttribute("class")} ${attr.value}`);
      } else if (!first.hasAttribute(attr.name)) first.setAttribute(attr.name, attr.value);
    }
    const ref = node.attrs.find((attr) => attr.kind === "ref");
    if (ref) bindRef(first, ref.value, scope);
  }
  parent.append(...mount.childNodes);
  def.mounted?.call(innerScope);
  inst.hooks.mounted?.();
  inst.hooks.updated = chainHook(inst.hooks.updated, () => def.updated?.call(innerScope));
  inst.hooks.unmounted = chainHook(inst.hooks.unmounted, () => def.unmounted?.call(innerScope));
}

function chainHook(prev: (() => void) | undefined, next: () => void): () => void {
  return prev
    ? () => {
        prev();
        next();
      }
    : next;
}

function listPropNames(props: TagDef["props"]): string[] {
  if (!props) return [];
  return Array.isArray(props) ? props : Object.keys(props);
}

export function applyInject(
  inst: Instance,
  inject: TagDef["inject"],
  data: Record<string, unknown>,
): void {
  if (!inject) return;
  if (Array.isArray(inject)) {
    for (const key of inject) {
      const found = inst.lookupProvide(key);
      if (found !== undefined) data[key] = found;
    }
    return;
  }
  for (const [local, spec] of Object.entries(inject)) {
    if (typeof spec === "string") {
      const found = inst.lookupProvide(spec);
      if (found !== undefined) data[local] = found;
      continue;
    }
    const from = spec?.from ?? local;
    const found = inst.lookupProvide(from);
    if (found !== undefined) data[local] = found;
    else if (spec && Object.prototype.hasOwnProperty.call(spec, "default")) data[local] = spec.default;
  }
}

export function applyProvide(inst: Instance, provide: TagDef["provide"], scope: Scope): void {
  if (!provide) return;
  inst.provides = typeof provide === "function" ? provide.call(scope) : { ...provide };
}

function mountIfChain(chain: ElNode[], parent: Node, scope: Scope, ctx: CompileContext): void {
  const anchor = document.createComment("t-if");
  parent.appendChild(anchor);
  let current: { inst: Instance; nodes: Node[]; index: number } | null = null;
  const sources = chain.map((node) => {
    if (attrValue(node.attrs, "if") != null) return attrValue(node.attrs, "if") ?? "";
    if (attrValue(node.attrs, "elif") != null) return attrValue(node.attrs, "elif") ?? "";
    return "true";
  });
  const trackSrc = `[${sources.map((src) => `(${src})`).join(",")}]`;
  addSite(ctx, {
    kind: "show",
    node: anchor,
    label: `t-if ${sources[0]}`,
    rank: Rank.Structure,
    run() {
      applyReactive(this, ctx, scope, trackSrc, () => {
        let index = -1;
        for (let i = 0; i < chain.length; i++) {
          const src = sources[i];
          const on = src === "true" ? true : Boolean(runExpr(scope, src));
          if (on) {
            index = i;
            break;
          }
        }
        if (current && current.index === index) return;
        if (current) {
          current.inst.destroy();
          for (const live of current.nodes) live.parentNode?.removeChild(live);
          current = null;
        }
        if (index < 0) return;
        const branch = chain[index];
        const stripped: ElNode = {
          ...branch,
          attrs: branch.attrs.filter((attr) => attr.kind !== "if" && attr.kind !== "elif" && attr.kind !== "else"),
        };
        const inst = ctx.instance.child();
        const holder = document.createDocumentFragment();
        mountNode(stripped, holder, scope, { ...ctx, instance: inst });
        const nodes = [...holder.childNodes];
        for (const live of nodes) anchor.parentNode?.insertBefore(live, anchor);
        current = { inst, nodes, index };
      });
    },
  });
}

function isStaticNode(node: TmplNode, ctx: CompileContext): boolean {
  if (node.t === "live") return false;
  if (node.t === "text") return true;
  if (node.tag === "slot" || ctx.lookup(node.tag)) return false;
  for (const attr of node.attrs) if (attr.kind !== "static") return false;
  return node.children.every((child) => isStaticNode(child, ctx));
}

function serializeNode(node: TmplNode): string {
  if (node.t === "text") return node.value;
  if (node.t === "live") return "";
  const attrs = staticAttrs(node.attrs)
    .map((attr) => ` ${attr.name}="${attr.value.replace(/"/g, "&quot;")}"`)
    .join("");
  if (isVoidTag(node.tag)) return `<${node.tag}${attrs}>`;
  return `<${node.tag}${attrs}>${node.children.map(serializeNode).join("")}</${node.tag}>`;
}

function mountSlotNode(node: ElNode, parent: Node, scope: Scope, ctx: CompileContext): void {
  const name = staticAttrs(node.attrs).find((attr) => attr.name === "name")?.value || "default";
  const fill = ctx.fillers?.[name];
  if (fill && fill.length) {
    for (const child of fill) parent.appendChild(child);
    return;
  }
  mountAST(node.children, parent, scope, ctx);
}

function collectFillersAst(children: TmplNode[], scope: Scope, ctx: CompileContext): Record<string, Node[]> {
  const fillers: Record<string, Node[]> = { default: [] };
  for (const child of children) {
    if (child.t === "el" && attrValue(child.attrs, "slot") != null) {
      const name = attrValue(child.attrs, "slot") || "default";
      const dest = document.createDocumentFragment();
      if (child.tag === "template") mountAST(child.children, dest, scope, ctx);
      else {
        const stripped: ElNode = { ...child, attrs: child.attrs.filter((attr) => attr.kind !== "slot") };
        mountNode(stripped, dest, scope, ctx);
      }
      fillers[name] = [...dest.childNodes];
      continue;
    }
    if (child.t === "text" && !child.value.trim()) continue;
    const dest = document.createDocumentFragment();
    mountNode(child, dest, scope, ctx);
    fillers.default.push(...dest.childNodes);
  }
  return fillers;
}

/** Runtime helpers used by AOT factories generated from `.tee` files. */
export const rt = {
  live: rtLive,
  text(parent: Node, value: string) {
    parent.appendChild(document.createTextNode(value));
  },
  el(tag: string, ctx: CompileContext) {
    const el = document.createElement(tag);
    if (ctx.scopeId) el.setAttribute(ctx.scopeId, "");
    return el;
  },
  static(el: Element, name: string, value: string) {
    el.setAttribute(name, value);
  },
  on: bindEvent,
  bind: bindAttr,
  model: bindModel,
  html: bindHtml,
  ref: bindRef,
  cloak(el: Element) {
    el.removeAttribute("t-cloak");
  },
  onceCtx(ctx: CompileContext): CompileContext {
    return { ...ctx, once: true };
  },
  mount(parent: Node, scope: Scope, ctx: CompileContext, node: TmplNode) {
    mountNode(node, parent, scope, ctx);
  },
  nodes(parent: Node, scope: Scope, ctx: CompileContext, nodes: TmplNode[]) {
    mountAST(nodes, parent, scope, ctx);
  },
};
