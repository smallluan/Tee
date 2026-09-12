# Agent instructions — Tee

This is a **Tee** app (`tee-framework`). No virtual DOM. `setup` runs once; TwinMap patches real nodes.

## Skill pack (required reading)

Start at **[skill/SKILL.md](skill/SKILL.md)**. It is an index. Open one topic file at a time (`lists.md`, `events.md`, `components.md`, …). Do not skim a single dump — that is why the pack is split.

If this repo has `node_modules/tee-framework/skill/SKILL.md` and `./skill` is missing, use the package copy.

## Do

- `setup(function Name(self) { return <.../> })` — function name is the component name
- Write fields on `self`; view reads `{self.x}` with no `.value`
- Lists: `<For each={self.items} by="id">{(item) => ...}</For>`
- Events: `t-on:click`, `t-on:dblclick`, `t-on:compositionend`
- Forms: `t-model` / `t-model:trim`
- Child: `import Chip from "./Chip.tee"` then `<Chip value={self.n} />`
- Styles: `import "./App.less"` beside the module

## Do not

- `useState` / `useEffect` / `.map()` into JSX in `setup`
- `v-for`, `onClick` when you need `dblclick`, hyphen tags as TSX identity
- Invent router, SSR, Suspense, or new Tee APIs
- Put `<style>` inside a TSX `.tee` file

## Editor

`*.tee` needs `tee-language.vsix` (Install from VSIX → reload). `npm i` does not refresh an already-installed extension.
