import type { Engine } from "./engine";

const ARRAY_MUTATORS = new Set([
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
  "fill",
  "copyWithin",
]);

const ARRAY_READERS = new Set([
  "at",
  "concat",
  "entries",
  "every",
  "filter",
  "find",
  "findIndex",
  "findLast",
  "findLastIndex",
  "flat",
  "flatMap",
  "forEach",
  "includes",
  "indexOf",
  "join",
  "keys",
  "lastIndexOf",
  "map",
  "reduce",
  "reduceRight",
  "slice",
  "some",
  "toLocaleString",
  "toReversed",
  "toSorted",
  "toSpliced",
  "toString",
  "values",
  "with",
]);

const PROXY = new WeakMap<object, object>();
const RAW = new WeakMap<object, object>();
type ReactiveTarget = Record<PropertyKey, unknown>;
type ProxyMeta = {
  engine: Engine;
  objectId: string;
  isArray: boolean;
  proxy: ReactiveTarget;
};
const META = new WeakMap<object, ProxyMeta>();

const HANDLER: ProxyHandler<ReactiveTarget> = {
  get(target, key, receiver) {
    const meta = META.get(target)!;
    if (key === "__teeId") return meta.objectId;
    if (key === "__teeRaw") return target;
    if (typeof key === "symbol") {
      if (meta.isArray && key === Symbol.iterator) {
        meta.engine.record(`${meta.objectId}.__list`, "list");
        const iter = Reflect.get(target, key, receiver) as () => unknown;
        return iter.bind(meta.proxy);
      }
      return Reflect.get(target, key, receiver);
    }

    const name = String(key);
    meta.engine.record(`${meta.objectId}.${name}`, name);
    if (meta.isArray && (name === "length" || name === "__list")) {
      meta.engine.record(`${meta.objectId}.__list`, "list");
    }

    const found = Reflect.get(target, key, receiver);
    if (meta.isArray && typeof found === "function" && ARRAY_MUTATORS.has(name)) {
      return (...args: unknown[]) => {
        const result = (found as (...xs: unknown[]) => unknown).apply(target, args);
        meta.engine.notify(`${meta.objectId}.__list`);
        meta.engine.notify(`${meta.objectId}.length`);
        return result;
      };
    }
    if (meta.isArray && typeof found === "function" && ARRAY_READERS.has(name)) {
      meta.engine.record(`${meta.objectId}.__list`, "list");
      return (found as (...xs: unknown[]) => unknown).bind(meta.proxy);
    }
    if (typeof found === "function") return found.bind(target);
    return wrap(found, meta.engine);
  },
  set(target, key, incoming) {
    const meta = META.get(target)!;
    if (typeof key === "symbol") {
      target[key] = incoming;
      return true;
    }
    const name = String(key);
    const prev = target[key];
    const next = unwrapIncoming(incoming);
    if (Object.is(prev, next)) return true;
    target[key] = next;
    meta.engine.notify(`${meta.objectId}.${name}`);
    if (meta.isArray) meta.engine.notify(`${meta.objectId}.__list`);
    return true;
  },
  deleteProperty(target, key) {
    if (!(key in target)) return true;
    delete target[key];
    if (typeof key !== "symbol") {
      const meta = META.get(target)!;
      meta.engine.notify(`${meta.objectId}.${String(key)}`);
      if (meta.isArray) meta.engine.notify(`${meta.objectId}.__list`);
    }
    return true;
  },
  has: (target, key) => Reflect.has(target, key),
  ownKeys: (target) => Reflect.ownKeys(target),
  getOwnPropertyDescriptor: (target, key) => Reflect.getOwnPropertyDescriptor(target, key),
};

export function isProxy(value: unknown): boolean {
  return typeof value === "object" && value !== null && RAW.has(value as object);
}

export function toRaw<T>(value: T): T {
  if (typeof value === "object" && value !== null && RAW.has(value as object)) {
    return RAW.get(value as object) as T;
  }
  return value;
}

export function observe<T>(value: T, engine: Engine): T {
  return wrap(value, engine) as T;
}

function wrap(value: unknown, engine: Engine): unknown {
  if (value === null || typeof value !== "object") return value;
  if (RAW.has(value as object)) return value;
  const existing = PROXY.get(value as object);
  if (existing) return existing;

  const target = value as ReactiveTarget;
  const meta: ProxyMeta = {
    engine,
    objectId: engine.nextObjectId(),
    isArray: Array.isArray(target),
    proxy: null as unknown as ReactiveTarget,
  };
  META.set(target, meta);
  const proxy = new Proxy(target, HANDLER);
  meta.proxy = proxy;

  PROXY.set(target, proxy);
  RAW.set(proxy, target);
  return proxy;
}

function unwrapIncoming(value: unknown): unknown {
  return toRaw(value);
}

export function touchList(value: unknown, engine: Engine): void {
  if (!Array.isArray(value)) return;
  const id = (value as { __teeId?: string }).__teeId;
  if (id) {
    engine.record(`${id}.__list`, "list");
    engine.record(`${id}.length`, "length");
  }
  void value.length;
}
