import { hydrateFragment, parseTemplate, type CompileContext } from "./compile";
import { Engine } from "./engine";
import { Instance } from "./instance";
import { createRootScope, type Scope } from "./scope";
import type { MapSnapshot, TagDef, TeeOptions } from "./types";

const registry = new Map<string, TagDef>();

export const version = "0.1.0";

export function define(name: string, def: TagDef): TagDef {
  registry.set(name.toLowerCase(), def);
  return def;
}

export class TeeApp {
  readonly engine: Engine;
  readonly instance: Instance;
  readonly scope: Scope;
  readonly el: Element;
  private stopFlush?: () => void;

  constructor(options: TeeOptions) {
    this.engine = new Engine();
    this.instance = new Instance(this.engine);
    const data = resolveData(options.data);
    this.scope = createRootScope(
      this.engine,
      data,
      options.computed,
      options.methods,
      options.watch,
      this.instance,
    );
    this.instance.scope = this.scope;
    options.setup?.(this.scope);

    const host = resolveEl(options.el);
    const html = options.template ?? host.innerHTML;
    host.innerHTML = "";
    const fragment = parseTemplate(html);
    const tags = options.tags ?? {};
    const ctx: CompileContext = {
      engine: this.engine,
      instance: this.instance,
      lookup: (tag) => tags[tag] ?? registry.get(tag),
    };
    hydrateFragment(fragment, this.scope, ctx);
    host.append(fragment);
    this.el = host;
    options.ready?.(this.scope);
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

  onFlush(hook: () => void): () => void {
    return this.engine.onFlush(hook);
  }

  destroy(): void {
    this.stopFlush?.();
    this.instance.destroy();
    this.engine.destroy();
    this.el.innerHTML = "";
  }
}

export function create(options: TeeOptions): TeeApp {
  return new TeeApp(options);
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
};
