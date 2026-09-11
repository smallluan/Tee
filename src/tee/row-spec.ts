import {
  isAotNative,
  isVoidTag,
  staticAttrs,
  type ElNode,
  type TmplNode,
} from "./html";
import { compileExpr, compileStmt } from "./ir";

const TABLE_CONTAINERS = new Set(["table", "thead", "tbody", "tfoot", "tr", "colgroup"]);

export type RowBindingSpec = {
  path: number[];
  src: string;
  name: string | null;
  base: string;
  mode: "reactive" | "once" | "skip";
  directPath: string[] | null;
  directRoot: string | null;
};

export type RowEventSpec = {
  path: number[];
  event: string;
  src: string;
  mods: string[];
};

export type RowRefSpec = { path: number[]; name: string };

export type KeyedClassPlan = {
  src: string;
  className: string;
  selectedSrc: string;
};

export type RowSkeleton =
  | { t: "text"; v: string }
  | { t: "live" }
  | { t: "el"; tag: string; attrs: Array<[string, string]>; kids: RowSkeleton[] };

export type RowSpec = {
  root: RowSkeleton & { t: "el" };
  bindings: RowBindingSpec[];
  events: RowEventSpec[];
  refs: RowRefSpec[];
  itemName: string;
  indexName: string;
  keySrc: string | null;
  usesIndex: boolean;
  classPlan: KeyedClassPlan | null;
};

export function isFastRowTree(node: TmplNode): boolean {
  if (node.t === "live") return compileExpr(node.src).run != null;
  if (node.t === "text") return true;
  if (!isAotNative(node)) return false;
  for (const attr of node.attrs) {
    if (attr.kind !== "static" && attr.kind !== "on" && attr.kind !== "bind" && attr.kind !== "ref") {
      return false;
    }
    if (attr.kind === "bind" && !compileExpr(attr.value).run) return false;
    if (attr.kind === "on" && compileStmt(attr.value).t === "raw") return false;
  }
  return node.children.every(isFastRowTree);
}

export function directItemPath(src: string, itemName: string): string[] | null {
  const match = src.trim().match(/^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/);
  if (!match || match[1] !== itemName || !match[2]) return null;
  return [match[2]];
}

export function expressionUsesName(src: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\w$])${escaped}($|[^\\w$])`).test(src);
}

export function rowUsesIndex(node: TmplNode, indexName: string): boolean {
  if (node.t === "text") return false;
  if (node.t === "live") return expressionUsesName(node.src, indexName);
  for (const attr of node.attrs) {
    if (
      (attr.kind === "bind" || attr.kind === "on" || attr.kind === "ref") &&
      expressionUsesName(attr.value, indexName)
    ) {
      return true;
    }
  }
  return node.children.some((child) => rowUsesIndex(child, indexName));
}

export function keyedClassPlan(node: ElNode, itemName: string, keySrc: string | null): KeyedClassPlan | null {
  if (!keySrc || !keySrc.startsWith(itemName + ".")) return null;
  const attr = node.attrs.find((candidate) => candidate.kind === "bind" && candidate.name === "class");
  if (!attr || attr.kind !== "bind") return null;
  const match = attr.value.match(
    /^\{\s*([A-Za-z_$][\w$-]*)\s*:\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*===\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\}$/,
  );
  if (!match) return null;
  const [, className, left, right] = match;
  const selectedSrc = left === keySrc ? right : right === keySrc ? left : null;
  if (!selectedSrc || selectedSrc === keySrc || selectedSrc.startsWith(itemName + ".")) return null;
  return { src: attr.value, className, selectedSrc };
}

export function buildRowSpec(
  node: ElNode,
  itemName: string,
  indexName: string,
  keySrc: string | null,
): RowSpec {
  const classPlan = keyedClassPlan(node, itemName, keySrc);
  const bindings: RowBindingSpec[] = [];
  const events: RowEventSpec[] = [];
  const refs: RowRefSpec[] = [];

  const walk = (current: TmplNode, path: number[]): RowSkeleton => {
    if (current.t === "text") return { t: "text", v: current.value };
    if (current.t === "live") {
      bindings.push({
        path,
        src: current.src,
        name: null,
        base: "",
        mode: current.src === keySrc ? "once" : "reactive",
        directPath: directItemPath(current.src, itemName),
        directRoot: directItemPath(current.src, itemName) ? itemName : null,
      });
      return { t: "live" };
    }

    const staticClass = staticAttrs(current.attrs).find((attr) => attr.name === "class")?.value ?? "";
    for (const attr of current.attrs) {
      if (attr.kind === "on") {
        events.push({ path, event: attr.event, src: attr.value, mods: attr.mods });
      } else if (attr.kind === "bind") {
        bindings.push({
          path,
          src: attr.value,
          name: attr.name,
          base: attr.name === "class" ? staticClass : "",
          mode:
            attr.name === "class" && path.length === 0 && attr.value === classPlan?.src
              ? "skip"
              : attr.value === keySrc
                ? "once"
                : "reactive",
          directPath: directItemPath(attr.value, itemName),
          directRoot: directItemPath(attr.value, itemName) ? itemName : null,
        });
      } else if (attr.kind === "ref") {
        refs.push({ path, name: attr.value });
      }
    }

    const attrs = staticAttrs(current.attrs)
      .filter((attr) => attr.name !== "t-cloak")
      .map((attr) => [attr.name, attr.value] as [string, string]);
    const kids: RowSkeleton[] = [];
    if (!isVoidTag(current.tag)) {
      for (let i = 0; i < current.children.length; i++) {
        const child = current.children[i];
        if (
          child.t === "text" &&
          !child.value.trim() &&
          (TABLE_CONTAINERS.has(current.tag) || i === 0 || i === current.children.length - 1)
        ) {
          continue;
        }
        kids.push(walk(child, [...path, kids.length]));
      }
    }
    return { t: "el", tag: current.tag, attrs, kids };
  };

  const root = walk(node, []) as RowSkeleton & { t: "el" };
  return {
    root,
    bindings,
    events,
    refs,
    itemName,
    indexName,
    keySrc,
    usesIndex: rowUsesIndex(node, indexName),
    classPlan,
  };
}

export function materializeRowSkeleton(skel: RowSkeleton, scopeId?: string): Node {
  if (skel.t === "text") return document.createTextNode(skel.v);
  if (skel.t === "live") return document.createTextNode("");
  const el = document.createElement(skel.tag);
  if (scopeId) el.setAttribute(scopeId, "");
  for (const [name, value] of skel.attrs) el.setAttribute(name, value);
  for (const kid of skel.kids) el.appendChild(materializeRowSkeleton(kid, scopeId));
  return el;
}

export function compileRowPath(path: number[]): (root: Node) => Node {
  if (path.length === 0) return (root) => root;
  return (root) => {
    let node: Node = root;
    for (let i = 0; i < path.length; i++) {
      const index = path[i];
      node = node.firstChild as Node;
      for (let skip = 0; skip < index; skip++) node = node.nextSibling as Node;
    }
    return node;
  };
}
