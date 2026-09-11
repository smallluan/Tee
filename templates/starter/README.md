# Tee starter

Vite + `.tee` 单文件组件。模板在构建期编成 DOM 工厂，运行时走双向映射表，没有虚拟 DOM。

```bash
npm install
npm run dev
```

## 文件

- `src/App.tee` — 模板 / setup 脚本 / Less（scoped）
- `src/main.ts` — `Tee.create`
- `.vscode/settings.json` — `*.tee` 关联 Tee 语言（不要用 HTML，否则 `{{ }}` / `t-if` 会变成普通字符串）

打开 `App.tee` 之前，把语言扩展装上：Command Palette → **Developer: Install Extension from Location…** → `node_modules/tee-framework/editor/vscode-tee`，然后 reload。这样 `import { setup } from "tee-framework"` 有补全，模板里的插值和 `t-*` 按表达式高亮。
