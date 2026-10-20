import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Icon } from "@/components/icon";
import { buttonVariants } from "@/components/ui/button";
import { roleMay } from "@/domain/permissions";
import { canDecide } from "@/domain/suggestions";
import { getSuggestion } from "@/features/catalog/queries/suggestions";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";

import { readOrNotFound } from "../../branches/read-or-not-found";
import { DeclineForm } from "../decline-form";
import { SuggestionStatusText } from "../suggestion-status";

// /suggestions/[id] (build-plan 1.12; plan of 1.12, decision 4, Look first): one suggestion with
// its large photo. The Head sees Add to catalog and Decline while it is pending (04 rule 8); a
// decided one shows the decision, who and when, and the reason or the product. Another branch's is
// "Not found" (03 rule 1). Only the buttons that work now are shown (11-screens-and-ux.md); the
// server asks again.

export default async function SuggestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/suggestions/${id}`);
  const suggestion = await readOrNotFound(() => getSuggestion(user.id, id));
  if (!suggestion) notFound();
  const t = await getTranslations("suggestions");
  const format = await getFormatters();
  const manages = roleMay("catalog.manage", user.role);
  const decides = manages && canDecide(suggestion.status);
  const fact = (label: string, value: React.ReactNode) => (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm leading-5 text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{value}</dd>
    </div>
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link
        href="/suggestions"
        className="inline-flex min-h-11 min-w-11 items-center gap-1 self-start text-sm leading-5 font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0"
      >
        <Icon name="chevron_left" />
        {t("back")}
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-title break-words">
          {suggestion.name}
        </h1>
        <SuggestionStatusText status={suggestion.status} />
      </div>

      <section className="flex flex-col gap-6 rounded-xl bg-card p-6 text-card-foreground sm:flex-row">
        {suggestion.photoFileId ? (
          // eslint-disable-next-line @next/next/no-img-element -- a private file route, not an asset
          <img
            src={`/files/${suggestion.photoFileId}/large`}
            alt={t("photoAlt", { name: suggestion.name })}
            className="max-h-80 w-full rounded-lg bg-muted object-contain sm:w-64"
          />
        ) : (
          <span className="flex h-40 w-full items-center justify-center rounded-lg bg-muted text-muted-foreground sm:w-64">
            <Icon name="inventory_2" size={24} />
            <span className="sr-only">{t("noPhoto")}</span>
          </span>
        )}
        <dl className="flex min-w-0 flex-1 flex-col gap-4">
          {fact(t("fields.unitText"), suggestion.unitText)}
          {fact(
            t("fields.branchId"),
            t("oneBranch", { code: suggestion.branchCode, name: suggestion.branchName }),
          )}
          {fact(t("suggestedBy"), suggestion.suggestedByName)}
          {fact(
            t("sentOn"),
            `${format.date(suggestion.createdAt)} ${format.time(suggestion.createdAt)}`,
          )}
          {fact(t("fields.note"), suggestion.note ?? t("noNote"))}
        </dl>
      </section>

      {suggestion.status !== "PENDING" && (
        <section className="flex flex-col gap-4 rounded-xl bg-card p-6 text-card-foreground">
          <dl className="flex flex-col gap-4">
            {suggestion.decidedByName && fact(t("decidedBy"), suggestion.decidedByName)}
            {suggestion.decidedAt &&
              fact(
                t("decidedOn"),
                `${format.date(suggestion.decidedAt)} ${format.time(suggestion.decidedAt)}`,
              )}
            {suggestion.decisionNote && fact(t("fields.reason"), suggestion.decisionNote)}
            {suggestion.productId &&
              suggestion.productName &&
              fact(
                t("product"),
                manages ? (
                  <Link
                    href={`/catalog/products/${suggestion.productId}`}
                    className="font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {suggestion.productName}
                  </Link>
                ) : (
                  suggestion.productName
                ),
              )}
          </dl>
        </section>
      )}

      {decides && (
        <section className="flex flex-col gap-4 rounded-xl bg-card p-6 text-card-foreground">
          <Link
            href={`/suggestions/${suggestion.id}/add`}
            className={buttonVariants({ className: "w-full sm:w-auto sm:self-start" })}
          >
            {t("add")}
          </Link>
          <DeclineForm suggestionId={suggestion.id} />
        </section>
      )}
    </div>
  );
}
