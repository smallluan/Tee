import { existsSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import ts from "tee-typescript";
import {
  getLanguageService as getHTMLLanguageService,
  newHTMLDataProvider,
  type IHTMLDataProvider,
} from "vscode-html-languageservice";
import {
  getCSSLanguageService,
  getLESSLanguageService,
  getSCSSLanguageService,
} from "vscode-css-languageservice";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  TEE_DIRECTIVES,
  TEE_NAMED_EXPORTS,
  collectComponentBindings,
  identAt,
  inTeeNamedImport,
  locateTee,
  parseSFCBlocks,
  templateHelperText,
  type BlockRange,
} from "./tee-virtual";

export interface TeeCompletion {
  name: string;
  kind: string;
  detail?: string;
  documentation?: string;
  insertText?: string;
  snippet?: boolean;
  replaceStart?: number;
  replaceEnd?: number;
}

export interface TeeHover {
  text: string;
  start: number;
  end: number;
  language?: string;
}

export interface TeeDefinition {
  fileName: string;
  start: number;
  end: number;
}

export interface TeeDiagnostic {
  message: string;
  start: number;
  end: number;
  severity: "error" | "warning" | "info";
  source: "tee-html" | "tee-typescript" | "tee-style";
}

interface TeeDoc {
  fileName: string;
  text: string;
  version: number;
}

const teeHTMLData: IHTMLDataProvider = newHTMLDataProvider("tee", {
  version: 1.1,
  tags: [
    { name: "template", description: "Tee template block.", attributes: [] },
    { name: "script", description: "Tee component script block.", attributes: [] },
    { name: "style", description: "Tee component style block.", attributes: [] },
    { name: "slot", description: "Tee component slot outlet.", attributes: [] },
  ],
  globalAttributes: TEE_DIRECTIVES.map((directive) => ({
    name: directive.name,
    description: directive.detail,
  })),
});

const htmlService = getHTMLLanguageService({ customDataProviders: [teeHTMLData] });
const cssService = getCSSLanguageService();
const lessService = getLESSLanguageService();
const scssService = getSCSSLanguageService();

export class TeeLanguageProject {
  private readonly docs = new Map<string, TeeDoc>();
  private readonly rootFiles: string[];
  private readonly languageLibFiles: string[];
  private readonly compilerOptions: ts.CompilerOptions;
  private readonly helperName: string;
  private helperText = "";
  private serial = 0;
  private readonly service: ts.LanguageService;

