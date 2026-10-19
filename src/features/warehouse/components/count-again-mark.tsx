import { Icon } from "@/components/icon";

// The mark of a count line that the Head's approval sent back to be counted again because the item
// moved after the start (09 Other documents, Stock count; plan of 7.4, decided item 2). A colour
// label always carries an icon and a word (11-screens-and-ux.md; .claude/rules/ui.md).

export function CountAgainMark({ label }: { label: string }) {
  return (
    <span
      data-count-again
      className="inline-flex w-fit items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-sm leading-5 font-semibold text-warning"
    >
      <Icon name="history" size={16} />
      {label}
    </span>
  );
}
