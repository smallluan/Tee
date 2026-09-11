import { normalize } from "node:path";
import {
  TEE_DIRECTIVES,
  TEE_NAMED_EXPORTS,
  collectComponentBindings,
  identAt,
  inTeeNamedImport,
  locateTee,
} from "./tee-virtual";

export interface TeeCompletion {
  name: string;
  kind: string;
  detail?: string;
  insertText?: string;
}

export interface TeeHover {
  text: string;
  start: number;
  end: number;
}

export interface TeeDefinition {
  fileName: string;
  start: number;
  end: number;
}

export class TeeLanguageProject {
  private readonly docs = new Map<string, { fileName: string; text: string }>();

  constructor(_tsLib: unknown, readonly root: string) {}

  upsert(fileName: string, text: string): void {
    this.docs.set(normalize(fileName), { fileName: normalize(fileName), text });
  }

  completions(fileName: string, offset: number): TeeCompletion[] {
    const doc = this.docs.get(normalize(fileName));
    if (!doc) return [];
    const loc = locateTee(doc.text, offset);
    if (loc.kind === "tag") return directiveCompletions(doc.text, offset);
    if (loc.kind === "expr") return bindingCompletions(doc.text);
    if (loc.kind === "script") {
      if (inTeeNamedImport(doc.text, offset)) {
        return TEE_NAMED_EXPORTS.map((item) => ({
          name: item.name,
          kind: "function",
          detail: item.detail,
        }));
      }
      const before = doc.text.slice(Math.max(0, offset - 8), offset);
      if (/\bself\.$/.test(before) || /\bthis\.$/.test(before)) return bindingCompletions(doc.text);
      const word = identAt(doc.text, offset);
      const bindings = bindingCompletions(doc.text);
      const exports = TEE_NAMED_EXPORTS.map((item) => ({
        name: item.name,
        kind: "function",
        detail: item.detail,
      }));
      if (word && (word.name === "self" || word.name === "this")) return bindings;
      return uniqueCompletions([...bindings, ...exports]);
    }
    return [];
  }

  hover(fileName: string, offset: number): TeeHover | null {
    const doc = this.docs.get(normalize(fileName));
    if (!doc) return null;
    const loc = locateTee(doc.text, offset);
    if (loc.kind === "tag") {
      const dir = directiveAt(doc.text, offset);
      if (!dir) return null;
      return { text: `${dir.name}\n${dir.detail}`, start: offset, end: offset };
    }
    const ident = identAt(doc.text, offset);
    if (!ident) return null;
    const exported = TEE_NAMED_EXPORTS.find((item) => item.name === ident.name);
    if (exported) return { text: exported.detail, start: ident.start, end: ident.end };
    const binding = collectComponentBindings(doc.text).find((b) => b.name === ident.name);
    if (binding) return { text: `${binding.name}: ${binding.type}`, start: ident.start, end: ident.end };
    const dir = TEE_DIRECTIVES.find((d) => d.name === ident.name);
    if (dir) return { text: dir.detail, start: ident.start, end: ident.end };
    return null;
  }

  definition(_fileName: string, _offset: number): TeeDefinition[] {
    return [];
  }

  dispose(): void {}
}

export function createTeeLanguageProject(tsLib: unknown, root: string): TeeLanguageProject {
  return new TeeLanguageProject(tsLib, root);
}

function bindingCompletions(source: string): TeeCompletion[] {
  return collectComponentBindings(source).map((b) => ({
    name: b.name,
    kind: b.type.includes("=>") ? "method" : "property",
    detail: b.type,
  }));
}

function directiveCompletions(source: string, offset: number): TeeCompletion[] {
  const before = source.slice(Math.max(0, offset - 40), offset);
  const partial = /(?:^|\s)(t-[\w.:-]*)$/.exec(before)?.[1] ?? "";
  return TEE_DIRECTIVES.filter((d) => !partial || d.name.startsWith(partial)).map((d) => ({
    name: d.name,
    kind: "keyword",
    detail: d.detail,
    insertText: d.insert,
  }));
}

function directiveAt(source: string, offset: number): { name: string; detail: string } | null {
  const around = source.slice(Math.max(0, offset - 48), offset + 48);
  const match = around.match(/t-[\w.:-]+/);
  if (!match) return null;
  const found = TEE_DIRECTIVES.find((d) => d.name === match[0]);
  return found ? { name: found.name, detail: found.detail } : { name: match[0], detail: "Tee template directive" };
}

function uniqueCompletions(items: TeeCompletion[]): TeeCompletion[] {
  const seen = new Set<string>();
  const out: TeeCompletion[] = [];
  for (const item of items) {
    if (seen.has(item.name)) continue;
    seen.add(item.name);
    out.push(item);
  }
  return out;
}
