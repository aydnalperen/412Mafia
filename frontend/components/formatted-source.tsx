import { formatSourceBlocks, formatTranscriptParagraphs } from "@/lib/format";

export function FormattedSourceText({
  text,
  className = "source-excerpt",
}: {
  text: string;
  className?: string;
}) {
  const blocks = formatSourceBlocks(text);

  if (blocks.length === 0) {
    return null;
  }

  // Group adjacent bullets into <ul> lists and break single massive prose blocks into readable paragraphs
  const groups: Array<
    | { kind: "list"; items: string[] }
    | { kind: "paragraph"; text: string }
  > = [];

  for (const block of blocks) {
    if (block.kind === "bullet") {
      const prev = groups[groups.length - 1];
      if (prev && prev.kind === "list") {
        prev.items.push(block.text);
      } else {
        groups.push({ kind: "list", items: [block.text] });
      }
    } else if (block.text.length > 380) {
      for (const para of formatTranscriptParagraphs(block.text)) {
        groups.push({ kind: "paragraph", text: para });
      }
    } else {
      groups.push({ kind: "paragraph", text: block.text });
    }
  }

  return (
    <div className={`${className} formatted-source`}>
      {groups.map((group, idx) =>
        group.kind === "list" ? (
          <ul key={`list-${idx}`} className="formatted-bullet-list">
            {group.items.map((item, itemIdx) => (
              <li key={`item-${itemIdx}`}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={`para-${idx}`} className="formatted-paragraph">
            {group.text}
          </p>
        )
      )}
    </div>
  );
}
