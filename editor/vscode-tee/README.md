# Tee for VS Code / Cursor

`.tee` is its own language, not HTML:

- `<script>` is TypeScript — `import { setup, computed } from "tee-framework"` completes, hover shows signatures
- `{{ guest }}` and `t-if="count === 0"` are TypeScript expressions, not strings
- `t-if` / `t-repeat` / `t-on:click` complete on tags

## Install

Command Palette → **Developer: Install Extension from Location…** → this folder (`editor/vscode-tee`).

Then reload the window. Workspace settings map `*.tee` → `tee`. If a file is still HTML, click the language mode in the status bar and pick **Tee**.

From a Tee app after `npm install`:

```
node_modules/tee-framework/editor/vscode-tee
```
