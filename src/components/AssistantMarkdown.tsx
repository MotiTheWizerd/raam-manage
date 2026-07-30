import type { ReactNode } from "react";

// Tiny markdown renderer for the assistant's chat bubbles. Covers only the
// subset LLMs actually emit in short chat answers — **bold**, *italic*,
// `code`, ### headings, bullet/numbered lists and blank-line paragraphs —
// and builds React nodes directly (no HTML string injection). Anything it
// doesn't recognize falls through as plain text, so a half-streamed chunk
// just renders literally until its closing marker arrives.

const INLINE_TOKEN = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;

function renderInline(text: string): ReactNode {
  const parts = text.split(INLINE_TOKEN).filter((p) => p !== "");
  return parts.map((part, i) => {
    if (part.startsWith("***") && part.endsWith("***") && part.length > 6)
      return (
        <strong key={i}>
          <em>{part.slice(3, -3)}</em>
        </strong>
      );
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2)
      return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return (
        <code
          key={i}
          className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.85em] dark:bg-white/15"
        >
          {part.slice(1, -1)}
        </code>
      );
    return part;
  });
}

const HEADING = /^#{1,4}\s+(.*)$/;
const BULLET_ITEM = /^\s*[-*•]\s+(.*)$/;
const ORDERED_ITEM = /^\s*(\d+)[.)]\s+(.*)$/;
const QUOTE_LINE = /^>\s?(.*)$/;

type Block =
  | { kind: "heading"; text: string }
  | { kind: "list"; ordered: boolean; start: number; items: string[] }
  | { kind: "quote"; lines: string[] }
  | { kind: "paragraph"; lines: string[] };

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const last = () => blocks[blocks.length - 1];

  for (const line of text.split("\n")) {
    if (line.trim() === "") {
      // Blank line closes the current block.
      if (last() && last().kind !== "heading")
        blocks.push({ kind: "paragraph", lines: [] });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", text: heading[1] });
      continue;
    }

    const quote = QUOTE_LINE.exec(line);
    if (quote) {
      const prev = last();
      if (prev?.kind === "quote") prev.lines.push(quote[1]);
      else blocks.push({ kind: "quote", lines: [quote[1]] });
      continue;
    }

    const ordered = ORDERED_ITEM.exec(line);
    const bullet = ordered ? null : BULLET_ITEM.exec(line);
    if (ordered || bullet) {
      const isOrdered = Boolean(ordered);
      const item = ordered ? ordered[2] : bullet![1];
      const prev = last();
      if (prev?.kind === "list" && prev.ordered === isOrdered) {
        prev.items.push(item);
      } else {
        blocks.push({
          kind: "list",
          ordered: isOrdered,
          start: ordered ? Number(ordered[1]) : 1,
          items: [item],
        });
      }
      continue;
    }

    const prev = last();
    if (prev?.kind === "paragraph") prev.lines.push(line);
    else blocks.push({ kind: "paragraph", lines: [line] });
  }

  return blocks.filter((b) => b.kind !== "paragraph" || b.lines.length > 0);
}

export function AssistantMarkdown({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        if (block.kind === "heading")
          return (
            <div key={i} className="font-semibold">
              {renderInline(block.text)}
            </div>
          );
        if (block.kind === "quote")
          return (
            <blockquote
              key={i}
              className="border-s-2 border-black/20 ps-3 opacity-90 dark:border-white/25"
            >
              {block.lines.map((line, j) => (
                <span key={j}>
                  {j > 0 && <br />}
                  {renderInline(line)}
                </span>
              ))}
            </blockquote>
          );
        if (block.kind === "list") {
          const items = block.items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ));
          return block.ordered ? (
            <ol key={i} start={block.start} className="list-decimal space-y-1 ps-5">
              {items}
            </ol>
          ) : (
            <ul key={i} className="list-disc space-y-1 ps-5">
              {items}
            </ul>
          );
        }
        return (
          <p key={i}>
            {block.lines.map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {renderInline(line)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
