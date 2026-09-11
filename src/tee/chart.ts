import {
  SCOPE_HOST,
  defineComputed,
  defineMethod,
  defineWatch,
  type Scope,
} from "./scope";
import type { Instance } from "./instance";
import type { TagDef } from "./types";

/**
 * Script and template share one reactive object. Composition writes
 * fields onto that object. Updates patch mapped DOM nodes — nothing
 * re-renders, and nothing is renamed for the sake of sounding new.
 *
 * The words are the ones people already know. The contract is not Vue's:
 * names on `self` are the same names in `{{ }}`. A composable is a function
 * that writes onto `self` (or returns fields that get written onto `self`).
 */

export type Self = CtxApi & Record<string, unknown>;
export type Ctx = Self;

const stack: Ctx[] = [];

const CTX_KEYS = new Set(["scope", "host"]);

export interface Ref<T> {
  value: T;
}

type RefBox<T> = Ref<T> & { __tee: "ref" };
type ComputedBox<T> = Ref<T> & { __tee: "computed"; get: () => T };

export function ref<T>(value: T): Ref<T> {
  return { __tee: "ref", value } as RefBox<T>;
}

export function computed<T>(get: () => T): Ref<T> {
  const box: ComputedBox<T> = {
    __tee: "computed",
    get,
    get value() {
      return get();
    },
    set value(_) {
      /* derived */
    },
  };
  return box;
}

export interface WatchOptions {
  immediate?: boolean;
}

export function watch(effect: () => void): () => void;
export function watch<T>(
  source: () => T,
  cb: (next: T, prev: T | undefined) => void,
  options?: WatchOptions,
): () => void;
export function watch(
  source: string,
  cb: (next: unknown, prev: unknown | undefined) => void,
  options?: WatchOptions,
): () => void;
export function watch(
  source: (() => unknown) | string | Ref<unknown>,
  cb?: (next: unknown, prev: unknown | undefined) => void,
  options?: WatchOptions,
): () => void {
  const c = current();
  if (!cb) {
    return defineWatch(c.host, "effect", () => {
      (source as () => void)();
    });
  }
  let prev: unknown;
  let primed = false;
  return defineWatch(c.host, "watch", () => {
    const next = readSource(c, source);
    if (!primed) {
      primed = true;
      prev = next;
      if (options?.immediate) cb(next, undefined);
      return;
    }
    if (!Object.is(next, prev)) cb(next, prev);
    prev = next;
  });
}

export function watchEffect(effect: () => void): () => void {
  return watch(effect);
}

export function onMounted(fn: () => void): void {
  const c = current();
  c.host.hooks.mounted = chain(c.host.hooks.mounted, fn);
}

export function onUnmounted(fn: () => void): void {
  const c = current();
  c.host.hooks.unmounted = chain(c.host.hooks.unmounted, fn);
}

export function current(): Ctx {
  const c = stack[stack.length - 1];
  if (!c) throw new Error("computed / watch / onMounted must run inside setup()");
  return c;
}

class CtxApi {
  constructor(
    readonly scope: Scope,
    readonly host: Instance,
  ) {}
}

export function ctxOf(scope: Scope): Ctx {
  const host = SCOPE_HOST.get(scope);
  if (!host) throw new Error("Tee setup() needs a mounted instance");
  const api = new CtxApi(scope, host);
  return new Proxy(api, {
    get(target, key, receiver) {
      if (typeof key === "symbol") return Reflect.get(target, key, receiver);
      if (CTX_KEYS.has(key) || key in CtxApi.prototype) return Reflect.get(target, key, receiver);
      if (key.startsWith("$")) return (scope as unknown as Record<string, unknown>)[key];
      return scope.$lookup(key);
    },
    set(_target, key, value) {
      if (typeof key === "symbol" || CTX_KEYS.has(key)) return false;
      bindKey(host, scope, String(key), value);
      return true;
    },
    has(_target, key) {
      if (typeof key === "symbol") return false;
      if (CTX_KEYS.has(key)) return true;
      return key in scope;
    },
  }) as Ctx;
}

function readSource(c: Ctx, source: (() => unknown) | string | Ref<unknown>): unknown {
  if (typeof source === "string") return c.scope.$lookup(source);
  if (isRef(source) || isComputed(source)) return source.value;
  return source();
}

function bindKey(host: Instance, scope: Scope, name: string, value: unknown): void {
  if (isRef(value)) {
    scope.$assign(name, value.value);
    Object.defineProperty(value, "value", {
      configurable: true,
      get: () => scope.$lookup(name),
      set: (next: unknown) => scope.$assign(name, next),
    });
    return;
  }
  if (isComputed(value)) {
    defineComputed(host, name, value.get);
    return;
  }
  if (typeof value === "function") {
    defineMethod(host, name, value as (...args: unknown[]) => unknown);
    return;
  }
  scope.$assign(name, value);
}

function applyReturn(c: Ctx, values: Record<string, unknown>): void {
  for (const [name, value] of Object.entries(values)) bindKey(c.host, c.scope, name, value);
}

function isRef(value: unknown): value is RefBox<unknown> {
  return Boolean(value && typeof value === "object" && (value as RefBox<unknown>).__tee === "ref");
}

function isComputed(value: unknown): value is ComputedBox<unknown> {
  return Boolean(value && typeof value === "object" && (value as ComputedBox<unknown>).__tee === "computed");
}

function chain(prev: (() => void) | undefined, next: () => void): () => void {
  return prev
    ? () => {
        prev();
        next();
      }
    : next;
}

export function runSetup(scope: Scope, fn: SetupFn): Ctx {
  const c = ctxOf(scope);
  stack.push(c);
  try {
    const out = fn(c);
    if (out && typeof out === "object" && !isRef(out) && !isComputed(out)) {
      applyReturn(c, out as Record<string, unknown>);
    }
    return c;
  } finally {
    stack.pop();
  }
}

export type SetupFn = (self: Self) => void | Record<string, unknown>;

export interface SetupDef extends Omit<TagDef, "setup"> {
  setup: SetupFn;
}

/** Component entry. `self` is the same object the template reads. */
export function setup(fn: SetupFn): TagDef;
export function setup(def: SetupDef): TagDef;
export function setup(input: SetupFn | SetupDef): TagDef {
  if (typeof input === "function") return { setup: input };
  return input;
}
