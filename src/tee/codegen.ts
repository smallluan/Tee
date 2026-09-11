import { attrValue, isVoidTag, staticAttrs, type ElNode, type TmplNode } from "./html.ts";

/**
 * Build-time factory codegen: native HTML becomes `document.createElement`
 * plus helper calls. Structural directives and custom tags fall back to the
 * runtime walker with a compact node literal.
 */
const NATIVE = new Set([
  "a",
  "abbr",
  "address",
  "area",
  "article",
  "aside",
  "audio",
  "b",
  "bdi",
  "bdo",
  "blockquote",
  "br",
  "button",
  "canvas",
  "caption",
  "cite",
  "code",
  "col",
  "colgroup",
  "data",
  "datalist",
  "dd",
  "del",
  "details",
  "dfn",
  "dialog",
  "div",
  "dl",
  "dt",
  "em",
  "embed",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hgroup",
  "hr",
  "i",
  "iframe",
  "img",
  "input",
  "ins",
  "kbd",
  "label",
  "legend",
  "li",
  "main",
  "map",
  "mark",
  "menu",
  "meter",
  "nav",
  "noscript",
  "object",
  "ol",
  "optgroup",
  "option",
  "output",
  "p",
  "picture",
  "pre",
  "progress",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "section",
  "select",
  "small",
  "source",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "textarea",
  "tfoot",
  "th",
  "thead",
  "time",
  "tr",
  "track",
  "u",
  "ul",
  "var",
  "video",
  "wbr",
]);

export function generateRenderBody(nodes: TmplNode[]): string {
  const gen = new Gen();
  gen.emitNodes(nodes, "parent");
  return gen.out;
}

class Gen {
  out = "";
  n = 0;
  indent = 2;

  id(): string {
    return "_" + ++this.n;
  }

  line(src: string): void {
    this.out += " ".repeat(this.indent) + src + "\n";
  }

  emitNodes(nodes: TmplNode[], parent: string): void {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.t === "el" && attrValue(node.attrs, "if") != null) {
        const chain: ElNode[] = [node];
        while (i + 1 < nodes.length) {
          const next = nodes[i + 1];
          if (next.t === "text" && !next.value.trim()) {
            i += 1;
            continue;
          }
          if (next.t !== "el") break;
          if (attrValue(next.attrs, "elif") != null) {
            chain.push(next);
            i += 1;
            continue;
          }
          if (attrValue(next.attrs, "else") != null) {
            chain.push(next);
            i += 1;
          }
          break;
        }
        this.line(`__rt.nodes(${parent}, s, ctx, ${JSON.stringify(chain)});`);
        continue;
      }
      this.emitNode(node, parent);
    }
  }

  emitNode(node: TmplNode, parent: string): void {
    if (node.t === "text") {
      this.line(`__rt.text(${parent}, ${JSON.stringify(node.value)});`);
      return;
    }
    if (node.t === "live") {
      this.line(`__rt.live(${parent}, s, ctx, ${JSON.stringify(node.src)});`);
      return;
    }
    if (!isAotNative(node)) {
      this.line(`__rt.mount(${parent}, s, ctx, ${JSON.stringify(node)});`);
      return;
    }
    const el = this.id();
    this.line(`const ${el} = __rt.el(${JSON.stringify(node.tag)}, ctx);`);
    for (const attr of staticAttrs(node.attrs)) {
      if (attr.name === "t-cloak") continue;
      this.line(`__rt.static(${el}, ${JSON.stringify(attr.name)}, ${JSON.stringify(attr.value)});`);
    }
    for (const attr of node.attrs) {
      if (attr.kind === "on") {
        this.line(
          `__rt.on(${el}, ${JSON.stringify(attr.event)}, ${JSON.stringify(attr.value)}, s, ${JSON.stringify(attr.mods)});`,
        );
      } else if (attr.kind === "bind") {
        this.line(`__rt.bind(${el}, ${JSON.stringify(attr.name)}, ${JSON.stringify(attr.value)}, s, ctx);`);
      } else if (attr.kind === "model") {
        this.line(
          `__rt.model(${el}, ${JSON.stringify(attr.value)}, s, ctx, ${JSON.stringify(attr.mods)});`,
        );
      } else if (attr.kind === "html") {
        this.line(`__rt.html(${el}, ${JSON.stringify(attr.value)}, s, ctx);`);
      } else if (attr.kind === "text") {
        this.line(`__rt.bind(${el}, "textContent", ${JSON.stringify(attr.value)}, s, ctx);`);
      } else if (attr.kind === "ref") {
        this.line(`__rt.ref(${el}, ${JSON.stringify(attr.value)}, s);`);
      }
    }
    if (node.children.length && node.children.every(isStaticTree)) {
      this.line(`${el}.innerHTML = ${JSON.stringify(node.children.map(serializeNode).join(""))};`);
    } else {
      this.emitNodes(node.children, el);
    }
    this.line(`__rt.cloak(${el});`);
    this.line(`${parent}.appendChild(${el});`);
  }
}

function isAotNative(node: ElNode): boolean {
  if (!NATIVE.has(node.tag)) return false;
  for (const attr of node.attrs) {
    if (
      attr.kind === "show" ||
      attr.kind === "repeat" ||
      attr.kind === "pre" ||
      attr.kind === "once" ||
      attr.kind === "if" ||
      attr.kind === "elif" ||
      attr.kind === "else" ||
      attr.kind === "slot"
    ) {
      return false;
    }
  }
  return true;
}

function isStaticTree(node: TmplNode): boolean {
  if (node.t === "live") return false;
  if (node.t === "text") return true;
  if (!NATIVE.has(node.tag) || node.tag === "slot") return false;
  for (const attr of node.attrs) if (attr.kind !== "static") return false;
  return node.children.every(isStaticTree);
}

function serializeNode(node: TmplNode): string {
  if (node.t === "text") return node.value;
  if (node.t === "live") return "";
  const attrs = staticAttrs(node.attrs)
    .map((attr) => ` ${attr.name}="${attr.value.replace(/"/g, "&quot;")}"`)
    .join("");
  if (isVoidTag(node.tag)) return `<${node.tag}${attrs}>`;
  return `<${node.tag}${attrs}>${node.children.map(serializeNode).join("")}</${node.tag}>`;
}
