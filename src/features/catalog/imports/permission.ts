import { IMPORT_PERMISSIONS, type ImportKind } from "@/domain/imports";
import { PERMISSIONS } from "@/domain/permissions";
import { authorize, authorizeList } from "@/server/authorize";

// Whether the user may open an import of a kind at all, for its page and its template (plan of
// 5.9): a global permission by authorize(), a branch one (stock) by authorizeList(), since the page
// names no branch yet; the preview and the save then ask the branch. Throws AuthorizationError.

export async function authorizeImportKind(userId: string, kind: ImportKind): Promise<void> {
  const permission = IMPORT_PERMISSIONS[kind];
  if (PERMISSIONS[permission].scope === "branch") await authorizeList(userId, permission);
  else await authorize(userId, permission);
}
