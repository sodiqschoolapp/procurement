import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { Icon } from "@/components/icon";
import { buttonVariants } from "@/components/ui/button";

// The way from a product's or a subtype's page to its price page, where the Head adds a new price
// and sees every older one (build-plan 1.9; 04-catalogs.md rule 4). The price itself stays shown,
// not edited, on those pages (plan of 1.7, decision 2; plan of 1.8, decision 2).

export async function PriceHistoryLink({ variantId }: { variantId: string }) {
  const t = await getTranslations("prices");
  return (
    <Link
      href={`/prices/${variantId}`}
      className={buttonVariants({
        variant: "secondary",
        className: "w-full sm:w-auto sm:self-start",
      })}
    >
      {t("historyLink")}
      <Icon name="chevron_right" />
    </Link>
  );
}
