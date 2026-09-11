"use strict";

const { createTeeLanguageProject } = require("./lib/tee-lsp.cjs");

/** @param {import("vscode")} vscode */
function toKind(vscode, kind) {
  const k = String(kind);
  if (k.includes("method") || k.includes("function")) return vscode.CompletionItemKind.Method;
  if (k.includes("keyword")) return vscode.CompletionItemKind.Keyword;
  if (k.includes("class")) return vscode.CompletionItemKind.Class;
  if (k.includes("module") || k.includes("alias")) return vscode.CompletionItemKind.Module;
  if (k.includes("property")) return vscode.CompletionItemKind.Property;
  return vscode.CompletionItemKind.Variable;
}

/** @param {import("vscode").ExtensionContext} context */
function activate(context) {
  const vscode = require("vscode");
  const selector = { language: "tee", scheme: "file" };
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
  const project = createTeeLanguageProject(folder, __dirname);
  const diagnostics = vscode.languages.createDiagnosticCollection("tee");
  const versions = new Map();
  const diagnosticTimers = new Map();
  const filesConfig = vscode.workspace.getConfiguration("files");
  const associations = filesConfig.get("associations", {});
  if (associations["*.tee"] !== "tee") {
    void filesConfig.update(
      "associations",
      { ...associations, "*.tee": "tee" },
      vscode.ConfigurationTarget.Workspace,
    );
  }

  function updateDiagnostics(document) {
    diagnostics.set(
      document.uri,
      project.diagnostics(document.uri.fsPath).map((issue) => {
        const severity =
          issue.severity === "error"
            ? vscode.DiagnosticSeverity.Error
            : issue.severity === "warning"
              ? vscode.DiagnosticSeverity.Warning
              : vscode.DiagnosticSeverity.Information;
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(document.positionAt(issue.start), document.positionAt(issue.end)),
          issue.message,
          severity,
        );
        diagnostic.source = issue.source;
        return diagnostic;
      }),
    );
  }

  async function adopt(document) {
    if (!document?.uri?.fsPath?.endsWith(".tee")) return;
    if (document.languageId !== "tee") {
      try {
        document = await vscode.languages.setTextDocumentLanguage(document, "tee");
      } catch {
        return;
      }
    }
    const key = document.uri.toString();
    if (versions.get(key) === document.version) return;
    versions.set(key, document.version);
    project.upsert(document.uri.fsPath, document.getText());
    clearTimeout(diagnosticTimers.get(key));
    diagnosticTimers.set(key, setTimeout(() => updateDiagnostics(document), 300));
  }

  for (const doc of vscode.workspace.textDocuments) void adopt(doc);
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => void adopt(doc)),
    vscode.workspace.onDidChangeTextDocument((e) => void adopt(e.document)),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      const key = doc.uri.toString();
      clearTimeout(diagnosticTimers.get(key));
      diagnosticTimers.delete(key);
      versions.delete(key);
      diagnostics.delete(doc.uri);
    }),
  );

  if (!context.globalState.get("tee.didActivateNotice")) {
    void vscode.window.showInformationMessage(
      "Tee 语言已启用。.tee 标签页应是金色 T；若仍是纯文本，点右下角语言选 Tee。",
    );
    void context.globalState.update("tee.didActivateNotice", true);
  }

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      selector,
      {
        provideCompletionItems(document, position) {
          void adopt(document);
          const offset = document.offsetAt(position);
          const items = project.completions(document.uri.fsPath, offset);
          return items.map((entry) => {
            const item = new vscode.CompletionItem(entry.name, toKind(vscode, entry.kind));
            item.detail = entry.detail;
            if (entry.documentation) {
              item.documentation = new vscode.MarkdownString(entry.documentation);
            }
            if (entry.insertText && (entry.snippet || entry.insertText.includes("$"))) {
              item.insertText = new vscode.SnippetString(entry.insertText);
            } else if (entry.insertText) {
              item.insertText = entry.insertText;
            }
            if (entry.replaceStart != null && entry.replaceEnd != null) {
              item.range = new vscode.Range(
                document.positionAt(entry.replaceStart),
                document.positionAt(entry.replaceEnd),
              );
            }
            return item;
          });
        },
      },
      ".",
      " ",
      '"',
      "'",
      "{",
      "<",
    ),
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(selector, {
      provideHover(document, position) {
        void adopt(document);
        const info = project.hover(document.uri.fsPath, document.offsetAt(position));
        if (!info) return undefined;
        const markdown = new vscode.MarkdownString();
        if (info.language) markdown.appendCodeblock(info.text, info.language);
        else markdown.appendMarkdown(info.text);
        return new vscode.Hover(
          markdown,
          new vscode.Range(document.positionAt(info.start), document.positionAt(info.end)),
        );
      },
    }),
  );

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(selector, {
      async provideDefinition(document, position) {
        await adopt(document);
        const defs = project.definition(document.uri.fsPath, document.offsetAt(position));
        const out = [];
        for (const d of defs) {
          const uri = vscode.Uri.file(d.fileName);
          const doc =
            uri.fsPath === document.uri.fsPath
              ? document
              : await vscode.workspace.openTextDocument(uri);
          out.push(
            new vscode.Location(
              uri,
              new vscode.Range(doc.positionAt(d.start), doc.positionAt(d.end)),
            ),
          );
        }
        return out;
      },
    }),
  );

  context.subscriptions.push({
    dispose() {
      for (const timer of diagnosticTimers.values()) clearTimeout(timer);
      project.dispose();
      diagnostics.dispose();
    },
  });
  context.subscriptions.push(diagnostics);
}

function deactivate() {}

module.exports = { activate, deactivate };
