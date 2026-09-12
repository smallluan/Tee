# Agent instructions — tee-framework

Tee is a reactive frontend with **no virtual DOM**. Public contract lives in **[skill/SKILL.md](skill/SKILL.md)** (index) and the topic files beside it.

When implementing or documenting:

- Read `skill/SKILL.md`, then only the relevant topic
- Do not add React/Vue-only APIs
- New user-facing behavior needs a skill topic + index row
- Starter apps must keep shipping `CLAUDE.md`, `AGENTS.md`, and `skill/`

Scaffold: `scripts/create-tee.mjs` copies `templates/starter` and `skill/`.
