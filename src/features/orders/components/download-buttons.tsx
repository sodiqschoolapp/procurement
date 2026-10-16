import { getTranslations } from "next-intl/server";

import { Icon } from "@/components/icon";
import { buttonVariants } from "@/components/ui/button";

// The buttons Download Excel and Download PDF at the top of the order list (11-screens-and-ux.md,
// Order list layout 1; 05-order-request-form.md, Download; plan of 2.14). Plain links to the
// download route with the list's effective filters, so the file holds exactly what the list shows
// (decided item 13), over an empty list too. Every role sees them (03 matrix "Export to Excel,
// download PDF, print"); the route asks the server again.

export async function DownloadButtons({ query }: { query: string }) {
  const t = await getTranslations("orders.download");
  const suffix = query ? `?${query}` : "";
  return (
    <div className="flex flex-wrap gap-2">
      {(["excel", "pdf"] as const).map((format) => (
        <a
          key={format}
          href={`/orders/download/${format}${suffix}`}
          download
          data-download={format}
          className={buttonVariants({ variant: "secondary" })}
        >
          <Icon name="download" />
          {t(format)}
        </a>
      ))}
    </div>
  );
}
