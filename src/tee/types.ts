export type PropKey = string;

export type SiteKind =
  | "text"
  | "attr"
  | "show"
  | "repeat"
  | "model"
  | "watch"
  | "computed";

export interface Site {
  id: number;
  kind: SiteKind;
  node: Node | null;
  label: string;
  run: () => void;
  rank?: number;
  linked?: boolean;
  queued?: boolean;
  dead?: boolean;
  last?: unknown;
  depId?: number;
  seenClock?: number;
  depIds?: number[];
  seen?: number[];
}

export type WatchHandler = (next: unknown, prev: unknown) => void;

export interface WatchOption {
  handler: WatchHandler;
  deep?: boolean;
  immediate?: boolean;
}

export type WatchSource = WatchHandler | WatchOption;

export interface ComputedMap {
  [name: string]: (this: Record<string, unknown>) => unknown;
}

export interface MethodMap {
  [name: string]: (this: Record<string, unknown>, ...args: unknown[]) => unknown;
}

export interface LifecycleHooks {
  created?: (this: Record<string, unknown>) => void;
  mounted?: (this: Record<string, unknown>) => void;
  updated?: (this: Record<string, unknown>) => void;
  unmounted?: (this: Record<string, unknown>) => void;
}

export interface TagDef extends LifecycleHooks {
  template?: string;
  render?: (ctx: import("./compile").CompileContext, parent: Node) => void;
  tag?: string;
  props?: string[] | Record<string, { default?: unknown }>;
  provide?: Record<string, unknown> | ((this: Record<string, unknown>) => Record<string, unknown>);
  inject?: string[] | Record<string, string | { from?: string; default?: unknown }>;
  data?: () => Record<string, unknown>;
  computed?: ComputedMap;
  watch?: Record<string, WatchSource>;
  methods?: MethodMap;
  setup?: import("./chart").SetupFn;
}

export interface TeeOptions extends LifecycleHooks {
  el?: string | Element;
  template?: string;
  render?: (ctx: import("./compile").CompileContext, parent: Node) => void;
  data?: Record<string, unknown> | (() => Record<string, unknown>);
  computed?: ComputedMap;
  watch?: Record<string, WatchSource>;
  methods?: MethodMap;
  provide?: Record<string, unknown> | ((this: Record<string, unknown>) => Record<string, unknown>);
  inject?: string[] | Record<string, string | { from?: string; default?: unknown }>;
  tags?: Record<string, TagDef>;
  setup?: import("./chart").SetupFn;
  ready?: (scope: Record<string, unknown>) => void;
}

export interface TeePlugin {
  install: (app: { version: string; define: typeof import("./tee").define; create: typeof import("./tee").create }) => void;
}

export interface MapSnapshot {
  forward: Array<{ prop: string; label: string; sites: SiteSnapshot[] }>;
  reverse: SiteSnapshot[];
}

export interface SiteSnapshot {
  id: number;
  kind: SiteKind;
  label: string;
  node: string;
  props: string[];
  debugProps: string[];
}
