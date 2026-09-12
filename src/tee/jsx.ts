import { current, isTeeComponent, runSetup, type Self } from "./chart";
import { applyInject, applyProvide, mountTemplate, type CompileContext } from "./compile";
import { Engine } from "./engine";
import { display, isBooleanAttr, writeText } from "./expr";
import { Instance } from "./instance";
import { touchList } from "./observe";
import { runStmt } from "./expr";
import { lookupTag } from "./registry";
import { createRootScope, type Scope } from "./scope";
import { Rank, rankOf } from "./strata";
import type { Site, TagDef } from "./types";

export type TeeView = Node | DocumentFragment | TeeChild[] | IfBranch | RepeatBranch | ComponentBranch;
export type TeeChild = TeeView | string | number | boolean | null | undefined | (() => unknown) | unknown;

const VIEW = Symbol("tee-view");
const viewStack: CompileContext[] = [];

interface IfBranch {
  [VIEW]: "if" | "elif" | "else";
  cond?: () => unknown;
  render: (ctx: CompileContext) => TeeView;
}

interface RepeatBranch {
  [VIEW]: "repeat";
  list: unknown;
  item: string;
  index: string;
  key?: string;
  render: (ctx: CompileContext, item: unknown, index: number) => TeeView;
}

/** Not mounted yet. t-if / For remount must instantiate again — a consumed DocumentFragment is empty. */
interface ComponentBranch {
  [VIEW]: "component";
  def: TagDef;
  props: Record<string, unknown>;
  children: unknown;
}

export function isTeeView(value: unknown): boolean {
  if (value == null || typeof value === "boolean") return false;
  if (typeof value === "string" || typeof value === "number") return true;
  if (value instanceof Node) return true;
  if (Array.isArray(value)) return true;
  return typeof value === "object" && VIEW in (value as object);
}

export function withView<T>(ctx: CompileContext, fn: () => T): T {
  viewStack.push(ctx);
  try {
    return fn();
  } finally {
    viewStack.pop();
  }
}

export function viewSelf(): Self {
  const scope = viewCtx().scope;
  if (!scope) throw new Error("<Link> / <RouterView> need a mounted Tee view");
  return scope as Self;
}

function viewCtx(): CompileContext {
  if (viewStack.length) return viewStack[viewStack.length - 1];
  const c = current();
  return {
    engine: c.scope.$engine,
    instance: c.host,
    lookup: (tag) => lookupTag(tag),
    scope: c.scope,
  };
}

export function jsx(
  type: string | TagDef | ((props: Record<string, unknown>) => TeeView),
  props: Record<string, unknown> | null,
  _key?: unknown,
): TeeView {
  const all = props ?? {};
  const { children, ...rest } = all;
  if (isTeeComponent(type) || isTagDef(type)) {
    return asComponent(type, rest, children);
  }
  if (typeof type === "function") {
    return type({ ...rest, children });
  }
  if (type === Fragment || type === "Fragment") {
    return flatten(children);
  }
  if (type === "For") {
    return For({ ...rest, children } as Parameters<typeof For>[0]);
  }
  return createElement(type, rest, children);
}

export const jsxs = jsx;
export const jsxDEV = jsx;

export function Fragment(props: { children?: TeeChild }): TeeView {
  return flatten(props.children);
}

function flatten(children: unknown): TeeChild[] {
  if (children == null || children === false || children === true) return [];
  if (Array.isArray(children)) return children.flatMap((child) => flatten(child));
  return [children as TeeChild];
}

