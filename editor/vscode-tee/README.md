# Tee for VS Code / Cursor

Language support for `.tee` single-file components:

- TextMate grammar: HTML template + TypeScript script + CSS / Less / Sass
- Language configuration: comments, brackets, folding
- HTML custom data: `t-if`, `t-repeat`, `t-model`, `t-on:*` completions

## Install from this repo

In Cursor / VS Code:

1. Command Palette → **Developer: Install Extension from Location…**
2. Choose the `editor/vscode-tee` folder in this repository

Workspace settings in the Tee repo and in `create-tee` apps also map `*.tee` → HTML and load the same custom data, so completions work even without installing the extension.
