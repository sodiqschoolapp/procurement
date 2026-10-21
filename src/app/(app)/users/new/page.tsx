import { getTranslations } from "next-intl/server";

import { AdminNav } from "@/components/admin-nav";
import { listBranchChoices } from "@/features/users/queries/users";
import { requireUser } from "@/server/auth/session";

import { readOrNotFound } from "../../branches/read-or-not-found";
import { UserForm } from "../user-form";

// /users/new (build-plan 1.3; plan of 1.3, Look first 6: a page, not the side panel). The query
// asks authorize() first, so a role without "Manage … users" gets "not found" (03 rule 1).

export default async function NewUserPage() {
  const user = await requireUser("/users/new");
  const choices = await readOrNotFound(() => listBranchChoices(user.id));
  const t = await getTranslations();
  return (
    <div className="flex w-full max-w-4xl min-w-0 flex-col gap-6">
      <AdminNav current="users" />
      <h1 className="text-title">{t("users.newTitle")}</h1>
      <UserForm user={null} choices={choices} />
    </div>
  );
}
