import type { Engine } from "./engine";
import { evalExpr, runStmt } from "./expr";
import { compileExpr, compileStmt } from "./ir";
import { observe } from "./observe";
import { Rank } from "./strata";
import type { ComputedMap, MethodMap, WatchSource } from "./types";
import type { Instance } from "./instance";

const UNSCOPABLES: Record<string, boolean> = {
  $engine: true,
  $names: true,
  $values: true,
  $child: true,
  $assign: true,
  $lookup: true,
  $refs: true,
  $emit: true,
  $nextTick: true,
};

export interface Scope extends Record<string, unknown> {
  $engine: Engine;
  $names(): string[];
  $values(names: string[]): unknown[];
  $child(locals: Record<string, unknown>): Scope;
  $assign(path: string, value: unknown): void;
  $lookup(name: string): unknown;
  $refs: Record<string, Element>;
  $emit: (name: string, payload?: unknown) => void;
  $nextTick: (fn?: () => void) => Promise<void>;
}

const COMPUTED = new WeakSet<() => unknown>();

export function createRootScope(
  engine: Engine,
  data: Record<string, unknown>,
  computed: ComputedMap | undefined,
  methods: MethodMap | undefined,
  watch: Record<string, WatchSource> | undefined,
  instance: Instance,
): Scope {
  const reactive = observe(data, engine) as Record<string, unknown>;
  const extras: Record<string, unknown> = {};

  let scope!: Scope;

  if (methods) {
    for (const [name, fn] of Object.entries(methods)) {
      extras[name] = (...args: unknown[]) => fn.apply(scope, args);
    }
  }

  if (computed) {
    for (const [name, fn] of Object.entries(computed)) {
      const reader = bindComputed(engine, name, () => fn.call(scope), instance);
      COMPUTED.add(reader);
      extras[name] = reader;
    }
  }

  extras.$refs = {};
  extras.$emit = (name: string, payload?: unknown) => {
    instance.listeners[name]?.(payload);
  };
  extras.$nextTick = (fn?: () => void) => {
    const p = engine.afterFlush();
    return fn ? p.then(fn) : p;
  };

  scope = makeScope(engine, reactive, extras, null, instance);
  if (watch) bindWatchers(engine, scope, watch, instance);
  return scope;
}

function bindComputed(
  engine: Engine,
  name: string,
  getter: () => unknown,
  instance: Instance,
): () => unknown {
  const key = engine.nextComputedId(name);
  let cache: unknown = undefined;

  const site: import("./types").Site = {
    id: engine.nextSiteId(),
    kind: "computed",
    node: null,
    label: `computed ${name}`,
    rank: Rank.Derived,
    run: () => {
      if (site.linked && !engine.stale(site)) {
        engine.stats.skipClock += 1;
        return;
      }
      engine.startTrack();
      let next: unknown;
      try {
        next = getter();
      } finally {
        engine.commitTrack(site, engine.stopTrack());
      }
      const changed = !Object.is(next, cache);
      cache = next;
      if (changed) engine.notify(key);
      else engine.stats.skipEqual += 1;
    },
  };
  instance.sites.push(site);

  const reader = () => {
    engine.record(key, name);
    if (!site.linked || engine.stale(site)) site.run();
    else engine.stats.skipClock += 1;
    return cache;
  };
  return reader;
}

function bindWatchers(
  engine: Engine,
  scope: Scope,
  watch: Record<string, WatchSource>,
  instance: Instance,
): void {
  for (const [path, source] of Object.entries(watch)) {
    const handler = typeof source === "function" ? source : source.handler;
    let prev: unknown = undefined;
    let primed = false;
    const site = {
      id: engine.nextSiteId(),
      kind: "watch" as const,
      node: null,
      label: `watch ${path}`,
      rank: Rank.Watch,
      run: () => {
        if (site.linked && !engine.stale(site)) {
          engine.stats.skipClock += 1;
          return;
        }
        engine.startTrack();
        let next: unknown;
        try {
          next = readPath(scope, path);
        } finally {
          engine.commitTrack(site, engine.stopTrack());
        }
        if (!primed) {
          primed = true;
          prev = next;
          if (typeof source !== "function" && source.immediate) handler.call(scope, next, undefined);
          return;
        }
        if (!Object.is(next, prev)) handler.call(scope, next, prev);
        else engine.stats.skipEqual += 1;
        prev = next;
      },
    };
    instance.sites.push(site);
    site.run();
  }
}

