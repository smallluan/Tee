# Tee starter

Vite + `.tee` 单文件组件。模板在构建期编成 DOM 工厂，运行时走双向映射表，没有虚拟 DOM。

```bash
npm install
npm run dev
```

## 文件

- `src/App.tee` — 模板 / setup 脚本 / Less（scoped）
- `src/main.ts` — `Tee.create`
- `.vscode/settings.json` — `*.tee` 关联 Tee 语言
- `.vscode/tee-language.vsix` — 语言扩展（高亮、补全、T 形文件图标）

打开 `App.tee` 之前装扩展，否则文件是纯文本：Command Palette → **Extensions: Install from VSIX…** → `.vscode/tee-language.vsix`，然后 reload。`npm install` 也会尝试自动安装。
