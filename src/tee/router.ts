import { current, onMounted, onUnmounted, type Self } from "./chart";
import { For, jsx, viewSelf, type TeeChild, type TeeView } from "./jsx";

export type RouteComponent = (props?: Record<string, any>) => any;

export interface RouteRecord {
  path: string;
  component: RouteComponent;
  name?: string;
}

export interface RouteLocation {
  path: string;
  fullPath: string;
  params: Record<string, string>;
  query: Record<string, string>;
  name?: string;
}

export interface RouterApi {
  mode: "hash" | "history";
  push(to: string): void;
  replace(to: string): void;
  back(): void;
}

export interface RouterOptions {
  routes: RouteRecord[];
  /** Default `hash` — no server rewrite. `history` uses pathname. */
  mode?: "hash" | "history";
  base?: string;
}

interface CompiledRoute {
  record: RouteRecord;
  re: RegExp;
  keys: string[];
}

interface OutletRow {
  id: string;
  component: RouteComponent;
  keys: string[];
}

const RUNTIMES = new WeakMap<object, { compiled: CompiledRoute[]; mode: "hash" | "history"; base: string; outlet: OutletRow[] }>();

/** `setup` 的 self 是 Ctx 代理；视图里可能拿到 scope。WeakMap 一律挂稳定的 scope。 */
function hostOf(self: Self): object {
  return (self as { scope?: object }).scope ?? self;
}

export function router(self: Self, options: RouterOptions): void {
  if (!options.routes?.length) throw new Error("router(self, { routes }) needs at least one route");
  const mode = options.mode ?? "hash";
  const base = normalizeBase(options.base ?? "");
  const compiled = options.routes.map(compileRoute);
  const runtime = { compiled, mode, outlet: [] as OutletRow[], base };
  RUNTIMES.set(hostOf(self), runtime);

  const apply = () => sync(self, runtime);

  self.$router = {
    mode,
    push: (to: string) => navigate(runtime, to, false, apply),
    replace: (to: string) => navigate(runtime, to, true, apply),
    back: () => history.back(),
  } satisfies RouterApi;

  apply();

  const event = mode === "hash" ? "hashchange" : "popstate";
  onMounted(() => window.addEventListener(event, apply));
  onUnmounted(() => window.removeEventListener(event, apply));
}

export function RouterView(): TeeView {
  const self = resolveSelf();
  return For({
    each: () => {
      // 读 $route.path，让 TwinMap 盯住换页；outlet 按路由模板 id 复用页面实例
      void self.$route?.path;
      return RUNTIMES.get(hostOf(self))?.outlet ?? [];
    },
    by: "id",
    children: (row) => {
      const props: Record<string, unknown> = {
        $route: () => self.$route,
        $router: () => self.$router,
      };
      for (const key of row.keys) {
        props[key] = () => (self.$route?.params as Record<string, string> | undefined)?.[key];
      }
      return jsx(row.component, props);
    },
  });
}

export function Link(props: {
  to: string;
  replace?: boolean;
  class?: unknown;
  children?: TeeChild;
}): TeeView {
  const self = resolveSelf();
  const runtime = RUNTIMES.get(hostOf(self));
  return jsx("a", {
    href: () => hrefOf(runtime, String(readOnce(props.to))),
    class: () => linkClass(self, props),
    "t-on:click": (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      const to = String(readOnce(props.to));
      if (props.replace) self.$router.replace(to);
      else self.$router.push(to);
    },
    children: props.children,
  });
}

function resolveSelf(): Self {
  try {
    return current();
  } catch {
    return viewSelf();
  }
}

function readOnce(value: unknown): unknown {
  return typeof value === "function" ? (value as () => unknown)() : value;
}

function sync(self: Self, runtime: { compiled: CompiledRoute[]; mode: "hash" | "history"; base: string; outlet: OutletRow[] }): void {
  const loc = readLocation(runtime.mode, runtime.base);
  const hit = matchRoute(runtime.compiled, loc.path);
  const next: RouteLocation = {
    path: loc.path,
    fullPath: loc.fullPath,
    params: hit?.params ?? {},
    query: loc.query,
    name: hit?.record.name,
  };
  self.$route = next;
  runtime.outlet = hit
    ? [{ id: hit.record.path, component: hit.record.component, keys: hit.keys }]
    : [];
}