function createElement(tag: string, props: Record<string, unknown>, children: unknown): TeeView {
  const ctx = viewCtx();
  const ifKind = branchKind(props);
  if (ifKind) {
    const cond = ifKind === "else" ? undefined : asGetter(props["t-if"] ?? props["t-else-if"]);
    const clean = strip(props, ["t-if", "t-else-if", "t-else"]);
    return {
      [VIEW]: ifKind,
      cond,
      render: (inner) => withView(inner, () => createElement(tag, clean, children)),
    };
  }
  if (props["t-repeat"] != null) {
    const spec = parseRepeatSpec(props["t-repeat"]);
    const clean = strip(props, ["t-repeat", "t-for", "t-key"]);
    return {
      [VIEW]: "repeat",
      list: spec.list,
      item: spec.item,
      index: spec.index,
      key: typeof props["t-key"] === "string" ? props["t-key"] : undefined,
      render: (inner, item, index) => {
        const scope = Object.create(inner.scope ?? {}) as Scope;
        (scope as Record<string, unknown>)[spec.item] = item;
        (scope as Record<string, unknown>)[spec.index] = index;
        return withView({ ...inner, scope }, () => createElement(tag, clean, children));
      },
    };
  }
  if (tag === "slot") {
    return renderSlot(props, children, ctx);
  }
  const def = ctx.lookup(tag.toLowerCase()) ?? lookupTag(tag);
  if (def) {
    return asComponent(def, props, children);
  }
  const el = document.createElement(tag);
  bindProps(el, props, ctx);
  appendChildren(el, flatten(children), ctx);
  return el;
}

function isTagDef(value: unknown): value is TagDef {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (value instanceof Node) return false;
  if (VIEW in (value as object)) return false;
  const rec = value as TagDef;
  return typeof rec.setup === "function" || typeof rec.template === "string" || typeof rec.render === "function";
}

function renderSlot(props: Record<string, unknown>, children: unknown, ctx: CompileContext): TeeView {
  const name = String(readOnce(props.name) ?? "default");
  const fill = ctx.fillers?.[name];
  if (fill?.length) return fill;
  return flatten(children);
}

function mountTagDef(def: TagDef, props: Record<string, unknown>, children: unknown): TeeView {
  const ctx = viewCtx();
  const inst = ctx.instance.child();
  const data: Record<string, unknown> = def.data ? { ...def.data() } : {};
  const events: Array<[string, unknown]> = [];
  const bound: Array<[string, () => unknown]> = [];
  for (const [raw, value] of Object.entries(props)) {
    if (value == null || raw === "children") continue;
    const name = raw === "className" ? "class" : raw;
    if (name.startsWith("t-on:") || /^on[A-Z]/.test(name)) {
      events.push([eventName(name), value]);
      continue;
    }
    if (typeof value === "function" && !isEventValue(value)) {
      data[name] = (value as () => unknown)();
      bound.push([name, value as () => unknown]);
      continue;
    }
    data[name] = value;
  }
  for (const [event, value] of events) {
    inst.listeners[event] = (payload: unknown) => {
      if (typeof value === "function") value(payload);
    };
  }
  applyInject(inst, def.inject, data);
  const innerScope = createRootScope(ctx.engine, data, def.computed, def.methods, def.watch, inst);
  inst.scope = innerScope;
  applyProvide(inst, def.provide, innerScope);
  def.created?.call(innerScope);
  const slotHolder = document.createDocumentFragment();
  appendChildren(slotHolder, flatten(children), ctx);
  const fillers: Record<string, Node[]> = { default: [...slotHolder.childNodes] };
  const innerCtx: CompileContext = {
    ...ctx,
    instance: inst,
    scope: innerScope,
    parentScope: ctx.scope,
    fillers,
    lookup: (tag) => ctx.lookup(tag) ?? lookupTag(tag),
  };
  const out = withView(innerCtx, () => {
    if (def.setup) runSetup(innerScope, def.setup);
    const holder = document.createDocumentFragment();
    const view = inst.setupView;
    if (view != null) mountView(holder, view, innerCtx);
    else if (def.render) def.render(innerCtx, holder);
    else if (def.template) mountTemplate(def.template, holder, innerScope, innerCtx);
    return holder;
  });
  for (const [name, get] of bound) {
    bindGetter(innerCtx, "attr", out, `prop ${name}`, get, (value) => {
      innerScope.$assign(name, value);
    });
  }
  def.mounted?.call(innerScope);
  inst.hooks.mounted?.();
  inst.hooks.updated = chainHook(inst.hooks.updated, () => def.updated?.call(innerScope));
  inst.hooks.unmounted = chainHook(inst.hooks.unmounted, () => def.unmounted?.call(innerScope));
  return out;
}

