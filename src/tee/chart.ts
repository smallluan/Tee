import {
  SCOPE_HOST,
  defineAct,
  defineDerived,
  defineTrail,
  type Scope,
} from "./scope";
import type { Instance } from "./instance";
import type { TagDef } from "./types";

/**
 * Tee's composition surface. Not Vue setup(), not React hooks.
 *
 * A Chart is the named ledger behind the twin maps: slots (data paths),
 * derived slots, trails (non-DOM sites), and acts (named actions).
 * Templates, weaves, and trails all speak those names. There is no `.value`,
 * no `this`, and nothing is re-rendered.
 */
export type Chart = ChartApi & Record<string, unknown>;

export type WeaveFn = (c: Chart) => void;

export interface WeaveDef extends Omit<TagDef, "setup"> {
  install: WeaveFn;
}

const API_KEYS = new Set([
  "scope",
  "host",
  "hold",
  "derive",
  "trail",
  "act",
  "pin",
  "unpin",
  "weave",
  "slot",
]);

export class ChartApi {
  constructor(
    readonly scope: Scope,
    readonly host: Instance,
  ) {}

  /** Write fields into the ledger. Same names the template will read. */
  hold(values: Record<string, unknown>): Chart {
    for (const [name, value] of Object.entries(values)) this.scope[name] = value;
    return this as unknown as Chart;
  }

  /** S0 derived slot. Recomputes when recorded fields move; equal values cut downstream. */
  derive(name: string, read: (c: Chart) => unknown): Chart {
    const self = this as unknown as Chart;
    defineDerived(this.host, name, () => read(self));
    return self;
  }

  /** A site with no Node. It follows whatever slots it reads. Rank S3. */
  trail(label: string, run: (c: Chart) => void): Chart {
    const self = this as unknown as Chart;
    defineTrail(this.host, label, () => run(self));
    return self;
  }

  /** Named action. Templates fire it with `t-on:click="name"`. */
  act(name: string, fn: (c: Chart, ...args: unknown[]) => unknown): Chart {
    const self = this as unknown as Chart;
    defineAct(this.host, name, (...args: unknown[]) => fn(self, ...args));
    return self;
  }

  /** Sites are in the map and the real DOM is attached. */
  pin(fn: (c: Chart) => void): Chart {
    const self = this as unknown as Chart;
    this.host.hooks.pin = chain(this.host.hooks.pin, () => fn(self));
    return self;
  }

  /** Instance is being unlinked: sites die, nodes come off. */
  unpin(fn: (c: Chart) => void): Chart {
    const self = this as unknown as Chart;
    this.host.hooks.unmounted = chain(this.host.hooks.unmounted, () => fn(self));
    return self;
  }

  /** Nested weave. It writes into this same ledger. */
  weave(fn: WeaveFn): Chart {
    fn(this as unknown as Chart);
    return this as unknown as Chart;
  }

  slot(name: string): unknown {
    return this.scope.$lookup(name);
  }
}

export function chartOf(scope: Scope): Chart {
  const host = SCOPE_HOST.get(scope);
  if (!host) throw new Error("Tee chart: this scope has no host instance");
  const api = new ChartApi(scope, host);
  return new Proxy(api, {
    get(target, key, receiver) {
      if (typeof key === "symbol") return Reflect.get(target, key, receiver);
      if (API_KEYS.has(key) || key in ChartApi.prototype) return Reflect.get(target, key, receiver);
      return scope.$lookup(key);
    },
    set(_target, key, value) {
      if (typeof key === "symbol" || API_KEYS.has(key)) return false;
      scope.$assign(key, value);
      return true;
    },
    has(target, key) {
      if (typeof key === "symbol") return false;
      if (API_KEYS.has(key) || key in ChartApi.prototype) return true;
      return key in scope;
    },
  }) as Chart;
}

function chain(prev: (() => void) | undefined, next: () => void): () => void {
  return prev
    ? () => {
        prev();
        next();
      }
    : next;
}

/** A weave is a function that installs names and sites onto a chart. */
export function weave(install: WeaveFn): TagDef;
export function weave(def: WeaveDef): TagDef;
export function weave(input: WeaveFn | WeaveDef): TagDef {
  if (typeof input === "function") {
    return {
      setup(scope) {
        input(chartOf(scope as Scope));
      },
    };
  }
  const { install, ...rest } = input;
  return {
    ...rest,
    setup(scope) {
      rest.setup?.(scope);
      install(chartOf(scope as Scope));
    },
  };
}

export function runWeave(scope: Scope, fn: WeaveFn): Chart {
  const c = chartOf(scope);
  fn(c);
  return c;
}