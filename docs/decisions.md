# Decisions

Two kinds of entries live here.

- **Standing decisions**: what the owner decided outside the spec. They hold for every task. A new one is added by the owner's word only, with the date.
- **Task sections**: every task appends its own dated section in `/finish-task`, listing each technical choice made alone and why. Business rules never appear there; those go through `/spec-change`.

## Standing decisions

| # | Date | Decision | Why |
| --- | --- | --- | --- |
| D1 | 10.10.2026 | The spec is final at document revision 123. `docs/spec/` in this repository is now the source of truth; the earlier online document is history. Changes go through `/spec-change` only. | Owner: "final". |
| D2 | 10.10.2026 | Assumptions A1 to A14 are confirmed. A7, A8 and A11 were confirmed with changes, already written into `02-assumptions.md`. | Owner's answers. |
| D3 | 10.10.2026 | What matters most, in order: money and stock always correct; nobody sees or changes another branch's data; the approval order cannot be skipped. | Owner agreed to the ranking. |
| D4 | 10.10.2026 | The audit log and the notification bell are built in phase 0 as foundations. The spec's build order lists them under phases 1 and 2; the product order is otherwise unchanged. | Owner: "do whichever is logical". Every later task writes audit rows and notifications, so the helpers must exist first. |
| D5 | 10.10.2026 | There is no REST API. "API foundations" means the server-action wrapper of task 0.8. | The spec's stack uses Server Actions. |
| D6 | 10.10.2026 | Technical choices are recorded in this file, `docs/decisions.md`. | Owner: change the spec's wording; done in architecture rule 15. |
| D7 | 10.10.2026 | Package manager: npm. | It ships with Node.js, so nothing extra is installed. |
| D8 | 10.10.2026 | The second reviewer is `permission-reviewer`. Money and stock rules are the first thing the `spec-reviewer` checks. | Owner: "whichever". Permissions touch every action of every task and are the hardest to see in a hand test. |
| D9 | 10.10.2026 | The Head creates each password and can renew any user's password at any time, typed or generated; a renewal signs that user out on every device at once; users cannot change their own. There are no password rules and no forced change at first sign-in. A session lasts 24 hours after sign-in, on any device. | Owner's answers; written into A8. |
| D10 | 10.10.2026 | The first day of the school year is a setting (`school_year_start`). | Owner's answer. |
| D11 | 10.10.2026 | No Telegram and no other messenger, email or SMS. Notifications are the in-app bell only. | Owner's answer. |
| D12 | 10.10.2026 | Claude Code writes the interface texts in Uzbek, Russian and English; the owner corrects Uzbek and Russian (task 8.4). | Owner: "you write". |
| D13 | 10.10.2026 | No `LICENSE` file for now. | Owner: "maybe". Open question 4. |
| D14 | 10.10.2026 | Addresses: `ombor.sodiqschool.uz` for production and `ombor-test.sodiqschool.uz` for the test copy. | Owner chose `ombor.sodiqschool.uz`; the test address follows it. |
| D15 | 10.10.2026 | Hosting as the spec says: app and database on DigitalOcean in Frankfurt, files on Cloudflare R2, test copy included, about $42 a month. | Owner chose it on 10.10.2026. |
| D16 | 10.10.2026 | The owner's machine is Windows 11. Tools are checked and installed in step "Once" of `docs/START-HERE.md`. The GitHub repository is private and is `sodiqschoolapp/procurement`. | Owner's answers. |
| D17 | 10.10.2026 | Only the owner merges pull requests. No skill, agent or session merges or pushes to `main`. | The working method of the starter pack. |
| D18 | 11.10.2026 | The local storage service moves from task 0.2 to task 0.12. Task 0.2 puts PostgreSQL only into `docker-compose.yml`. Before task 0.12, `/spec-change` names what replaces MinIO on the developer's computer. | MinIO's public images were removed from Docker Hub in September 2026 and the project `minio/minio` is archived (25.04.2026, "no longer maintained"). Nothing before 0.12 uses file storage. Owner: "yes" on 11.10.2026 (review of the plan of 0.2, answer 2). |

## Task sections

Each task adds one section here, newest at the bottom:

```
### <id> <title> (<date>)
- <choice made alone>: <reason>.
- Constraint style, naming or structure introduced: <what later tasks must follow>.
```

### 0.1 Repository skeleton (10.10.2026)