function chainHook(prev: (() => void) | undefined, next: () => void): () => void {
  return prev
    ? () => {
        prev();
        next();
      }
    : next;
}

function branchKind(props: Record<string, unknown>): IfBranch[typeof VIEW] | null {
  if (props["t-if"] != null) return "if";
  if (props["t-else-if"] != null) return "elif";
  if (props["t-else"] != null && props["t-else"] !== false) return "else";
  return null;
}

function strip(props: Record<string, unknown>, names: string[]): Record<string, unknown> {
  const next = { ...props };
  for (const name of names) delete next[name];
  return next;
}

function parseRepeatSpec(value: unknown): { list: unknown; item: string; index: string } {
  if (typeof value === "string") {
    const match = value.trim().match(/^(?:\(([^)]+)\)|([A-Za-z_$][\w$]*))(?:\s*,\s*([A-Za-z_$][\w$]*))?\s+in\s+(.+)$/);
    if (match) {
      return {
        item: (match[1] ?? match[2]).split(",")[0].trim(),
        index: match[3] ?? (match[1]?.includes(",") ? match[1].split(",")[1].trim() : "$index"),
        list: match[4].trim(),
      };
    }
  }
  return { list: value, item: "item", index: "$index" };
}

function bindProps(el: Element, props: Record<string, unknown>, ctx: CompileContext): void {
  for (const [raw, value] of Object.entries(props)) {
    if (value == null || raw === "children") continue;
    const name = raw === "className" ? "class" : raw;
    if (name.startsWith("t-on:") || /^on[A-Z]/.test(name)) {
      bindEvent(el, eventName(name), value, ctx);
      continue;
    }
    if (name === "t-model" || name.startsWith("t-model.") || name.startsWith("t-model:")) {
      bindModel(
        el,
        String(readOnce(value)),
        name.slice("t-model".length).replace(/^[.:]/, "").split(/[.:]/).filter(Boolean),
        ctx,
      );
      continue;
    }
    if (name === "t-ref") {
      const key = String(readOnce(value));
      const refs = (ctx.scope as Self | undefined)?.$refs;
      if (refs) refs[key] = el as HTMLElement;
      continue;
    }
    if (name === "t-html") {
      bindGetter(ctx, "attr", el, "html", asGetter(value), (next) => {
        el.innerHTML = display(next);
      });
      continue;
    }
    if (typeof value === "function" && !isEventValue(value)) {
      bindGetter(ctx, "attr", el, name, value as () => unknown, (next) => applyAttr(el, name, next));
      continue;
    }
    applyAttr(el, name, value);
  }
}

function eventName(name: string): string {
  if (name.startsWith("t-on:")) return name.slice(5);
  return name.slice(2).toLowerCase();
}

function isEventValue(value: unknown): boolean {
  return typeof value === "function" && value.length > 0;
}

function bindEvent(el: Element, spec: string, value: unknown, ctx: CompileContext): void {
  const parts = spec.split(".");
  const name = parts[0];
  const mods = parts.slice(1);
  const handler = (event: Event) => {
    if (mods.includes("self") && event.target !== el) return;
    if (mods.includes("prevent")) event.preventDefault();
    if (mods.includes("stop")) event.stopPropagation();
    if (typeof value === "function") {
      value(event);
      return;
    }
    if (typeof value === "string" && ctx.scope) runStmt(value, ctx.scope, event);
  };
  el.addEventListener(name, handler, { capture: mods.includes("capture"), once: mods.includes("once") });
}