function navigate(
  runtime: { mode: "hash" | "history"; base: string },
  to: string,
  replace: boolean,
  apply: () => void,
): void {
  const dest = normalizeTo(to);
  if (runtime.mode === "hash") {
    const url = "#" + dest;
    if (replace) history.replaceState(null, "", url);
    else if (location.hash !== url) location.hash = url;
  } else {
    const url = (runtime.base || "") + dest;
    if (replace) history.replaceState(null, "", url);
    else history.pushState(null, "", url);
  }
  apply();
}

function readLocation(mode: "hash" | "history", base: string): { path: string; fullPath: string; query: Record<string, string> } {
  if (mode === "hash") {
    const raw = location.hash.replace(/^#/, "") || "/";
    const [pathPart, queryPart] = splitQuery(raw.startsWith("/") ? raw : "/" + raw);
    return { path: pathPart || "/", fullPath: raw.startsWith("/") ? raw : "/" + raw, query: parseQuery(queryPart) };
  }
  let path = location.pathname || "/";
  if (base && path.startsWith(base)) path = path.slice(base.length) || "/";
  const query = parseQuery(location.search.replace(/^\?/, ""));
  return { path, fullPath: path + location.search, query };
}

function hrefOf(runtime: { mode: "hash" | "history"; base: string } | undefined, to: string): string {
  const dest = normalizeTo(to);
  if (!runtime || runtime.mode === "hash") return "#" + dest;
  return (runtime.base || "") + dest;
}

function linkClass(self: Self, props: { to: string; class?: unknown }): unknown {
  const to = pathOf(String(readOnce(props.to)));
  const active = self.$route?.path === to;
  const extra = readOnce(props.class);
  if (!extra) return active ? "active" : "";
  if (typeof extra === "string") return active ? `${extra} active` : extra;
  if (extra && typeof extra === "object") return { ...(extra as object), active };
  return extra;
}

function normalizeTo(to: string): string {
  const trimmed = to.trim() || "/";
  return trimmed.startsWith("/") ? trimmed : "/" + trimmed;
}

function pathOf(to: string): string {
  const [path] = splitQuery(normalizeTo(to));
  return path || "/";
}

function splitQuery(raw: string): [string, string] {
  const i = raw.indexOf("?");
  if (i < 0) return [raw || "/", ""];
  return [raw.slice(0, i) || "/", raw.slice(i + 1)];
}

function parseQuery(raw: string): Record<string, string> {
  const query: Record<string, string> = {};
  if (!raw) return query;
  for (const part of raw.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const key = decode(eq < 0 ? part : part.slice(0, eq));
    const value = decode(eq < 0 ? "" : part.slice(eq + 1));
    if (key) query[key] = value;
  }
  return query;
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

function compileRoute(record: RouteRecord): CompiledRoute {
  if (record.path === "*") return { record, re: /^[\s\S]*$/, keys: [] };
  const keys: string[] = [];
  const body = record.path
    .split("/")
    .map((seg) => {
      if (!seg) return "";
      if (seg.startsWith(":")) {
        keys.push(seg.slice(1));
        return "([^/]+)";
      }
      return escapeRe(seg);
    })
    .join("/");
  return { record, re: new RegExp(`^${body}/?$`), keys };
}

function matchRoute(
  compiled: CompiledRoute[],
  path: string,
): { record: RouteRecord; params: Record<string, string>; keys: string[] } | undefined {
  let fallback: CompiledRoute | undefined;
  for (const item of compiled) {
    if (item.record.path === "*") {
      fallback = item;
      continue;
    }
    const hit = item.re.exec(path);
    if (!hit) continue;
    const params: Record<string, string> = {};
    item.keys.forEach((key, index) => {
      params[key] = decode(hit[index + 1] ?? "");
    });
    return { record: item.record, params, keys: item.keys };
  }
  if (fallback) return { record: fallback.record, params: {}, keys: [] };
  return undefined;
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeBase(base: string): string {
  if (!base || base === "/") return "";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}
