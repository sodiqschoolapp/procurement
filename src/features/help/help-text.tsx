import type { ReactNode } from "react";

import { type Inline, parseHelpText } from "./text";

// One help text as the page shows it (plan of 9.7, decided item 5): the blocks of text.ts as
// elements, styled with the design system's tokens. Words are always text, never HTML.

function inline(parts: Inline[]): ReactNode[] {
  return parts.map((part, at) => {
    if (part.kind === "bold") return <strong key={at}>{part.text}</strong>;
    if (part.kind === "code") {
      return (
        <code key={at} className="rounded-label bg-muted px-1 font-mono text-[0.9em] tabular-nums">
          {part.text}
        </code>
      );
    }
    if (part.kind === "link") {
      return (
        <a key={at} href={part.href} className="font-medium underline-offset-2 hover:underline">
          {part.text}
        </a>
      );
    }
    return part.text;
  });
}

export function HelpText({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-3">
      {parseHelpText(text).map((block, at) => {
        if (block.kind === "heading") {
          return (
            <h4 key={at} className="font-semibold">
              {inline(block.content)}
            </h4>
          );
        }
        if (block.kind === "paragraph") {
          return (
            <p key={at} className="max-w-[68ch]">
              {inline(block.content)}
            </p>
          );
        }
        if (block.kind === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List
              key={at}
              className={`flex max-w-[68ch] flex-col gap-1 pl-5 ${block.ordered ? "list-decimal" : "list-disc"}`}
            >
              {block.items.map((item, index) => (
                <li key={index}>{inline(item)}</li>
              ))}
            </List>
          );
        }
        return (
          <div key={at} className="overflow-x-auto rounded-panel border border-border bg-card">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {block.header.map((cell, index) => (
                    <th
                      key={index}
                      className="border-b border-border bg-muted px-3 py-2 text-left align-top font-semibold text-muted-foreground"
                    >
                      {inline(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, index) => (
                  <tr key={index} className="border-b border-border last:border-b-0">
                    {row.map((cell, column) => (
                      <td key={column} className="px-3 py-2 align-top">
                        {inline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
