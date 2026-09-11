import { display, isBooleanAttr, parseRepeat, splitInterpolation, writeText } from "./expr";
import type { Engine } from "./engine";
import { compileExpr } from "./ir";
import { Instance } from "./instance";
import { touchList } from "./observe";
import { runExpr, runStatement, type Scope, createRootScope } from "./scope";
import { Rank, rankOf } from "./strata";
import type { Site, TagDef } from "./types";

export interface CompileContext {
  engine: Engine;
  instance: Instance;
  lookup: (tag: string) => TagDef | undefined;
  fillers?: Record<string, Node[]>;
  parentScope?: Scope;
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
    if (name === "t-model") {
      bindModel(el, attr.value, scope, ctx);
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

function bindAttr(el: Element, name: string, src: string, scope: Scope, ctx: CompileContext): void {
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

function applyAttr(el: Element, name: string, value: unknown): void {
  if (name === "class" && value && typeof value === "object" && !Array.isArray(value)) {
    const next = Object.entries(value as Record<string, unknown>)
      .filter(([, on]) => on)
      .map(([cls]) => cls)
      .join(" ");
    if (next) el.setAttribute("class", next);
    else el.removeAttribute("class");
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

function bindEvent(el: Element, eventName: string, src: string, scope: Scope): void {
  el.addEventListener(eventName, (event) => {
    try {
      runStatement(scope, src, event);
    } catch (error) {
      console.error(error);
    }
  });
}

function bindModel(el: Element, path: string, scope: Scope, ctx: CompileContext): void {
  const isCheck = el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio");
  const eventName = isCheck || el instanceof HTMLSelectElement ? "change" : "input";
  el.addEventListener(eventName, () => {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
      return;
    }
    const value = isCheck && el instanceof HTMLInputElement ? el.checked : el.value;
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
  if (def.data || def.computed || def.methods || def.watch) {
    const data = def.data ? def.data() : {};
    scope = createRootScope(ctx.engine, data, def.computed, def.methods, def.watch, inst);
    inst.scope = scope;
    def.setup?.(scope);
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
