// The small text format of the help files (plan of 9.7, decided item 5): no Markdown library and
// no HTML in the files. A body is blocks parted by an empty line:
//   ### A heading          a heading inside a topic
//   - item                 a list, one item per line
//   1. item                a numbered list, one item per line
//   | a | b |              a table: the first row is the header, the second its | --- | line
//   anything else          a paragraph; its lines are joined with a space
// Inside a block: **bold**, `code`, and [words](target), where the target is a chapter or topic id
// of the page (written without "#": the translation check reads a "#" outside a plural as an
// error), an address of the app starting with "/", or an https address.

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string };

export type Block =
  | { kind: "heading"; content: Inline[] }
  | { kind: "paragraph"; content: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "table"; header: Inline[][]; rows: Inline[][][] };

const INLINE = /\*\*(.+?)\*\*|`(.+?)`|\[(.+?)\]\((.+?)\)/gu;
const ORDERED_ITEM = /^\d+\.\s+/u;

/** Where a link's target leads: an id of the page becomes "#id". */
export function linkHref(target: string): string {
  if (target.startsWith("/") || target.startsWith("https://")) return target;
  return `#${target}`;
}

/** The words of one line, with their bold, code and links. */
export function parseInline(line: string): Inline[] {
  const found: Inline[] = [];
  let at = 0;
  for (const match of line.matchAll(INLINE)) {
    if (match.index > at) found.push({ kind: "text", text: line.slice(at, match.index) });
    if (match[1] !== undefined) found.push({ kind: "bold", text: match[1] });
    else if (match[2] !== undefined) found.push({ kind: "code", text: match[2] });
    else found.push({ kind: "link", text: match[3]!, href: linkHref(match[4]!) });
    at = match.index + match[0].length;
  }
  if (at < line.length) found.push({ kind: "text", text: line.slice(at) });
  return found;
}

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/u, "")
    .replace(/\|$/u, "")
    .split("|")
    .map((cell) => cell.trim());
}

const isRule = (line: string) => /^\|?\s*:?-{3,}/u.test(line.trim());

/** The blocks of one help text. */
export function parseHelpText(text: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of text.split(/\n\s*\n/u)) {
    const lines = chunk
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
    if (lines.length === 0) continue;
    const first = lines[0]!;
    if (first.startsWith("### ")) {
      blocks.push({ kind: "heading", content: parseInline(first.slice(4)) });
      if (lines.length > 1) {
        blocks.push({ kind: "paragraph", content: parseInline(lines.slice(1).join(" ")) });
      }
    } else if (lines.every((line) => line.startsWith("- "))) {
      blocks.push({
        kind: "list",
        ordered: false,
        items: lines.map((line) => parseInline(line.slice(2))),
      });
    } else if (lines.every((line) => ORDERED_ITEM.test(line))) {
      blocks.push({
        kind: "list",
        ordered: true,
        items: lines.map((line) => parseInline(line.replace(ORDERED_ITEM, ""))),
      });
    } else if (lines.every((line) => line.startsWith("|"))) {
      const body = lines.filter((line, at) => !(at === 1 && isRule(line)));
      blocks.push({
        kind: "table",
        header: cells(body[0]!).map(parseInline),
        rows: body.slice(1).map((line) => cells(line).map(parseInline)),
      });
    } else {
      blocks.push({ kind: "paragraph", content: parseInline(lines.join(" ")) });
    }
  }
  return blocks;
}

/** A help text as plain words, for the search and the tests. */
export function plainText(text: string): string {
  const words = (content: Inline[]) => content.map((part) => part.text).join("");
  return parseHelpText(text)
    .map((block) => {
      if (block.kind === "list") return block.items.map(words).join(" ");
      if (block.kind === "table") {
        return [block.header, ...block.rows].map((row) => row.map(words).join(" ")).join(" ");
      }
      return words(block.content);
    })
    .join(" ");
}