export function readPath(scope: Scope, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = scope;
  for (let i = 0; i < parts.length; i++) {
    if (cur == null) return undefined;
    const key = parts[i];
    if (cur === scope) cur = scope.$lookup(key);
    else cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function makeScope(
  engine: Engine,
  frame: Record<string, unknown>,
  extras: Record<string, unknown>,
  parent: Scope | null,
  instance: Instance,
): Scope {
  const api: Record<string, unknown> = {};

  function lookup(name: string): unknown {
    if (Object.prototype.hasOwnProperty.call(extras, name)) {
      const value = extras[name];
      if (typeof value === "function" && COMPUTED.has(value as () => unknown)) {
        return (value as () => unknown)();
      }
      return value;
    }
    if (Reflect.has(frame, name)) return frame[name];
    if (parent) return parent.$lookup(name);
    return undefined;
  }

  function assign(name: string, value: unknown): void {
    if (Object.prototype.hasOwnProperty.call(extras, name)) return;
    if (Reflect.has(frame, name) || !parent) {
      frame[name] = value;
      return;
    }
    parent.$assign(name, value);
  }

  function names(): string[] {
    const set = new Set<string>();
    for (const key of Object.keys(extras)) set.add(key);
    for (const key of Reflect.ownKeys(frame)) {
      if (typeof key === "string" && !key.startsWith("__tee")) set.add(key);
    }
    if (parent) for (const n of parent.$names()) set.add(n);
    return [...set];
  }

  api.$engine = engine;
  api.$names = names;
  api.$values = (keys: string[]) => keys.map((n) => lookup(n));
  api.$child = (locals: Record<string, unknown>) =>
    makeScope(engine, observe(locals, engine) as Record<string, unknown>, {}, scope, instance);
  api.$assign = (path: string, value: unknown) => {
    const parts = path.split(".");
    if (parts.length === 1) {
      assign(parts[0], value);
      return;
    }
    let obj: unknown = lookup(parts[0]);
    for (let i = 1; i < parts.length - 1; i++) obj = (obj as Record<string, unknown>)?.[parts[i]];
    if (obj && typeof obj === "object") (obj as Record<string, unknown>)[parts[parts.length - 1]] = value;
  };
  api.$lookup = lookup;

  const scope = new Proxy(Object.create(null), {
    get(_t, key) {
      if (key === Symbol.unscopables) return UNSCOPABLES;
      if (typeof key === "symbol") return undefined;
      if (key in api) return api[key];
      return lookup(key);
    },
    set(_t, key, value) {
      if (typeof key === "symbol" || key in api) return false;
      assign(key, value);
      return true;
    },
    has(_t, key) {
      if (typeof key === "symbol") return false;
      if (key in api) return true;
      if (Object.prototype.hasOwnProperty.call(extras, key)) return true;
      if (Reflect.has(frame, key)) return true;
      return parent ? (key as string) in parent : false;
    },
    ownKeys: () => names(),
    getOwnPropertyDescriptor(_t, key) {
      if (typeof key === "symbol" || !Reflect.has(scope, key)) return undefined;
      return {
        configurable: true,
        enumerable: true,
        get: () => (typeof key === "string" ? lookup(key) : undefined),
        set: (value: unknown) => {
          if (typeof key === "string") assign(key, value);
        },
      };
    },
  }) as Scope;

  return scope;
}

export function runExpr(scope: Scope, src: string): unknown {
  const plan = compileExpr(src);
  if (plan.run) return plan.run((name) => scope.$lookup(name));
  return evalExpr(src, scope);
}

export function runStatement(scope: Scope, src: string, event?: Event): unknown {
  const plan = compileStmt(src);
  if (plan.t === "assign") {
    const value = plan.run((name) => scope.$lookup(name));
    scope.$assign(plan.path.join("."), value);
    return value;
  }
  if (plan.t === "call") return plan.run((name) => scope.$lookup(name));
  return runStmt(src, scope, event);
}
