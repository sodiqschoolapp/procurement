# Progress

The memory between sessions. `/finish-task` adds one entry per task, newest at the bottom. `/next-task` reads the last three entries and every "what the next sessions must know".

## Format of an entry

```
## <id> <title> (<date>, pull request #<number>)

**Built**
- <what exists now, in a few lines>

**Left out, and the task that brings it**
- <thing>: task <id>

**Open for the owner**
- <a decision or data the owner must give, and by which task>

**What the next sessions must know**
- <a helper to reuse and where it is>
- <a pattern that was set and must be followed>
- <a trap that cost time>
```

Keep an entry under 25 lines. Facts only: no story of the session, no praise, nothing that is already in the code or the spec.

## Entries

## 0.1 Repository skeleton (10.10.2026, pull request #1)

**Built**
- Next.js 16.4 App Router project, TypeScript 6.0 strict, Tailwind CSS 4, ESLint 9, Prettier, shadcn/ui set up with no component yet.
- The folder layout of `CLAUDE.md`; nine npm scripts (the eight of the task and `format`); `.env.example` with no name yet.
- A start page at `/` with two texts from `src/i18n/messages/`; one Vitest test and one Playwright test.

**Left out, and the task that brings it**
- Docker Compose, the database, real `db:migrate`: task 0.2. Real `db:seed`: task 0.14.
- next-intl and the language choice: task 0.5. A `start` script: task 0.15.
- Any shadcn component: the first task that needs one. It then installs `radix-ui`, which is a new dependency to ask for.

**Open for the owner**
- Whether `npm run dev` should be reachable from other devices on the network: before task 0.6.

**What the next sessions must know**
- seed: placeholder until 0.14. `npm run db:seed` only prints `NOT BUILT YET` and ends without an error; every `/finish-task` report from 0.2 to 0.13 writes "seed: placeholder until 0.14" where it would show the seed run. `db:migrate` is the same until 0.2.
- Next.js 16.4 ships its own guides in `node_modules/next/dist/docs/`. Read the guide there before using a Next.js feature; it differs from older versions.
- The page texts are read by a plain import of `uz.json`. Task 0.5 replaces that import in `src/app/layout.tsx` and `src/app/page.tsx`. A new text goes into all three message files.
- shadcn: add a component with `npx shadcn@latest add <name>` and never run `init` again. `init -d` silently chose another style, wrote a font, a dark block and a button. After an `add`, check `git status` for anything beyond the component.
- `cn()` is imported from `@/components/utils`. There is no `src/lib/`.
- `npm run lint` also checks formatting; `npm run format` fixes it. `docs/`, `.claude/` and `CLAUDE.md` are never formatted.
- Trap: `next dev` writes an `AGENTS.md` when it sees an AI agent. `agentRules: false` in `next.config.ts` stops it; do not remove that line.
- Trap: the Playwright browser download broke twice on a weak connection. `npx playwright install chromium --only-shell` fetches only the missing part.

The next task is 0.2.