- TypeScript 6.0.x, not 7.0: `typescript-eslint` 8.71, which `eslint-config-next` 16.4 brings, accepts TypeScript below 6.1 only. It moves up when `typescript-eslint` declares support for 7 and lint, typecheck and build pass with it.
- ESLint 9.x, not 10: `eslint-plugin-react`, `eslint-plugin-import` and `eslint-plugin-jsx-a11y`, all brought by `eslint-config-next` 16.4, accept ESLint up to 9. npm marks ESLint 9 as no longer supported. It moves up when an `eslint-config-next` release has all its plugins accepting 10; nothing is forced with `--legacy-peer-deps` or `overrides`.
- Node.js 24: `.nvmrc` says `24` and `engines` says `>=24`. Vitest 5 needs 22.12, 24 or newer; the owner's machine has 24.
- `noUncheckedIndexedAccess` is on beside `strict`: an array or record read may be `undefined`, which is where wrong totals start. If a shadcn-generated file fails under it, that one file gets the smallest fix; the flag stays (plan review).
- `tsconfig.json` has `"types": ["node"]` because TypeScript 6 no longer loads every `@types` package by itself, `"allowJs": true` because Next.js writes it on the first run and a clean clone must not be rewritten, and `**/*.mts` in `include` so `vitest.config.mts` is type-checked.
- `npm run lint` runs ESLint with no warnings allowed and then `prettier --check .`: one script guards both, so CI needs no extra step. `npm run format` fixes formatting (approved in the plan review).
- `.prettierignore` holds `docs/`, `.claude/`, `CLAUDE.md`, `drizzle/`, `package-lock.json` and the build folders: the spec, the working method, the project rules and merged migrations are never rewritten by a tool.
- Prettier: line width 100, and `prettier-plugin-tailwindcss` keeps Tailwind class names in one order (approved in the plan review).
- `npm run typecheck` runs `next typegen` before `tsc --noEmit`: `next-env.d.ts` is ignored by git, so a clean clone has to generate it first.
- `vitest.config.mts`, not `.ts`: the `.ts` name made Vite warn about ESM syntax in a file loaded as CommonJS.
- shadcn/ui: style `base-vega`, which is the Base UI library with the Vega look (the classic shadcn look, Inter as its font), base colour `neutral`, CSS variables, lucide icons. Decided in the review of the finished work on the owner's behalf: since July 2026 shadcn recommends Base UI for new projects and a new component may exist for Base UI only; Vega and not Nova, because Nova has "reduced padding and margins for compact layouts", against rules 13 and 15 of `11-screens-and-ux.md` (44 px touch targets, plenty of white space). The plan said `new-york` (built on Radix). No component exists yet and `@base-ui/react` is not installed: it comes with the first component, and the plan of that task lists it.
- How `base-vega` was applied: the tool was run for that style in a throwaway copy outside the repository; its `components.json` and its theme in `globals.css` were compared with ours. Apart from what the plan removes or places elsewhere (the two `--font-*` theme lines and the Inter import, the `.dark` block, `src/lib/utils.ts`, the `lib` and `hooks` aliases), only the style and the two menu keys of `components.json` differed, so that file alone changed. Task 0.10, which brings Inter, has to add the two `--font-*` theme lines.
- `npm run dev` is `next dev --hostname 127.0.0.1`: the development server answers this machine only (review of the finished work; `CLAUDE.md`, "What matters most", point 2). By default Next.js answers every device on the network, and from task 0.6 that server holds a sign-in and a database. `http://localhost:3000` still opens. Screens are checked on a phone by Playwright at 375 px and, from task 0.15, on the test copy.
- The Geist font, the `.dark` block and the button that the shadcn set-up wrote are removed: Inter and the look are task 0.10, the app has a light theme only (`11-screens-and-ux.md` rule 15), and the plan adds no component. The line `@custom-variant dark` stays, so the `dark:` classes inside shadcn components never apply, whatever the device prefers.
- `shadcn` and `tw-animate-css` are development dependencies. The app uses each for one CSS import at build time, the shadcn registry itself declares them so, and `tailwindcss` already sits there. With `shadcn` in `dependencies`, as its set-up wrote it, the production tree had 378 packages and 7 high audit findings; now it has none.
- `cn()` lives at `src/components/utils.ts` and comes from the package `cn`, which shadcn now installs in place of `clsx` and `tailwind-merge`. The `CLAUDE.md` layout has no `src/lib/`; the shadcn aliases for `lib` and `hooks` point inside `src/components/` too.
- `agentRules: false` in `next.config.ts`: Next.js 16.4 writes an `AGENTS.md` into the repository when `next dev` sees an AI coding agent, which left the tree dirty after every Playwright run. `CLAUDE.md` is the rules file here; a second one is the owner's decision.
- Feature areas (`src/features/<area>/`) get their `actions/`, `queries/` and `components/` folders with their first file. Empty folders are kept in git by a `.gitkeep`, removed when the first real file arrives.
- The start-page texts are read by a plain import of `uz.json` until task 0.5 brings next-intl; the three message files exist from the first commit, so rule 13 never had an exception.
- `.env.example` holds no name until a task's code reads one; names are not invented ahead of the code. A test refuses any line with a value, and any comment that holds an `=`.
- `db:migrate` and `db:seed` are placeholders that print `NOT BUILT YET: <script> arrives in task <id>` and end without an error (plan review, answer 3), until tasks 0.2 and 0.14 replace them.
- Playwright runs Chromium only, in two projects: `phone-375` and `desktop-1440`, the two widths of the quality bar. It starts `npm run dev` itself.
- Version ranges with a committed `package-lock.json`; `npm ci` for a clean install.
- Naming or structure introduced: where no spec rule exists, a test names the build-plan task or the `CLAUDE.md` line it guards and says so in a comment (plan review). Playwright tests read expected texts from the message files and never type them again.
