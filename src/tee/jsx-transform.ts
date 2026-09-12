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
  return compileTSXWithMap(source, fileName).code;
}

export function compileTSXWithMap(
  source: string,
  fileName = "component.tee",
): { code: string; map: object | null } {
  const quoted = quoteDottedTeeAttrs(source);
  const wrapped = wrapJsxExpressionsInSource(quoted, fileName);
  const result = ts.transpileModule(wrapped, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      jsxImportSource: "tee-framework",
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      esModuleInterop: true,
      sourceMap: true,
      inlineSources: true,
    },
    fileName: asTsxName(fileName),
    reportDiagnostics: true,
  });
  const fatal = (result.diagnostics ?? []).filter(
    (item) => item.category === ts.DiagnosticCategory.Error,
  );
  if (fatal.length) {
    const text = fatal
      .map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n"))
      .join("\n");
    throw new Error(`Tee compile ${fileName}:\n${text}`);
  }
  return {
    code: injectJsxHelpers(result.outputText, quoted),
    map: parseMap(result.sourceMapText, fileName),
  };
}

const JSX_HELPERS = ["For", "Fragment", "Link", "RouterView"] as const;

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

function parseMap(text: string | undefined, fileName: string): object | null {
  if (!text) return null;
  try {
    const map = JSON.parse(text) as { file?: string; sources?: string[] };
    map.file = fileName;
    if (Array.isArray(map.sources) && map.sources.length) map.sources[0] = fileName;
    return map;
  } catch {
    return null;
  }
}

/**
 * TypeScript JSX splits `t-on:submit.prevent` into `t-on:submit` + `prevent`.
 * Quote the whole name before transpile so the runtime still sees modifiers.
 */
export function quoteDottedTeeAttrs(source: string): string {
  const re = /\bt-(?:on:[A-Za-z][\w-]*|[A-Za-z][\w:]*)(?:\.[A-Za-z][\w]*)+/g;
  let out = "";
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    if (!inJsxTag(source, match.index)) continue;
    const name = match[0];
    let i = match.index + name.length;
    while (i < source.length && /\s/.test(source[i])) i += 1;
    let end = match.index + name.length;
    let value = "true";
    if (source[i] === "=") {
      i += 1;
      while (i < source.length && /\s/.test(source[i])) i += 1;
      const init = readJsxInitializer(source, i);
      if (!init) continue;
      value = init.value;
      end = init.end;
    }
    out += `${source.slice(last, match.index)}{...{ ${JSON.stringify(name)}: ${value} }}`;
    last = end;
    re.lastIndex = end;
  }
  return out + source.slice(last);
}

function inJsxTag(source: string, index: number): boolean {
  for (let i = index; i >= 0; i -= 1) {
    const char = source[i];
    if (char === ">") return false;
    if (char === "<") return true;
  }
  return false;
}

function readJsxInitializer(
  source: string,
  start: number,
): { value: string; end: number } | null {
  const open = source[start];
  if (open === "{") {
    let depth = 0;
    for (let i = start; i < source.length; i += 1) {
      const char = source[i];
      if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) return { value: source.slice(start + 1, i).trim() || "true", end: i + 1 };
      }
    }
    return null;
  }
  if (open === '"' || open === "'") {
    let i = start + 1;
    while (i < source.length) {
      if (source[i] === "\\") {
        i += 2;
        continue;
      }
      if (source[i] === open) return { value: source.slice(start, i + 1), end: i + 1 };
      i += 1;
    }
    return null;
  }
  return null;
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
