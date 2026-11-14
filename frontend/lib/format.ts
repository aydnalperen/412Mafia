export type FormattedSourceBlock = {
  kind: "bullet" | "text";
  text: string;
};

const ABBREVIATION_ENDINGS = new Set([
  "e.g.",
  "i.e.",
  "etc.",
  "vs.",
  "prof.",
  "dr.",
  "mr.",
  "mrs.",
  "ms.",
  "fig.",
  "eq.",
  "sec.",
  "no.",
  "ch.",
  "p.",
  "pp.",
  "st.",
  "al.",
]);

function isSentenceBoundary(chunkBeforeSpace: string, nextChar: string): boolean {
  if (!/[A-Z0-9"'\u201c([]/.test(nextChar)) return false;
  const trimmed = chunkBeforeSpace.trim();
  const lastWordMatch = trimmed.match(/([A-Za-z0-9.]+)["')\]]*$/);
  if (!lastWordMatch) return true;
  const token = lastWordMatch[1].toLowerCase();
  if (ABBREVIATION_ENDINGS.has(token)) return false;
  // Single initial like "A." or numbered token right before lowercase/paren shouldn't force split
  if (/^[a-z]\.$/.test(token)) return false;
  return true;
}

function splitSentences(paragraph: string): string[] {
  const sentences: string[] = [];
  let start = 0;
  let i = 0;

  while (i < paragraph.length) {
    const ch = paragraph[i];
    if (ch === "." || ch === "?" || ch === "!") {
      // Avoid decimals like 1.5 or 3.14
      if (
        ch === "." &&
        i > 0 &&
        i + 1 < paragraph.length &&
        /\d/.test(paragraph[i - 1]) &&
        /\d/.test(paragraph[i + 1])
      ) {
        i += 1;
        continue;
      }

      let end = i + 1;
      while (end < paragraph.length && /[.!?]/.test(paragraph[end])) {
        end += 1;
      }
      while (end < paragraph.length && /["')\u201d\]]/.test(paragraph[end])) {
        end += 1;
      }

      if (end < paragraph.length && /\s/.test(paragraph[end])) {
        let nextNonSpace = end;
        while (
          nextNonSpace < paragraph.length &&
          /\s/.test(paragraph[nextNonSpace])
        ) {
          nextNonSpace += 1;
        }
        const candidate = paragraph.slice(start, end);
        if (
          nextNonSpace < paragraph.length &&
          isSentenceBoundary(candidate, paragraph[nextNonSpace])
        ) {
          sentences.push(candidate.trim());
          start = nextNonSpace;
          i = nextNonSpace;
          continue;
        }
      }
      i = end;
      continue;
    }
    i += 1;
  }

  const tail = paragraph.slice(start).trim();
  if (tail) {
    sentences.push(tail);
  }
  return sentences;
}

/**
 * Formats long speech transcript segments into scannable multi-sentence
 * paragraphs while preserving all source text verbatim.
 */
export function formatTranscriptParagraphs(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];

  const rawBlocks = normalized
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);

  const paragraphs: string[] = [];

  for (const rawBlock of rawBlocks) {
    const lines = rawBlock
      .split("\n")
      .map((line) => line.replace(/[ \t]{2,}/g, " ").trim())
      .filter(Boolean);

    const looksStructured =
      lines.length > 1 &&
      lines.some(
        (line) =>
          /^[-*\u2022]\s+/.test(line) ||
          /^\d+[.)]\s+/.test(line) ||
          /^[A-Za-z0-9 _.-]{1,28}:\s+\S/.test(line)
      );

    if (looksStructured) {
      for (const line of lines) {
        paragraphs.push(line);
      }
      continue;
    }

    const joined = lines.join(" ").replace(/[ \t]{2,}/g, " ").trim();
    if (joined.length <= 360) {
      paragraphs.push(joined);
      continue;
    }

    const sentences = splitSentences(joined);
    if (sentences.length <= 1) {
      paragraphs.push(joined);
      continue;
    }

    const targetChars = 360;
    let current = "";
    let sentenceCount = 0;

    for (let idx = 0; idx < sentences.length; idx += 1) {
      const sentence = sentences[idx];
      const candidate = current ? `${current} ${sentence}` : sentence;
      const isLast = idx === sentences.length - 1;
      const nextSentence = !isLast ? sentences[idx + 1] : "";

      current = candidate;
      sentenceCount += 1;

      const shouldFlush =
        !isLast &&
        ((current.length >= targetChars && sentenceCount >= 2) ||
          sentenceCount >= 4) &&
        !(nextSentence.length < 90 && idx + 1 === sentences.length - 1 && current.length < 480);

      if (shouldFlush) {
        paragraphs.push(current);
        current = "";
        sentenceCount = 0;
      }
    }

    if (current) {
      paragraphs.push(current);
    }
  }

  return paragraphs;
}

export function formatClockSeconds(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function formatTimestampRange(
  startSeconds: number | null,
  endSeconds: number | null
): string | null {
  if (startSeconds === null || endSeconds === null) return null;
  return `${formatClockSeconds(startSeconds)} – ${formatClockSeconds(endSeconds)}`;
}

/**
 * Cleans jagged PDF column whitespace and inline bullet markers in slide/source
 * excerpts into structured lines and bullets without altering underlying content.
 */
export function formatSourceBlocks(text: string): FormattedSourceBlock[] {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];

  const rawLines = normalized.split("\n");
  const splitSegments: Array<{ kind: "bullet" | "text"; text: string }> = [];

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Split wide slide column gaps (4+ spaces) and inline bullet markers
    const columnParts = trimmed
      .split(/\s{4,}/)
      .map((part) => part.trim())
      .filter(Boolean);

    for (const part of columnParts) {
      const subBullets = part
        .split(/(?=\s[\u2022•]\s)/)
        .map((chunk) => chunk.trim())
        .filter(Boolean);

      for (const piece of subBullets) {
        const clean = piece.replace(/[ \t]{2,}/g, " ").trim();
        if (/^[\u2022•\-*]\s*/.test(clean)) {
          const content = clean.replace(/^[\u2022•\-*]\s*/, "").trim();
          if (content) {
            splitSegments.push({ kind: "bullet", text: content });
          }
        } else {
          splitSegments.push({ kind: "text", text: clean });
        }
      }
    }
  }

  // Merge wrapped continuation lines inside the same bullet or paragraph
  const merged: FormattedSourceBlock[] = [];
  for (const item of splitSegments) {
    const prev = merged[merged.length - 1];
    const startsWithContinuation = /^[a-z,(]/.test(item.text);
    const prevContinues = /[-,]$/.test(prev ? prev.text : "");
    const isNumberedItem = /^\d+[.)]\s+/.test(item.text);

    if (
      prev &&
      item.kind === "text" &&
      !isNumberedItem &&
      prev.text.length < 360 &&
      (startsWithContinuation || prevContinues)
    ) {
      if (prev.text.endsWith("-")) {
        prev.text = `${prev.text}${item.text}`;
      } else {
        prev.text = `${prev.text} ${item.text}`;
      }
      continue;
    }

    merged.push({ ...item });
  }

  return merged;
}

export function splitQuestionTitleAndBody(text: string): {
  title: string;
  body: string;
} {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  const breakIdx = normalized.indexOf("\n");
  if (breakIdx === -1) {
    return { title: "", body: normalized };
  }
  const firstLine = normalized.slice(0, breakIdx).trim();
  const rest = normalized.slice(breakIdx + 1).trim();
  if (firstLine.length > 0 && firstLine.length <= 96 && rest.length > 0) {
    return { title: firstLine, body: rest };
  }
  return { title: "", body: normalized };
}
