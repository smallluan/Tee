import { splitInterpolation } from "./expr.ts";

export type TmplAttr =
  | { kind: "static"; name: string; value: string }
  | { kind: "on"; event: string; value: string }
  | { kind: "bind"; name: string; value: string }
  | { kind: "model"; value: string }
  | { kind: "show"; value: string }
  | { kind: "repeat"; value: string }
  | { kind: "key"; value: string }
  | { kind: "slot"; value: string };

export interface ElNode {
  t: "el";
  tag: string;
  attrs: TmplAttr[];
  children: TmplNode[];
}

export type TmplNode = { t: "text"; value: string } | { t: "live"; src: string } | ElNode;

const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

export function parseHTML(html: string): TmplNode[] {
  return new HtmlParser(html).parseNodes();
}

class HtmlParser {
  i = 0;
  constructor(private readonly s: string) {}

  parseNodes(stop?: string): TmplNode[] {
    const nodes: TmplNode[] = [];
    while (this.i < this.s.length) {
      if (stop && this.atClose(stop)) break;
      if (this.starts("<!--")) {
        this.skipComment();
        continue;
      }
      if (this.s[this.i] === "<" && this.isMarkup()) {
        if (this.s[this.i + 1] === "/") break;
        nodes.push(this.element());
        continue;
      }
      for (const part of this.text()) nodes.push(part);
    }
    return nodes;
  }

  private element(): ElNode {
    this.i += 1;
    const tag = this.readName().toLowerCase();
    const attrs = this.readAttrs();
    const selfClose = this.eat("/") || VOID.has(tag);
    this.eat(">");
    const children = selfClose ? [] : this.parseNodes(tag);
    if (!selfClose) this.close(tag);
    return { t: "el", tag, attrs, children };
  }

  private close(tag: string): void {
    this.ws();
    if (!this.atClose(tag)) return;
    this.i += 2;
    this.readName();
    this.ws();
    this.eat(">");
  }

  private text(): TmplNode[] {
    const start = this.i;
    while (this.i < this.s.length) {
      if (this.s[this.i] === "<" && this.isMarkup()) break;
      this.i += 1;
    }
    const raw = this.s.slice(start, this.i);
    if (!raw) return [];
    if (!raw.includes("{{")) return [{ t: "text", value: raw }];
    return splitInterpolation(raw).map((part) =>
      part.static ? ({ t: "text" as const, value: part.value } satisfies TmplNode) : ({ t: "live" as const, src: part.value } satisfies TmplNode),
    );
  }

  private readAttrs(): TmplAttr[] {
    const attrs: TmplAttr[] = [];
    for (;;) {
      this.ws();
      if (this.i >= this.s.length) break;
      const ch = this.s[this.i];
      if (ch === ">" || ch === "/") break;
      const name = this.readAttrName();
      if (!name) break;
      this.ws();
      let value = "";
      if (this.eat("=")) {
        this.ws();
        value = this.readAttrValue();
      }
      attrs.push(classifyAttr(name, value));
    }
    return attrs;
  }

  private readName(): string {
    const start = this.i;
    while (this.i < this.s.length && /[A-Za-z0-9:_-]/.test(this.s[this.i])) this.i += 1;
    return this.s.slice(start, this.i);
  }

  private readAttrName(): string {
    const start = this.i;
    while (this.i < this.s.length && /[^\s=/>]/.test(this.s[this.i])) this.i += 1;
    return this.s.slice(start, this.i);
  }

  private readAttrValue(): string {
    const q = this.s[this.i];
    if (q === '"' || q === "'") {
      this.i += 1;
      const start = this.i;
      while (this.i < this.s.length && this.s[this.i] !== q) this.i += 1;
      const value = this.s.slice(start, this.i);
      if (this.s[this.i] === q) this.i += 1;
      return decode(value);
    }
    const start = this.i;
    while (this.i < this.s.length && /[^\s>]/.test(this.s[this.i])) this.i += 1;
    return decode(this.s.slice(start, this.i));
  }

  private skipComment(): void {
    const end = this.s.indexOf("-->", this.i + 4);
    this.i = end < 0 ? this.s.length : end + 3;
  }

  private atClose(tag: string): boolean {
    if (!this.starts("</")) return false;
    const start = this.i + 2;
    const name = this.s.slice(start, start + tag.length);
    if (name.toLowerCase() !== tag) return false;
    const next = this.s[start + tag.length];
    return !next || /[\s>]/.test(next);
  }

  private isMarkup(): boolean {
    const n = this.s[this.i + 1];
    return n === "!" || n === "/" || /[A-Za-z]/.test(n ?? "");
  }

  private starts(token: string): boolean {
    return this.s.startsWith(token, this.i);
  }

  private eat(token: string): boolean {
    if (!this.starts(token)) return false;
    this.i += token.length;
    return true;
  }

  private ws(): void {
    while (this.i < this.s.length && this.s[this.i] <= " ") this.i += 1;
  }
}

function classifyAttr(name: string, value: string): TmplAttr {
  const lower = name.toLowerCase();
  if (lower.startsWith("t-on:")) return { kind: "on", event: name.slice(5), value };
  if (lower.startsWith("t-bind:")) return { kind: "bind", name: name.slice(7), value };
  if (lower === "t-model") return { kind: "model", value };
  if (lower === "t-show") return { kind: "show", value };
  if (lower === "t-repeat") return { kind: "repeat", value };
  if (lower === "t-key") return { kind: "key", value };
  if (lower === "t-slot") return { kind: "slot", value: value || "default" };
  if (value.includes("{{")) return { kind: "bind", name, value: interpolateToExpr(value) };
  return { kind: "static", name, value };
}

function interpolateToExpr(value: string): string {
  return splitInterpolation(value)
    .map((part) => (part.static ? JSON.stringify(part.value) : `(${part.value})`))
    .join(" + ");
}

function decode(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function attrValue(attrs: TmplAttr[], kind: TmplAttr["kind"]): string | undefined {
  for (const attr of attrs) if (attr.kind === kind) return "value" in attr ? attr.value : undefined;
  return undefined;
}

export function staticAttrs(attrs: TmplAttr[]): Array<{ name: string; value: string }> {
  return attrs.filter((a): a is Extract<TmplAttr, { kind: "static" }> => a.kind === "static");
}
