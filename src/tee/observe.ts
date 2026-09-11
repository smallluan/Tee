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

const PROXY = new WeakMap<object, object>();
const RAW = new WeakMap<object, object>();

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

  const objectId = engine.nextObjectId();
  const target = value as Record<PropertyKey, unknown>;
  const isArr = Array.isArray(target);

  const proxy = new Proxy(target, {
    get(t, key, receiver) {
      if (key === "__teeId") return objectId;
      if (key === "__teeRaw") return t;
      if (typeof key === "symbol") return Reflect.get(t, key, receiver);

      const name = String(key);
      engine.record(`${objectId}.${name}`, name);

      if (isArr && (name === "length" || name === "__list")) {
        engine.record(`${objectId}.__list`, "list");
      }

      const found = Reflect.get(t, key, receiver);
      if (isArr && typeof found === "function" && ARRAY_MUTATORS.has(name)) {
        return (...args: unknown[]) => {
          const result = (found as (...xs: unknown[]) => unknown).apply(t, args);
          engine.notify(`${objectId}.__list`);
          engine.notify(`${objectId}.length`);
          return result;
        };
      }
      if (typeof found === "function") return found.bind(t);
      return wrap(found, engine);
    },
    set(t, key, incoming) {
      if (typeof key === "symbol") {
        t[key] = incoming;
        return true;
      }
      const name = String(key);
      const prev = t[key];
      const next = unwrapIncoming(incoming);
      if (Object.is(prev, next)) return true;
      t[key] = next as never;
      engine.notify(`${objectId}.${name}`);
      if (isArr) engine.notify(`${objectId}.__list`);
      return true;
    },
    deleteProperty(t, key) {
      if (!(key in t)) return true;
      delete t[key];
      if (typeof key !== "symbol") {
        engine.notify(`${objectId}.${String(key)}`);
        if (isArr) engine.notify(`${objectId}.__list`);
      }
      return true;
    },
    has: (t, key) => Reflect.has(t, key),
    ownKeys: (t) => Reflect.ownKeys(t),
    getOwnPropertyDescriptor: (t, key) => Reflect.getOwnPropertyDescriptor(t, key),
  });

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
