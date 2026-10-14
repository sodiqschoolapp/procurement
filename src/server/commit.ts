// The commit the running app was built from. App Platform binds it to GIT_COMMIT at run time
// (`${_self.COMMIT_HASH}`, .do/app.yaml); CI passes `$GITHUB_SHA`. Read at request time, so the
// image itself holds nothing commit-specific (0.16, plan decision 7).

export const UNKNOWN_COMMIT = "unknown";

/** The full commit sha, or "unknown" when the app was started without one (`npm run dev`). */
export function currentCommit(): string {
  const commit = process.env.GIT_COMMIT?.trim();
  return commit ? commit : UNKNOWN_COMMIT;
}

/** The first seven characters, as GitHub shows a commit; undefined when it is not known. */
export function shortCommit(): string | undefined {
  const commit = currentCommit();
  return commit === UNKNOWN_COMMIT ? undefined : commit.slice(0, 7);
}
