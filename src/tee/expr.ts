const exprCache = new Map<string, Function>();
const stmtCache = new Map<string, Function>();

export function evalExpr(src: string, scope: object): unknown {
  let fn = exprCache.get(src);
  if (!fn) {
    try {
      fn = new Function("__s", `with(__s){return(${src});}`);
    } catch (error) {
      throw new Error(`Tee expression error: ${src}\n${(error as Error).message}`);
    }
    exprCache.set(src, fn);
  }
  return fn(scope);
}

export function runStmt(src: string, scope: object, event?: Event): unknown {
  const trimmed = src.trim();
  if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) {
    const target = (scope as Record<string, unknown>)[trimmed];
    if (typeof target === "function") return target(event);
    return target;
  }
  let fn = stmtCache.get(src);
  if (!fn) {
    try {
      fn = new Function("__s", "$event", `with(__s){${src}}`);
    } catch (error) {
      throw new Error(`Tee statement error: ${src}\n${(error as Error).message}`);
    }
    stmtCache.set(src, fn);
  }
  return fn(scope, event);
}

export function splitInterpolation(text: string): Array<{ static: boolean; value: string }> {
  const out: Array<{ static: boolean; value: string }> = [];
  const re = /\{\{([\s\S]+?)\}\}/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > last) out.push({ static: true, value: text.slice(last, match.index) });
    out.push({ static: false, value: match[1].trim() });
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push({ static: true, value: text.slice(last) });
  if (out.length === 0) out.push({ static: true, value: text });
  return out;
}

export function parseRepeat(stmt: string): { item: string; index: string; list: string } {
  const match = stmt
    .trim()
    .match(
      /^(?:\(?\s*([A-Za-z_$][\w$]*)\s*(?:,\s*([A-Za-z_$][\w$]*))?\s*\)?\s+in\s+)?(.+)$/,
    );
  if (!match) throw new Error(`Invalid t-repeat: ${stmt}`);
  return {
    item: match[1] ?? "item",
    index: match[2] ?? "$index",
    list: match[3].trim(),
  };
}

export function display(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

const BOOLEAN_ATTRS = new Set([
  "disabled",
  "checked",
  "hidden",
  "selected",
  "required",
  "readonly",
  "multiple",
  "autofocus",
]);

export function isBooleanAttr(name: string): boolean {
  return BOOLEAN_ATTRS.has(name);
}
