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
  const project = createTeeLanguageProject(null, folder);

  function sync(document) {
    if (document.languageId !== "tee") return;
    project.upsert(document.uri.fsPath, document.getText());
  }

  for (const doc of vscode.workspace.textDocuments) sync(doc);
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(sync),
    vscode.workspace.onDidChangeTextDocument((e) => sync(e.document)),
  );

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      selector,
      {
        provideCompletionItems(document, position) {
          sync(document);
          const offset = document.offsetAt(position);
          const items = project.completions(document.uri.fsPath, offset);
          return items.map((entry) => {
            const item = new vscode.CompletionItem(entry.name, toKind(vscode, entry.kind));
            item.detail = entry.detail;
            if (entry.insertText && entry.insertText.includes("$")) {
              item.insertText = new vscode.SnippetString(entry.insertText);
            } else if (entry.insertText) {
              item.insertText = entry.insertText;
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
        sync(document);
        const info = project.hover(document.uri.fsPath, document.offsetAt(position));
        if (!info) return undefined;
        return new vscode.Hover(new vscode.MarkdownString("```ts\n" + info.text + "\n```"));
      },
    }),
  );

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(selector, {
      async provideDefinition(document, position) {
        sync(document);
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
      project.dispose();
    },
  });
}

function deactivate() {}

module.exports = { activate, deactivate };