  constructor(
    readonly root: string,
    readonly editorRoot?: string,
  ) {
    const configPath = ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json");
    let compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
      strict: true,
      allowJs: true,
      noEmit: true,
      skipLibCheck: true,
      esModuleInterop: true,
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: ts.JsxEmit.ReactJSX,
      jsxImportSource: "tee-framework",
    };
    let rootFiles: string[] = [];
    if (configPath) {
      const read = ts.readConfigFile(configPath, ts.sys.readFile);
      const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(configPath));
      compilerOptions = {
        ...compilerOptions,
        ...parsed.options,
        allowJs: true,
        noEmit: true,
        skipLibCheck: true,
      };
      // A .tee virtual script is the project root. TypeScript follows its
      // imports on demand; indexing every unrelated .ts test/source file here
      // makes the first completion several seconds slower in large repos.
      rootFiles = [];
    }
    this.compilerOptions = compilerOptions;
    this.rootFiles = rootFiles;
    this.helperName = normalize(`${root}/__tee_template_intellisense.ts`);

    const bundledLib = editorRoot ? join(editorRoot, "lib", "typescript", "lib.d.ts") : "";
    const projectLib = join(root, "node_modules", "typescript", "lib", "lib.d.ts");
    const aliasedLib = join(root, "node_modules", "tee-typescript", "lib", "lib.d.ts");
    const defaultLib = [bundledLib, projectLib, aliasedLib].find((file) => file && existsSync(file));
    const languageLibDir = defaultLib ? dirname(defaultLib) : "";
    this.languageLibFiles = languageLibDir
      ? [join(languageLibDir, "lib.es2022.full.d.ts")]
      : [];
    const project = this;
    const host: ts.LanguageServiceHost = {
      getCompilationSettings: () => project.compilerOptions,
      getCurrentDirectory: () => project.root,
      getDefaultLibFileName: (options) => defaultLib ?? ts.getDefaultLibFilePath(options),
      getNewLine: () => "\n",
      getScriptFileNames: () => [
        ...project.languageLibFiles,
        ...project.rootFiles,
        ...[...project.docs.keys()].map(virtualName),
        ...(project.helperText ? [project.helperName] : []),
      ],
      getScriptKind: (fileName) => scriptKind(fileName),
      getScriptSnapshot: (fileName) => {
        const text = project.readFile(fileName) ?? ts.sys.readFile(fileName);
        return text == null ? undefined : ts.ScriptSnapshot.fromString(text);
      },
      getScriptVersion: (fileName) => {
        if (fileName === project.helperName) return String(project.serial);
        const source = sourceName(fileName);
        return String(project.docs.get(source)?.version ?? 0);
      },
      directoryExists: ts.sys.directoryExists,
      fileExists: (fileName) => project.readFile(fileName) != null || ts.sys.fileExists(fileName),
      getDirectories: ts.sys.getDirectories,
      readDirectory: ts.sys.readDirectory,
      readFile: (fileName, encoding) => project.readFile(fileName) ?? ts.sys.readFile(fileName, encoding),
      realpath: ts.sys.realpath,
      useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
    };
    this.service = ts.createLanguageService(host, ts.createDocumentRegistry());
  }

  upsert(fileName: string, text: string): void {
    const name = normalize(fileName);
    const old = this.docs.get(name);
    if (old?.text === text) return;
    this.serial += 1;
    this.docs.set(name, { fileName: name, text, version: this.serial });
  }

  completions(fileName: string, offset: number): TeeCompletion[] {
    const doc = this.docs.get(normalize(fileName));
    if (!doc) return [];
    const location = locateTee(doc.text, offset);
    if (location.kind === "script") return this.tsCompletions(virtualName(doc.fileName), offset, doc.text);
    if (location.kind === "expr") return this.templateCompletions(doc, offset);
    if (location.kind === "style") return styleCompletions(doc, offset);
    if (location.kind === "template" || location.kind === "tag") return htmlCompletions(doc, offset);
    return [];
  }

  hover(fileName: string, offset: number): TeeHover | null {
    const doc = this.docs.get(normalize(fileName));
    if (!doc) return null;
    const location = locateTee(doc.text, offset);
    if (location.kind === "script") return this.tsHover(virtualName(doc.fileName), offset);
    if (location.kind === "expr") {
      const helper = templateHelperText(doc.text, offset);
      if (helper) {
        this.setHelper(helper.file);
        const hover = this.tsHover(this.helperName, helper.at);
        this.clearHelper();
        if (hover) return { ...hover, start: location.start, end: location.end };
      }
      return bindingHover(doc.text, offset);
    }
    if (location.kind === "style") return styleHover(doc, offset);
    if (location.kind === "template" || location.kind === "tag") return htmlHover(doc, offset);
    return null;
  }

  definition(fileName: string, offset: number): TeeDefinition[] {
    const doc = this.docs.get(normalize(fileName));
    if (!doc || locateTee(doc.text, offset).kind !== "script") return [];
    return (this.service.getDefinitionAtPosition(virtualName(doc.fileName), offset) ?? []).map((definition) => ({
      fileName: sourceName(definition.fileName),
      start: definition.textSpan.start,
      end: definition.textSpan.start + definition.textSpan.length,
    }));
  }

  diagnostics(fileName: string): TeeDiagnostic[] {
    const doc = this.docs.get(normalize(fileName));
    if (!doc) return [];
    const blocks = parseSFCBlocks(doc.text);
    const script = blocks.find((block) => block.tag === "script");
    const output: TeeDiagnostic[] = [];
    const name = virtualName(doc.fileName);
    const diagnostics = [
      ...this.service.getSyntacticDiagnostics(name),
      ...this.service.getSemanticDiagnostics(name),
    ];
    for (const diagnostic of diagnostics) {
      const start = diagnostic.start ?? 0;
      const end = start + (diagnostic.length ?? 1);
      if (script && (start < script.contentStart || start > script.contentEnd)) continue;
      output.push({
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        start,
        end,
        severity: diagnostic.category === ts.DiagnosticCategory.Error ? "error" : "warning",
        source: "tee-typescript",
      });
    }
    output.push(...styleDiagnostics(doc));
    return output;
  }

  dispose(): void {
    this.service.dispose();
  }

  private readFile(fileName: string): string | undefined {
    const name = normalize(fileName);
    if (name === this.helperName) return this.helperText || undefined;
    if (name.endsWith(".tee.ts") || name.endsWith(".tee.tsx")) {
      const source = sourceName(name);
      const doc = this.docs.get(source);
      return doc ? virtualScript(doc.text) : undefined;
    }
    return undefined;
  }

  private tsCompletions(fileName: string, offset: number, source: string): TeeCompletion[] {
    const info = this.service.getCompletionsAtPosition(fileName, offset, {
      includeCompletionsForModuleExports: false,
      includeCompletionsWithInsertText: true,
    });
    const native = (info?.entries ?? []).map((entry) => this.convertTSEntry(fileName, offset, entry));
    if (inTeeNamedImport(source, offset)) {
      const teeExports = TEE_NAMED_EXPORTS.map((item) => ({
        name: item.name,
        kind: "function",
        detail: item.detail,
      }));
      return unique([...native, ...teeExports]);
    }
    const before = source.slice(Math.max(0, offset - 8), offset);
    if (/\b(?:self|this)\.$/.test(before)) return unique([...native, ...bindingCompletions(source)]);
    return native;
  }

  private templateCompletions(doc: TeeDoc, offset: number): TeeCompletion[] {
    const helper = templateHelperText(doc.text, offset);
    if (!helper) return bindingCompletions(doc.text);
    this.setHelper(helper.file);
    const result = this.tsCompletions(this.helperName, helper.at, doc.text);
    this.clearHelper();
    return unique([...result, ...bindingCompletions(doc.text)]);
  }

  private convertTSEntry(fileName: string, offset: number, entry: ts.CompletionEntry): TeeCompletion {
    return {
      name: entry.name,
      kind: tsKind(entry.kind),
      detail: entry.sourceDisplay ? ts.displayPartsToString(entry.sourceDisplay) : undefined,
      insertText: entry.insertText,
      snippet: Boolean(entry.isSnippet),
      replaceStart: entry.replacementSpan?.start,
      replaceEnd: entry.replacementSpan
        ? entry.replacementSpan.start + entry.replacementSpan.length
        : undefined,
    };
  }

  private tsHover(fileName: string, offset: number): TeeHover | null {
    const info = this.service.getQuickInfoAtPosition(fileName, offset);
    if (!info) return null;
    const docs = ts.displayPartsToString(info.documentation);
    return {
      text: `${ts.displayPartsToString(info.displayParts)}${docs ? `\n\n${docs}` : ""}`,
      start: info.textSpan.start,
      end: info.textSpan.start + info.textSpan.length,
      language: "typescript",
    };
  }

  private setHelper(text: string): void {
    this.helperText = text;
    this.serial += 1;
  }

  private clearHelper(): void {
    this.helperText = "";
    this.serial += 1;
  }
}

