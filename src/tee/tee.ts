import { mountTemplate, applyInject, applyProvide, type CompileContext } from "./compile";
import { mountView, jsx, Fragment, For } from "./jsx";
import { Engine } from "./engine";
import { Instance } from "./instance";
import {
  computed,
  current,
  onMounted,
  onUnmounted,
  ref,
  runSetup,
  setup,
  watch,
  watchEffect,
} from "./chart";
import { createRootScope, type Scope } from "./scope";
import { define, lookupTag } from "./registry";
import type { MapSnapshot, TagDef, TeeOptions, TeePlugin } from "./types";

export { define } from "./registry";

let currentApp: TeeApp | null = null;

export const version = "0.9.7";

export function nextTick(fn?: () => void): Promise<void> {
  const p = currentApp ? currentApp.tick() : Promise.resolve();
  return fn ? p.then(() => fn()) : p;
}

export function use(plugin: TeePlugin): typeof Tee {
  plugin.install(Tee);
  return Tee;
}

export class TeeApp {
  readonly engine: Engine;
  readonly instance: Instance;
  readonly scope: Scope;
  readonly el: Element;
  private stopFlush?: () => void;

  constructor(options: TeeOptions) {
    currentApp = this;
    this.engine = new Engine();
    this.instance = new Instance(this.engine);
    const data = resolveData(options.data);
    applyInject(this.instance, options.inject, data);
    this.scope = createRootScope(
      this.engine,
      data,
      options.computed,
      options.methods,
      options.watch,
      this.instance,
    );
    this.instance.scope = this.scope;
    applyProvide(this.instance, options.provide, this.scope);
    options.created?.call(this.scope);
    if (options.setup) runSetup(this.scope, options.setup);

    const host = resolveEl(options.el);
    const html = options.template ?? (options.render ? "" : host.innerHTML);
    host.innerHTML = "";
    const tags = options.tags ?? {};
    const ctx: CompileContext = {
      engine: this.engine,
      instance: this.instance,
      lookup: (tag) => tags[tag] ?? lookupTag(tag),
      scope: this.scope,
    };
    const view = this.instance.setupView;
    if (view != null) mountView(host, view, ctx);
    else if (options.render) options.render(ctx, host);
    else mountTemplate(html, host, this.scope, ctx);
    host.removeAttribute("t-cloak");
    this.el = host;
    (this.scope as { $el?: Element }).$el = host;
    options.mounted?.call(this.scope);
    options.ready?.(this.scope);
    this.instance.hooks.mounted?.();
    this.instance.hooks.updated = chainHook(this.instance.hooks.updated, () => options.updated?.call(this.scope));
    this.instance.hooks.unmounted = chainHook(this.instance.hooks.unmounted, () => options.unmounted?.call(this.scope));
    this.stopFlush = this.engine.onFlush(() => fireUpdated(this.instance));
  }

  get data(): Record<string, unknown> {
    return this.scope;
  }

  tick(): Promise<void> {
    return this.engine.afterFlush();
  }

  maps(): MapSnapshot {
    return this.engine.snapshot();
  }

  stats() {
    return this.engine.lastFlush;
  }

  onFlush(hook: () => void): () => void {
    return this.engine.onFlush(hook);
  }

  destroy(): void {
    this.stopFlush?.();
    this.instance.destroy();
    this.engine.destroy();
    this.el.innerHTML = "";
    if (currentApp === this) currentApp = null;
  }
}

export function create(options: TeeOptions): TeeApp {
  return new TeeApp(options);
}

function fireUpdated(inst: Instance): void {
  inst.hooks.updated?.();
  for (const child of inst.children) fireUpdated(child);
}

function chainHook(prev: (() => void) | undefined, next: () => void): () => void {
  return prev
    ? () => {
        prev();
        next();
      }
    : next;
}

function resolveData(data: TeeOptions["data"]): Record<string, unknown> {
  if (!data) return {};
  return typeof data === "function" ? data() : { ...data };
}

function resolveEl(el: TeeOptions["el"]): Element {
  if (!el) throw new Error("Tee.create requires an `el` mount point");
  if (typeof el === "string") {
    const found = document.querySelector(el);
    if (!found) throw new Error(`Tee mount not found: ${el}`);
    return found;
  }
  return el;
}

export const Tee = {
  version,
  define,
  create,
  use,
  nextTick,
  setup,
  ref,
  computed,
  watch,
  watchEffect,
  onMounted,
  onUnmounted,
  current,
  jsx,
  Fragment,
  For,
};
