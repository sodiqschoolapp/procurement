import { useTranslations } from "next-intl";

import { Icon, type IconName } from "@/components/icon";
import type { SuggestionStatus } from "@/domain/suggestions";

// A suggestion's status in plain words with an icon, never a status label: labels are for request
// statuses and the three colour labels only (docs/design-system.md, What we never do 4; plan of
// 1.12, review of the plan, Must fix 2).

const ICONS: Record<SuggestionStatus, IconName> = {
  PENDING: "schedule",
  ADDED: "check_circle",
  DECLINED: "cancel",
};

export function SuggestionStatusText({ status }: { status: SuggestionStatus }) {
  const t = useTranslations("suggestions.status");
  return (
    <span className="inline-flex items-center gap-1.5 text-sm leading-5">
      <Icon name={ICONS[status]} size={18} className="shrink-0 text-muted-foreground" />
      {t(status)}
    </span>
  );
}