function bindModel(el: Element, path: string, mods: string[], ctx: CompileContext): void {
  if (!ctx.scope || !path) return;
  const isCheck = el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio");
  const eventName = mods.includes("lazy") || isCheck || el instanceof HTMLSelectElement ? "change" : "input";
  el.addEventListener(eventName, () => {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return;
    let next: unknown = isCheck && el instanceof HTMLInputElement ? el.checked : el.value;
    if (typeof next === "string" && mods.includes("trim")) next = next.trim();
    if (typeof next === "string" && mods.includes("number")) next = next === "" ? "" : Number(next);
    ctx.scope!.$assign(path, next);
  });
  bindGetter(ctx, "model", el, `model ${path}`, () => ctx.scope!.$lookup(path), (value) => {
    if (el instanceof HTMLInputElement && isCheck) {
      el.checked = Boolean(value);
    } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      const text = display(value);
      if (el.value !== text) el.value = text;
    }
  });
}

function applyAttr(el: Element, name: string, value: unknown): void {
  if (name === "class") {
    const next = classToString(value);
    if (next) el.setAttribute("class", next);
    else el.removeAttribute("class");
    return;
  }
  if (name === "style") {
    const next = typeof value === "string" ? value : styleToString(value);
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

function styleToString(value: unknown): string {
  if (!value || typeof value !== "object") return display(value);
  return Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v != null && v !== false && v !== "")
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (ch) => "-" + ch.toLowerCase())}:${v}`)
    .join(";");
}

function appendChildren(parent: Node, children: TeeChild[], ctx: CompileContext): void {
  const pending: IfBranch[] = [];
  const flushIf = () => {
    if (!pending.length) return;
    mountIf(parent, pending.splice(0), ctx);
  };
  for (const child of children) {
    if (isIf(child)) {
      if (child[VIEW] === "if") flushIf();
      pending.push(child);
      continue;
    }
    flushIf();
    if (isRepeat(child)) {
      mountRepeat(parent, child, ctx);
      continue;
    }
    if (isComponent(child)) {
      appendOne(parent, mountComponent(child, ctx), ctx);
      continue;
    }
    appendOne(parent, child, ctx);
  }
  flushIf();
}

function appendOne(parent: Node, child: TeeChild, ctx: CompileContext): void {
  if (child == null || child === false || child === true) return;
  if (typeof child === "function") {
    const text = document.createTextNode("");
    parent.appendChild(text);
    bindGetter(ctx, "text", text, "text", child, (value) => writeText(text, value));
    return;
  }
  if (typeof child === "string" || typeof child === "number") {
    parent.appendChild(document.createTextNode(String(child)));
    return;
  }
  if (child instanceof DocumentFragment || child instanceof Node) {
    parent.appendChild(child);
    return;
  }
  if (Array.isArray(child)) {
    appendChildren(parent, flatten(child), ctx);
  }
}

export function mountView(parent: Node, view: unknown, ctx: CompileContext): void {
  withView(ctx, () => appendChildren(parent, flatten(view), ctx));
}

function isIf(value: unknown): value is IfBranch {
  if (!value || typeof value !== "object") return false;
  const kind = (value as IfBranch)[VIEW];
  return kind === "if" || kind === "elif" || kind === "else";
}

function isRepeat(value: unknown): value is RepeatBranch {
  return Boolean(value && typeof value === "object" && (value as RepeatBranch)[VIEW] === "repeat");
}

function isComponent(value: unknown): value is ComponentBranch {
  return Boolean(value && typeof value === "object" && (value as ComponentBranch)[VIEW] === "component");
}

function asComponent(def: TagDef, props: Record<string, unknown>, children: unknown): ComponentBranch {
  return { [VIEW]: "component", def, props, children };
}

function mountComponent(child: ComponentBranch, ctx: CompileContext): TeeView {
  return withView(ctx, () => mountTagDef(child.def, child.props, child.children));
}

function mountIf(parent: Node, chain: IfBranch[], ctx: CompileContext): void {
  const anchor = document.createComment("t-if");
  parent.appendChild(anchor);
  let current: { inst: Instance; nodes: Node[]; index: number } | null = null;
  bindGetter(
    ctx,
    "show",
    anchor,
    "t-if",
    () => {
      for (let i = 0; i < chain.length; i++) {
        const item = chain[i];
        if (item[VIEW] === "else" || Boolean(item.cond?.())) return i;
      }
      return -1;
    },
    (index) => {
      const next = Number(index);
      if (current?.index === next) return;
      if (current) {
        current.inst.destroy();
        for (const node of current.nodes) node.parentNode?.removeChild(node);
        current = null;
      }
      if (next < 0) return;
      const inst = ctx.instance.child();
      const inner = { ...ctx, instance: inst };
      const holder = document.createDocumentFragment();
      appendChildren(holder, flatten(chain[next].render(inner)), inner);
      const nodes = [...holder.childNodes];
      for (const node of nodes) anchor.parentNode?.insertBefore(node, anchor);
      current = { inst, nodes, index: next };
    },
  );
}

function mountRepeat(parent: Node, spec: RepeatBranch, ctx: CompileContext): void {
  const start = document.createComment("t-repeat");
  const end = document.createComment("/t-repeat");
  parent.appendChild(start);
  parent.appendChild(end);
  const rows = new Map<string, { inst: Instance; nodes: Node[] }>();
  bindGetter(ctx, "repeat", start, "t-repeat", () => readList(spec.list, ctx), (value) => {
    const items = Array.isArray(value) ? value : [];
    touchList(items, ctx.engine);
    const used = new Set<string>();
    const ordered: Node[] = [];
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      let key = keyOf(item, index, spec.key, spec.item, spec.index, ctx.scope);
      while (used.has(key)) key += "#" + index;
      used.add(key);
      let row = rows.get(key);
      if (!row) {
        const inst = ctx.instance.child();
        const inner = { ...ctx, instance: inst };
        const holder = document.createDocumentFragment();
        appendChildren(holder, flatten(spec.render(inner, item, index)), inner);
        row = { inst, nodes: [...holder.childNodes] };
        rows.set(key, row);
      }
      for (const node of row.nodes) ordered.push(node);
    }
    for (const [key, row] of rows) {
      if (used.has(key)) continue;
      row.inst.destroy();
      for (const node of row.nodes) node.parentNode?.removeChild(node);
      rows.delete(key);
    }
    const frag = document.createDocumentFragment();
    for (const node of ordered) frag.appendChild(node);
    end.parentNode?.insertBefore(frag, end);
  });
}

function readList(list: unknown, ctx: CompileContext): unknown {
  if (typeof list === "function") return (list as () => unknown)();
  if (typeof list === "string" && ctx.scope) return ctx.scope.$lookup(list);
  return list;
}

function keyOf(
  item: unknown,
  index: number,
  keySrc: string | undefined,
  itemName: string,
  indexName: string,
  scope: Scope | undefined,
): string {
  if (!keySrc) return String(index);
  if (keySrc.startsWith(itemName + ".") && item && typeof item === "object") {
    return String((item as Record<string, unknown>)[keySrc.slice(itemName.length + 1)]);
  }
  if (scope) {
    const prevItem = (scope as Record<string, unknown>)[itemName];
    const prevIndex = (scope as Record<string, unknown>)[indexName];
    (scope as Record<string, unknown>)[itemName] = item;
    (scope as Record<string, unknown>)[indexName] = index;
    const value = scope.$lookup ? undefined : undefined;
    void value;
    (scope as Record<string, unknown>)[itemName] = prevItem;
    (scope as Record<string, unknown>)[indexName] = prevIndex;
  }
  if (item && typeof item === "object" && "id" in (item as object)) return String((item as { id: unknown }).id);
  return String(index);
}

export function For<T>(props: {
  each: T[] | (() => T[]);
  by?: string | ((item: T, index: number) => string);
  children: (item: T, index: number) => TeeView;
}): TeeView {
  const key = typeof props.by === "string" ? `item.${props.by}` : undefined;
  return {
    [VIEW]: "repeat",
    list: props.each,
    item: "item",
    index: "$index",
    key,
    render: (inner, item, index) => withView(inner, () => props.children(item as T, index)),
  };
}

function asGetter(value: unknown): () => unknown {
  if (typeof value === "function") return value as () => unknown;
  return () => value;
}

function readOnce(value: unknown): unknown {
  return typeof value === "function" ? (value as () => unknown)() : value;
}

function bindGetter(
  ctx: CompileContext,
  kind: Site["kind"],
  node: Node,
  label: string,
  get: () => unknown,
  apply: (value: unknown) => void,
): Site {
  const engine: Engine = ctx.engine;
  const site: Site = {
    id: engine.nextSiteId(),
    kind,
    node,
    label,
    rank: rankOf(kind, kind === "show" || kind === "repeat"),
    run() {
      if (site.dead) return;
      if (site.linked && !engine.stale(site)) {
        engine.stats.skipClock += 1;
        return;
      }
      engine.startTrack();
      let value: unknown;
      try {
        value = get();
        if (kind === "repeat") touchList(value, engine);
      } catch (error) {
        console.error(error);
        value = site.last;
      } finally {
        engine.commitTrack(site, engine.stopTrack());
      }
      if (kind !== "show" && kind !== "repeat" && Object.is(value, site.last)) {
        engine.stats.skipEqual += 1;
        return;
      }
      site.last = value;
      engine.stats.patch += 1;
      apply(value);
    },
  };
  site.rank = kind === "show" || kind === "repeat" ? Rank.Structure : rankOf(kind, false);
  ctx.instance.sites.push(site);
  engine.launchSite(site);
  return site;
}

type TeeHandler<E> = ((event: E) => void) | string;

type TeeOnEvents = {
  [K in keyof HTMLElementEventMap as `t-on:${K}`]?: TeeHandler<HTMLElementEventMap[K]>;
} & {
  [K in keyof HTMLElementEventMap as `on${Capitalize<string & K>}`]?: TeeHandler<HTMLElementEventMap[K]>;
};

export interface TeeAttributes extends TeeOnEvents {
  children?: TeeChild | TeeChild[];
  class?: unknown;
  className?: unknown;
  id?: unknown;
  style?: unknown;
  title?: unknown;
  name?: unknown;
  type?: unknown;
  value?: unknown;
  checked?: unknown;
  disabled?: unknown;
  placeholder?: unknown;
  href?: unknown;
  src?: unknown;
  alt?: unknown;
  role?: unknown;
  tabindex?: unknown;
  "t-if"?: unknown;
  "t-else-if"?: unknown;
  "t-else"?: unknown;
  "t-show"?: unknown;
  "t-repeat"?: unknown;
  "t-for"?: unknown;
  "t-key"?: unknown;
  "t-model"?: unknown;
  "t-model:trim"?: unknown;
  "t-model:number"?: unknown;
  "t-model:lazy"?: unknown;
  "t-model.trim"?: unknown;
  "t-model.number"?: unknown;
  "t-model.lazy"?: unknown;
  "t-ref"?: unknown;
  "t-html"?: unknown;
  "t-text"?: unknown;
  [attr: string]: unknown;
}

export namespace JSX {
  export type Element = TeeView;
  export interface ElementChildrenAttribute {
    children: TeeChild | TeeChild[];
  }
  export type IntrinsicElements = {
    [K in keyof HTMLElementTagNameMap]: TeeAttributes;
  } & {
    [elem: string]: TeeAttributes;
  };
}
