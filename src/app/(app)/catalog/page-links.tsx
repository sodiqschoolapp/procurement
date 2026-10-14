import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

// Previous and Next of a catalog list (11-screens-and-ux.md rule 8: "25 rows per page, loaded
// from the server"), for the four catalogs of 1.5 and departments (1.6).

export async function PageLinks({
  page,
  pages,
  href,
}: {
  page: number;
  pages: number;
  href: (page: number) => string;
}) {
  const t = await getTranslations("pager");
  return (
    <nav aria-label={t("label")} className="flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link href={href(page - 1)} className={buttonVariants({ variant: "secondary" })}>
          {t("previous")}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted-foreground">{t("pageOf", { page, pages })}</span>
      {page < pages ? (
        <Link href={href(page + 1)} className={buttonVariants({ variant: "secondary" })}>
          {t("next")}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
