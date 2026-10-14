import { getTranslations } from "next-intl/server";

import { HexagonColumn } from "@/components/hexagons";
import { cn } from "@/components/utils";

// The navy panel of the sign-in page (docs/design-system.md, Sign-in): the slogan in Bitter,
// uppercase, orange, with the brand's line ornament, and a white column of orange hexagons (the
// brand book's cover). Hidden at phone width. Decoration apart from the slogan.
export async function BrandPanel({ className }: { className?: string }) {
  const t = await getTranslations("login");
  return (
    <aside
      data-testid="brand-panel"
      className={cn("relative overflow-hidden bg-sidebar text-primary", className)}
    >
      <div className="flex flex-1 flex-col justify-center gap-8 p-12">
        <div aria-hidden="true" className="flex items-center gap-3">
          <span className="h-1 w-16 rounded-full bg-primary" />
          <span className="h-px w-24 bg-primary" />
        </div>
        <p className="font-slab text-[40px] leading-[44px] font-extrabold break-words uppercase lg:text-[56px] lg:leading-[58px]">
          {t("slogan")}
        </p>
        <div aria-hidden="true" className="flex items-center gap-3">
          <span className="h-px w-24 bg-primary" />
          <span className="h-1 w-16 rounded-full bg-primary" />
        </div>
      </div>
      <div className="relative w-24 shrink-0 bg-white lg:w-32">
        <HexagonColumn className="absolute inset-0 size-full" />
      </div>
    </aside>
  );
}
