import { getTranslations } from "next-intl/server";

import Image from "next/image";

import { HexagonColumn } from "@/components/hexagons";
import { cn } from "@/components/utils";

// The brand panel of the sign-in page (docs/design-system.md, This app, Sign-in: "a quiet panel
// beside it with the shield, the school's slogan in navy and a short orange line"), with a column
// of hexagon outlines from the brand book at its edge. Hidden at phone width. Decoration apart
// from the slogan.
export async function BrandPanel({ className }: { className?: string }) {
  const t = await getTranslations("login");
  return (
    <aside
      data-testid="brand-panel"
      className={cn(
        "relative overflow-hidden border-l border-border bg-background text-foreground",
        className,
      )}
    >
      <div className="flex flex-1 flex-col justify-center gap-6 p-12">
        <Image
          src="/brand/sodiq-mark.svg"
          alt=""
          width={44}
          height={56}
          unoptimized
          className="h-14 w-auto dark:hidden"
        />
        <Image
          src="/brand/sodiq-mark-on-dark.svg"
          alt=""
          width={44}
          height={56}
          unoptimized
          className="hidden h-14 w-auto dark:block"
        />
        <span aria-hidden="true" className="h-1 w-12 rounded-full bg-brand" />
        <p className="max-w-md text-[2rem] leading-[2.5rem] font-semibold tracking-[-0.02em] text-balance uppercase lg:text-[2.5rem] lg:leading-[3rem]">
          {t("slogan")}
        </p>
      </div>
      <div className="relative w-20 shrink-0 lg:w-28">
        <HexagonColumn className="absolute inset-0 size-full" />
      </div>
    </aside>
  );
}
