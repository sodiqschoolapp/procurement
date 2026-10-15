import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Icon } from "@/components/icon";
import { canDecide } from "@/domain/suggestions";
import { listProductChoices } from "@/features/catalog/queries/products";
import { getSuggestion } from "@/features/catalog/queries/suggestions";
import { requireUser } from "@/server/auth/session";

import { readOrNotFound } from "../../../branches/read-or-not-found";
import { ProductForm } from "../../../catalog/products/product-form";

// /suggestions/[id]/add (build-plan 1.12; 04-catalogs.md rule 8: "The Head adds it (possibly
// edited)"): the product form of 1.7 filled from the suggestion. The choices are read under
// catalog.manage, so a role other than the Head gets "Not found" (03 rule 1); a decided
// suggestion has nothing to add and is "Not found" too. The add itself checks both again.

export default async function AddSuggestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/suggestions/${id}/add`);
  const choices = await readOrNotFound(() => listProductChoices(user.id));
  const suggestion = await readOrNotFound(() => getSuggestion(user.id, id));
  if (!suggestion || !canDecide(suggestion.status)) notFound();
  const t = await getTranslations("suggestions");
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link
        href={`/suggestions/${suggestion.id}`}
        className="inline-flex min-h-11 items-center gap-1 self-start text-sm leading-5 font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0"
      >
        <Icon name="chevron_left" />
        {suggestion.name}
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.01em]">{t("addTitle")}</h1>
        <p className="text-[15px] leading-[22px] text-muted-foreground">
          {t("addIntro", { name: suggestion.suggestedByName })}
        </p>
      </div>
      <ProductForm
        entry={null}
        choices={choices}
        suggestion={{
          id: suggestion.id,
          name: suggestion.name,
          unitText: suggestion.unitText,
          photoFileId: suggestion.photoFileId,
        }}
      />
    </div>
  );
}
