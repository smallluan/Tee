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
  depIds?: number[];
  seen?: number[];
}

export type WatchHandler = (next: unknown, prev: unknown) => void;

export interface WatchOption {
  handler: WatchHandler;
  deep?: boolean;
}

export type WatchSource = WatchHandler | WatchOption;

export interface ComputedMap {
  [name: string]: (this: Record<string, unknown>) => unknown;
}

export interface MethodMap {
  [name: string]: (this: Record<string, unknown>, ...args: unknown[]) => unknown;
}

export interface TagDef {
  template: string;
  data?: () => Record<string, unknown>;
  computed?: ComputedMap;
  watch?: Record<string, WatchSource>;
  methods?: MethodMap;
  setup?: (scope: Record<string, unknown>) => void;
}

export interface TeeOptions {
  el?: string | Element;
  template?: string;
  data?: Record<string, unknown> | (() => Record<string, unknown>);
  computed?: ComputedMap;
  watch?: Record<string, WatchSource>;
  methods?: MethodMap;
  tags?: Record<string, TagDef>;
  setup?: (scope: Record<string, unknown>) => void;
  ready?: (scope: Record<string, unknown>) => void;
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
