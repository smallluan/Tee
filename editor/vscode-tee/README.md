# Tee for VS Code / Cursor

`.tee` 必须装这个扩展。不装的话 VS Code 会把 `.tee` 当成纯文本：全白、没有补全、标签页是普通文本图标。

## 安装（稳定版 VS Code 用这条）

1. Command Palette → **Extensions: Install from VSIX…**
2. 选 `editor/tee-language.vsix`（应用里是 `.vscode/tee-language.vsix` 或 `node_modules/tee-framework/editor/tee-language.vsix`）
3. Reload Window
4. 打开 `App.tee`，右下角语言是 **Tee**，标签页图标是墨色底上的金色 **T**

也可以：

```bash
npx tee-editor
```

或 `code --install-extension node_modules/tee-framework/editor/tee-language.vsix`

## 会得到什么

- 整个 `.tee` 按 TSX 高亮（`source.tsx`），不是自制的 HTML / Less 嵌入
- 样式写在旁边的 `.less` / `.css`，不要写进组件文件
- `import { setup, computed } from "tee-framework"` 补全
- `self` 字段和 `t-*` 指令补全
- 专用 `.tee` 文件图标
