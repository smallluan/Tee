# Tee starter

Vite + `.tee` TSX 模块。`setup` 返回真实 DOM，Less 从旁边引进来，运行时走双向映射表，没有虚拟 DOM。

```bash
npm install
npm run dev
```

## 文件

- `src/App.tee` — `setup` + TSX（不写样式）
- `src/App.less` — 样式，外部引入
- `src/main.ts` — `Tee.create`
- `.vscode/settings.json` — `*.tee` 关联 Tee 语言
- `.vscode/tee-language.vsix` — 语言扩展（按 TSX 高亮、补全、T 形文件图标）

打开 `App.tee` 之前装扩展，否则文件是纯文本：Command Palette → **Extensions: Install from VSIX…** → `.vscode/tee-language.vsix`，然后 reload。`npm install` 也会尝试自动安装。
