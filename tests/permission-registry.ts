import type { Permission } from "@/domain/permissions";

// Every way in, listed (developer-rules.md rule 4: "Every server action and query calls the same
// authorize() function"; plan of 0.7). tests/permission-registry.test.ts turns red when a server
// action, a query or a page that skips the sign-in check is not listed here. A later task adds
// its actions and queries with the permission they ask authorize() for, and a matrix test with
// describePermissionMatrix() (tests/helpers/permission-matrix.ts).

/** `OPEN`: runs before a user is known, or ends the caller's own session only. */
type Entry = Permission | "OPEN";

/** Exports of `"use server"` files, as `<file>#<export>`. */
export const SERVER_ACTIONS: Record<string, Entry> = {
  // Decisions 0.6, item 3 (Look first): no authorize(), outside the action wrapper.
  "src/app/login/actions.ts#signInAction": "OPEN",
  "src/app/login/actions.ts#signOutAction": "OPEN",
  "src/app/login/actions.ts#chooseLanguageAction": "OPEN",
};

/** Exports of `src/features/<area>/queries/`, as `<file>#<export>`. */
export const QUERIES: Record<string, Permission> = {};

/**
 * Pages and routes open to a signed-out visitor (progress 0.16 and 0.6). Every other `page.tsx`
 * and `route.ts` calls requireUser() or authorize() itself.
 */
export const OPEN_ROUTES: readonly string[] = [
  // The public placeholder until 0.10 (decisions 0.6, item 14).
  "src/app/page.tsx",
  "src/app/login/page.tsx",
  // The health check of the host (0.16).
  "src/app/health/route.ts",
];

export type SourceFile = { path: string; text: string };

/** The names a module exports: functions, constants and `export { a, b }`. */
export function exportedNames(text: string): string[] {
  const names = new Set<string>();
  for (const match of text.matchAll(
    /^export\s+(?:default\s+)?(?:async\s+)?(?:function\s*\*?|const|let)\s+([A-Za-z_$][\w$]*)/gm,
  )) {
    names.add(match[1]!);
  }
  for (const match of text.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of match[1]!.split(",")) {
      const name = part
        .trim()
        .split(/\s+as\s+/)
        .pop();
      if (name) names.add(name);
    }
  }
  return [...names];
}

/** Whether a file starts with the `"use server"` directive (comments before it allowed). */
export function isServerActionFile(text: string): boolean {
  const code = text.replace(/^(\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*/, "");
  return /^["']use server["']/.test(code);
}

/** What is not listed: unlisted server actions and queries, and pages that are open by mistake. */
export function unlisted(files: readonly SourceFile[]): string[] {
  const missing: string[] = [];
  for (const { path, text } of files) {
    if (/\.test\.tsx?$/.test(path)) continue;
    if (isServerActionFile(text)) {
      for (const name of exportedNames(text)) {
        if (!(`${path}#${name}` in SERVER_ACTIONS)) missing.push(`server action ${path}#${name}`);
      }
    }
    if (/^src\/features\/[^/]+\/queries\//.test(path)) {
      for (const name of exportedNames(text)) {
        if (!(`${path}#${name}` in QUERIES)) missing.push(`query ${path}#${name}`);
      }
    }
    if (/^src\/app\/(.*\/)?(page|route)\.tsx?$/.test(path)) {
      const checks = /\b(requireUser|authorize)\(/.test(text);
      if (!checks && !OPEN_ROUTES.includes(path)) missing.push(`open route ${path}`);
    }
  }
  return missing;
}
