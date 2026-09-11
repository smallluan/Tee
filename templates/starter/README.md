# Tee starter

Vite + `.tee` 单文件组件。模板在构建期编成 DOM 工厂，运行时走双向映射表，没有虚拟 DOM。

```bash
npm install
npm run dev
```

## 文件

- `src/App.tee` — 模板 / setup 脚本 / Less（scoped）
- `src/main.ts` — `Tee.create`
- `.vscode/settings.json` — `*.tee` 当 HTML 做补全；关掉 CSS 校验，避免 `<style lang="less">` 里的 `@变量` 被当成非法 CSS

在编辑器里打开 `App.tee` 时，`t-if` / `t-model` / `t-on:click` 应出现在属性补全里。语法高亮可安装仓库里的 `editor/vscode-tee` 扩展（`Extensions: Install from VSIX` 或「从文件夹安装」）。
