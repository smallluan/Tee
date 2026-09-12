import ts from "tee-typescript";

/** Vue-style SFC: both a template block and a script/style block. */
export function isSFCSource(source: string): boolean {
  return /<template[\s>]/i.test(source) && /<(?:script|style)[\s>]/i.test(source);
}

/**
 * Compile a Tee TSX module.
 * Dynamic JSX values become getters so TwinMap can patch the real DOM.
 */
export function compileTSX(source: string, fileName = "component.tee"): string {
  const wrapped = wrapJsxExpressionsInSource(source, fileName);
  const result = ts.transpileModule(wrapped, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      jsxImportSource: "tee-framework",
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      esModuleInterop: true,
    },
    fileName: asTsxName(fileName),
  });
  return injectJsxHelpers(result.outputText, source);
}

const JSX_HELPERS = ["For", "Fragment"] as const;

/** `<For>` compiles to `_jsx(For, …)`. Bind the helper if the file never imported it. */
function injectJsxHelpers(emit: string, source: string): string {
  const names = JSX_HELPERS.filter((name) => usesJsxTag(source, name) && !importBinds(emit, name));
  if (!names.length) return emit;
  const runtime = emit.match(/import\s*\{([^}]*)\}\s*from\s*["']tee-framework\/jsx-runtime["']\s*;?/);
  if (runtime) {
    const merged = `${runtime[1].trim().replace(/,?\s*$/, "")}, ${names.join(", ")}`;
    return emit.replace(runtime[0], `import { ${merged} } from "tee-framework/jsx-runtime";`);
  }
  return `import { ${names.join(", ")} } from "tee-framework/jsx-runtime";\n${emit}`;
}

function usesJsxTag(source: string, name: string): boolean {
  return new RegExp(`<${name}(?:[\\s>/])`).test(source);
}

function importBinds(emit: string, name: string): boolean {
  const re = /import\s*\{([^}]+)\}\s*from\s*["'][^"']+["']/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(emit))) {
    for (const part of match[1].split(",")) {
      const spec = part.trim();
      if (!spec) continue;
      const [imported, local] = spec.split(/\s+as\s+/);
      if (imported.trim() === name || local?.trim() === name) return true;
    }
  }
  return false;
}

function asTsxName(fileName: string): string {
  if (fileName.endsWith(".tsx") || fileName.endsWith(".jsx")) return fileName;
  return fileName.replace(/\.tee$/i, ".tsx");
}

/**
 * Rewrite `{expr}` in JSX to `{() => (expr)}` on the source string.
 * Mutating TypeScript's JSX AST before emit drops attributes and children.
 */
export function wrapJsxExpressionsInSource(source: string, fileName = "component.tee"): string {
  const sf = ts.createSourceFile(asTsxName(fileName), source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const replacements: Array<{ start: number; end: number; text: string }> = [];

  const visit = (node: ts.Node): void => {
    if (ts.isJsxExpression(node) && node.expression && shouldWrap(node, sf)) {
      const expr = node.expression;
      replacements.push({
        start: expr.getStart(sf),
        end: expr.getEnd(),
        text: `() => (${expr.getText(sf)})`,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  replacements.sort((a, b) => b.start - a.start);
  let out = source;
  for (const item of replacements) {
    out = out.slice(0, item.start) + item.text + out.slice(item.end);
  }
  return out;
}

function shouldWrap(node: ts.JsxExpression, sf: ts.SourceFile): boolean {
  const expr = node.expression;
  if (!expr) return false;
  if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) return false;
  if (ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr) || ts.isJsxFragment(expr)) return false;
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr) || ts.isNumericLiteral(expr)) return false;
  if (
    expr.kind === ts.SyntaxKind.TrueKeyword ||
    expr.kind === ts.SyntaxKind.FalseKeyword ||
    expr.kind === ts.SyntaxKind.NullKeyword
  ) {
    return false;
  }

  const parent = node.parent;
  if (parent && ts.isJsxAttribute(parent)) {
    const name = parent.name.getText(sf);
    if (name.startsWith("t-on:") || name.startsWith("on:") || /^on[A-Z]/.test(name)) return false;
  }
  return true;
}