export function createTeeLanguageProject(root: string, editorRoot?: string): TeeLanguageProject {
  return new TeeLanguageProject(root, editorRoot);
}

function virtualName(fileName: string): string {
  return normalize(`${fileName}.tsx`);
}

function sourceName(fileName: string): string {
  return normalize(fileName.endsWith(".tee.tsx") ? fileName.slice(0, -4) : fileName.endsWith(".tee.ts") ? fileName.slice(0, -3) : fileName);
}

function virtualScript(source: string): string {
  const block = parseSFCBlocks(source).find((item) => item.tag === "script");
  if (!block) return source;
  const chars: string[] = [...source].map((char) => (char === "\n" || char === "\r" ? char : " "));
  for (let i = block.contentStart; i < block.contentEnd; i += 1) chars[i] = source[i];
  return chars.join("");
}

function scriptKind(fileName: string): ts.ScriptKind {
  if (fileName.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (fileName.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (fileName.endsWith(".js") || fileName.endsWith(".mjs") || fileName.endsWith(".cjs")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function htmlCompletions(doc: TeeDoc, offset: number): TeeCompletion[] {
  const block = parseSFCBlocks(doc.text).find((item) => item.tag === "template");
  if (!block) return [];
  const text = doc.text.slice(block.contentStart, block.contentEnd);
  const document = TextDocument.create(`tee-template:${doc.fileName}`, "html", doc.version, text);
  const html = htmlService.parseHTMLDocument(document);
  const list = htmlService.doComplete(document, document.positionAt(offset - block.contentStart), html);
  return list.items.map((item) => convertLSPCompletion(item, document, block.contentStart));
}

function htmlHover(doc: TeeDoc, offset: number): TeeHover | null {
  const block = parseSFCBlocks(doc.text).find((item) => item.tag === "template");
  if (!block) return null;
  const text = doc.text.slice(block.contentStart, block.contentEnd);
  const document = TextDocument.create(`tee-template:${doc.fileName}`, "html", doc.version, text);
  const html = htmlService.parseHTMLDocument(document);
  const hover = htmlService.doHover(document, document.positionAt(offset - block.contentStart), html);
  if (!hover) return null;
  const range = hover.range;
  return {
    text: markupText(hover.contents),
    start: range ? block.contentStart + document.offsetAt(range.start) : offset,
    end: range ? block.contentStart + document.offsetAt(range.end) : offset,
    language: "html",
  };
}

function styleService(block: BlockRange) {
  if (/\blang\s*=\s*["']less["']/i.test(block.attrs)) return { service: lessService, language: "less" };
  if (/\blang\s*=\s*["']s[ac]ss["']/i.test(block.attrs)) return { service: scssService, language: "scss" };
  return { service: cssService, language: "css" };
}

function styleCompletions(doc: TeeDoc, offset: number): TeeCompletion[] {
  const block = styleBlockAt(doc.text, offset);
  if (!block) return [];
  const { service, language } = styleService(block);
  const text = doc.text.slice(block.contentStart, block.contentEnd);
  const document = TextDocument.create(`tee-style:${doc.fileName}`, language, doc.version, text);
  const stylesheet = service.parseStylesheet(document);
  const list = service.doComplete(document, document.positionAt(offset - block.contentStart), stylesheet);
  return list.items.map((item) => convertLSPCompletion(item, document, block.contentStart));
}

function styleHover(doc: TeeDoc, offset: number): TeeHover | null {
  const block = styleBlockAt(doc.text, offset);
  if (!block) return null;
  const { service, language } = styleService(block);
  const text = doc.text.slice(block.contentStart, block.contentEnd);
  const document = TextDocument.create(`tee-style:${doc.fileName}`, language, doc.version, text);
  const stylesheet = service.parseStylesheet(document);
  const hover = service.doHover(document, document.positionAt(offset - block.contentStart), stylesheet);
  if (!hover) return null;
  return {
    text: markupText(hover.contents),
    start: hover.range ? block.contentStart + document.offsetAt(hover.range.start) : offset,
    end: hover.range ? block.contentStart + document.offsetAt(hover.range.end) : offset,
    language,
  };
}

function styleDiagnostics(doc: TeeDoc): TeeDiagnostic[] {
  const output: TeeDiagnostic[] = [];
  for (const block of parseSFCBlocks(doc.text).filter((item) => item.tag === "style")) {
    const { service, language } = styleService(block);
    const text = doc.text.slice(block.contentStart, block.contentEnd);
    const document = TextDocument.create(`tee-style:${doc.fileName}`, language, doc.version, text);
    const stylesheet = service.parseStylesheet(document);
    for (const diagnostic of service.doValidation(document, stylesheet)) {
      output.push({
        message: diagnostic.message,
        start: block.contentStart + document.offsetAt(diagnostic.range.start),
        end: block.contentStart + document.offsetAt(diagnostic.range.end),
        severity: diagnostic.severity === 1 ? "error" : "warning",
        source: "tee-style",
      });
    }
  }
  return output;
}

function styleBlockAt(source: string, offset: number): BlockRange | undefined {
  return parseSFCBlocks(source).find(
    (block) => block.tag === "style" && offset >= block.contentStart && offset <= block.contentEnd,
  );
}

function convertLSPCompletion(
  item: {
    label: string;
    detail?: string;
    documentation?: unknown;
    insertText?: string;
    insertTextFormat?: number;
    textEdit?: unknown;
    kind?: number;
  },
  document: TextDocument,
  base: number,
): TeeCompletion {
  const edit = item.textEdit as
    | { range?: { start: { line: number; character: number }; end: { line: number; character: number } }; newText?: string }
    | undefined;
  return {
    name: item.label,
    kind: lspKind(item.kind),
    detail: item.detail,
    documentation: markupText(item.documentation),
    insertText: edit?.newText ?? item.insertText,
    snippet: item.insertTextFormat === 2,
    replaceStart: edit?.range ? base + document.offsetAt(edit.range.start) : undefined,
    replaceEnd: edit?.range ? base + document.offsetAt(edit.range.end) : undefined,
  };
}

function bindingCompletions(source: string): TeeCompletion[] {
  return collectComponentBindings(source).map((binding) => ({
    name: binding.name,
    kind: binding.type.includes("=>") ? "method" : "property",
    detail: binding.type,
  }));
}

function bindingHover(source: string, offset: number): TeeHover | null {
  const ident = identAt(source, offset);
  if (!ident) return null;
  const binding = collectComponentBindings(source).find((item) => item.name === ident.name);
  return binding
    ? { text: `${binding.name}: ${binding.type}`, start: ident.start, end: ident.end, language: "typescript" }
    : null;
}

function unique(items: TeeCompletion[]): TeeCompletion[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
}

function tsKind(kind: ts.ScriptElementKind): string {
  if (kind === ts.ScriptElementKind.memberFunctionElement || kind === ts.ScriptElementKind.functionElement) return "method";
  if (kind === ts.ScriptElementKind.classElement) return "class";
  if (kind === ts.ScriptElementKind.moduleElement || kind === ts.ScriptElementKind.alias) return "module";
  if (kind === ts.ScriptElementKind.keyword) return "keyword";
  if (kind === ts.ScriptElementKind.memberVariableElement) return "property";
  return "variable";
}

function lspKind(kind?: number): string {
  if (kind === 2 || kind === 3) return "method";
  if (kind === 7) return "class";
  if (kind === 9) return "module";
  if (kind === 10) return "property";
  if (kind === 14) return "keyword";
  return "variable";
}

function markupText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(markupText).join("\n\n");
  if (typeof value === "object" && value && "value" in value) return String((value as { value: unknown }).value);
  if (typeof value === "object" && value && "language" in value && "value" in value) {
    const marked = value as { language: string; value: string };
    return `\`\`\`${marked.language}\n${marked.value}\n\`\`\``;
  }
  return String(value);
}
