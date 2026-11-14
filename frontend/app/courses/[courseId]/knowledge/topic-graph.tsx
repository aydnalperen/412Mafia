"use client";

import { useMemo, useRef, useState } from "react";
import { FormattedSourceText } from "@/components/formatted-source";
import type { KnowledgeGraph, Question } from "@/lib/api";
import { splitQuestionTitleAndBody } from "@/lib/format";
import styles from "./topic-graph.module.css";

type Topic = KnowledgeGraph["topics"][number];
type Source = Topic["sources"][number];
type Node =
  | {
      kind: "topic";
      label: string;
      shortLabel: string;
      topic: Topic;
    }
  | {
      kind: "source";
      label: string;
      shortLabel: string;
      source: Source;
    }
  | {
      kind: "question";
      label: string;
      shortLabel: string;
      questionNumber?: string;
    };

function formatShortSeconds(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function shortenFileName(fileName: string): string {
  const base = fileName.replace(/\.[^/.]+$/, "");
  return base.length > 15 ? `${base.slice(0, 14)}…` : base;
}

function formatSourceShortLabel(source: Source): string {
  if (source.start_seconds != null) {
    return `Lecture ${formatShortSeconds(source.start_seconds)}`;
  }
  if (source.page_number != null) {
    return `${source.is_slide ? "Slide" : "p."} ${source.page_number} · ${shortenFileName(source.file_name)}`;
  }
  return shortenFileName(source.file_name);
}

function formatQuestionShortLabel(id: number, question: Question | undefined): string {
  if (!question) return `Question ${id}`;
  const prefix = question.question_number ? `${question.question_number}. ` : "";
  const parsed = splitQuestionTitleAndBody(question.text);
  const summary = (parsed.title || parsed.body || question.text).split("\n")[0].trim();
  const full = `${prefix}${summary}`;
  return full.length > 26 ? `${full.slice(0, 25)}…` : full;
}

function distributeY(count: number, topPad: number, usableHeight: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [topPad + usableHeight / 2];
  return Array.from({ length: count }, (_, idx) => topPad + (idx / (count - 1)) * usableHeight);
}

const VIEW_WIDTH = 980;
const SOURCE_X = 212;
const TOPIC_X = 490;
const TOPIC_PILL_HALF_W = 108;
const TOPIC_PILL_H = 38;
const QUESTION_X = 768;

function layout(topics: Topic[], questions: Map<number, Question>) {
  const nodes = new Map<string, Node>();
  const edges: { from: string; to: string }[] = [];
  const topicNeighborsOfNode = new Map<string, string[]>();

  const topicKeys: string[] = [];
  for (const topic of topics) {
    const from = `topic-${topic.id}`;
    topicKeys.push(from);
    nodes.set(from, {
      kind: "topic",
      label: topic.name,
      shortLabel: topic.name.length > 24 ? `${topic.name.slice(0, 23)}…` : topic.name,
      topic,
    });
    for (const source of topic.sources) {
      const to = `source-${source.chunk_id}`;
      if (!nodes.has(to)) {
        nodes.set(to, {
          kind: "source",
          label: `${source.file_name}${source.page_number != null ? ` (${source.is_slide ? "Slide" : "p."} ${source.page_number})` : ""}`,
          shortLabel: formatSourceShortLabel(source),
          source,
        });
      }
      edges.push({ from, to });
      const arr = topicNeighborsOfNode.get(to) ?? [];
      arr.push(from);
      topicNeighborsOfNode.set(to, arr);
    }
    for (const id of topic.question_ids) {
      const to = `question-${id}`;
      if (!nodes.has(to)) {
        const question = questions.get(id);
        nodes.set(to, {
          kind: "question",
          label: question?.text || `Question ${id}`,
          shortLabel: formatQuestionShortLabel(id, question),
          questionNumber: question?.question_number,
        });
      }
      edges.push({ from, to });
      const arr = topicNeighborsOfNode.get(to) ?? [];
      arr.push(from);
      topicNeighborsOfNode.set(to, arr);
    }
  }

  const sourceKeys = Array.from(nodes.keys()).filter((k) => nodes.get(k)?.kind === "source");
  const questionKeys = Array.from(nodes.keys()).filter((k) => nodes.get(k)?.kind === "question");

  const maxRows = Math.max(topicKeys.length, sourceKeys.length, questionKeys.length, 4);
  const viewHeight = Math.max(540, Math.min(920, maxRows * 46 + 120));
  const topPad = 86;
  const usableHeight = viewHeight - topPad - 44;

  const positions = new Map<string, { x: number; y: number }>();

  // Place topics first (ordered cleanly as returned by backend importance).
  const topicYs = distributeY(topicKeys.length, topPad, usableHeight);
  topicKeys.forEach((key, idx) => {
    positions.set(key, { x: TOPIC_X, y: topicYs[idx] });
  });

  // Sort sources and questions by barycenter Y of connected topics to minimize crossed curves.
  const barycenterSort = (keys: string[]) =>
    [...keys].sort((a, b) => {
      const aParents = topicNeighborsOfNode.get(a) ?? [];
      const bParents = topicNeighborsOfNode.get(b) ?? [];
      const aAvg =
        aParents.reduce((sum, pk) => sum + (positions.get(pk)?.y ?? 0), 0) /
        Math.max(1, aParents.length);
      const bAvg =
        bParents.reduce((sum, pk) => sum + (positions.get(pk)?.y ?? 0), 0) /
        Math.max(1, bParents.length);
      return aAvg - bAvg || a.localeCompare(b);
    });

  const sortedSources = barycenterSort(sourceKeys);
  const sourceYs = distributeY(sortedSources.length, topPad, usableHeight);
  sortedSources.forEach((key, idx) => {
    positions.set(key, { x: SOURCE_X, y: sourceYs[idx] });
  });

  const sortedQuestions = barycenterSort(questionKeys);
  const questionYs = distributeY(sortedQuestions.length, topPad, usableHeight);
  sortedQuestions.forEach((key, idx) => {
    positions.set(key, { x: QUESTION_X, y: questionYs[idx] });
  });

  return { nodes, positions, edges, viewHeight };
}

export function TopicGraph({
  topics,
  questions,
}: {
  topics: Topic[];
  questions: Question[];
}) {
  const { nodes, positions, edges, viewHeight } = useMemo(
    () =>
      layout(
        topics,
        new Map(questions.map((question) => [Number(question.id), question]))
      ),
    [topics, questions]
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragOriginRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    startPanX: number;
    startPanY: number;
    rectWidth: number;
    rectHeight: number;
  } | null>(null);

  const active = selected && nodes.has(selected) ? selected : null;
  const detail = active ? nodes.get(active) : undefined;
  const preview = hovered ?? focused;
  const spotlight = preview && nodes.has(preview) ? preview : active;
  const neighbors = new Set<string>();
  const connections: string[] = [];
  for (const { from, to } of edges) {
    if (from === spotlight) neighbors.add(to);
    if (to === spotlight) neighbors.add(from);
    if (from === active) connections.push(to);
    if (to === active) connections.push(from);
  }

  const connectedSources = connections.filter((k) => nodes.get(k)?.kind === "source");
  const connectedQuestions = connections.filter((k) => nodes.get(k)?.kind === "question");
  const connectedTopics = connections.filter((k) => nodes.get(k)?.kind === "topic");

  const scale = zoom / 100;
  const viewWidth = VIEW_WIDTH / scale;
  const scaledHeight = viewHeight / scale;
  const maxPanX = Math.max(0, (VIEW_WIDTH - viewWidth) / 2);
  const maxPanY = Math.max(0, (viewHeight - scaledHeight) / 2);
  const clampedPanX = Math.max(-maxPanX, Math.min(maxPanX, pan.x));
  const clampedPanY = Math.max(-maxPanY, Math.min(maxPanY, pan.y));
  const viewX = VIEW_WIDTH / 2 - viewWidth / 2 - clampedPanX;
  const viewY = viewHeight / 2 - scaledHeight / 2 - clampedPanY;

  function applyZoom(nextZoom: number) {
    const clampedZoom = Math.max(100, Math.min(200, nextZoom));
    setZoom(clampedZoom);
    if (clampedZoom <= 100) {
      setPan({ x: 0, y: 0 });
    } else {
      const nextWidth = VIEW_WIDTH / (clampedZoom / 100);
      const nextHeight = viewHeight / (clampedZoom / 100);
      const boundX = (VIEW_WIDTH - nextWidth) / 2;
      const boundY = (viewHeight - nextHeight) / 2;
      setPan((prev) => ({
        x: Math.max(-boundX, Math.min(boundX, prev.x)),
        y: Math.max(-boundY, Math.min(boundY, prev.y)),
      }));
    }
  }

  return (
    <section
      className={styles.workspace}
      aria-label="Interactive knowledge graph"
    >
      <div className={styles.graph}>
        <div className={styles.toolbar}>
          <div className={styles.legend}>
            <span className={styles.source}>Course source</span>
            <span className={styles.topic}>Subject</span>
            <span className={styles.question}>Exam question</span>
          </div>
          <div className={styles.zoom}>
            <button
              type="button"
              aria-label="Zoom out"
              disabled={zoom <= 100}
              onClick={() => applyZoom(zoom - 25)}
            >
              −
            </button>
            <button
              type="button"
              aria-label="Reset zoom"
              onClick={() => applyZoom(100)}
            >
              {zoom}%
            </button>
            <button
              type="button"
              aria-label="Zoom in"
              disabled={zoom >= 200}
              onClick={() => applyZoom(zoom + 25)}
            >
              +
            </button>
          </div>
        </div>
        <div
          className={`${styles.viewport}${
            zoom > 100
              ? dragging
                ? ` ${styles.viewportPanning}`
                : ` ${styles.viewportPannable}`
              : ""
          }`}
          onPointerDown={(event) => {
            if (zoom <= 100) return;
            if ((event.target as Element).closest("[role='button']")) return;
            const rect = event.currentTarget.getBoundingClientRect();
            dragOriginRef.current = {
              pointerId: event.pointerId,
              clientX: event.clientX,
              clientY: event.clientY,
              startPanX: clampedPanX,
              startPanY: clampedPanY,
              rectWidth: Math.max(rect.width, 1),
              rectHeight: Math.max(rect.height, 1),
            };
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging(true);
          }}
          onPointerMove={(event) => {
            const origin = dragOriginRef.current;
            if (!origin || origin.pointerId !== event.pointerId) return;
            const dx = ((event.clientX - origin.clientX) / origin.rectWidth) * viewWidth;
            const dy = ((event.clientY - origin.clientY) / origin.rectHeight) * scaledHeight;
            setPan({
              x: Math.max(-maxPanX, Math.min(maxPanX, origin.startPanX + dx)),
              y: Math.max(-maxPanY, Math.min(maxPanY, origin.startPanY + dy)),
            });
          }}
          onPointerUp={(event) => {
            if (dragOriginRef.current?.pointerId === event.pointerId) {
              dragOriginRef.current = null;
              setDragging(false);
            }
          }}
          onPointerCancel={() => {
            dragOriginRef.current = null;
            setDragging(false);
          }}
        >
          <svg
            viewBox={`${viewX} ${viewY} ${viewWidth} ${scaledHeight}`}
            width="100%"
            style={{ aspectRatio: `${VIEW_WIDTH} / ${viewHeight}` }}
            aria-label="Topics and their linked sources and questions"
          >
            <g aria-hidden="true" className={styles.columnHeaders}>
              <text x={SOURCE_X - 6} y={38} textAnchor="end">
                TEACHING SOURCES
              </text>
              <text x={TOPIC_X} y={38} textAnchor="middle">
                COURSE SUBJECTS
              </text>
              <text x={QUESTION_X + 6} y={38} textAnchor="start">
                EXAM QUESTIONS
              </text>
            </g>

            <g
              aria-hidden="true"
              className={spotlight ? styles.quietEdges : undefined}
            >
              {edges.map(({ from, to }) => {
                const fromPos = positions.get(from)!;
                const toPos = positions.get(to)!;
                const toNode = nodes.get(to)!;
                const startX =
                  toNode.kind === "source"
                    ? fromPos.x - TOPIC_PILL_HALF_W
                    : fromPos.x + TOPIC_PILL_HALF_W;
                const endX = toPos.x;
                const dx = (endX - startX) * 0.45;
                const path = `M ${startX} ${fromPos.y} C ${startX + dx} ${fromPos.y}, ${endX - dx} ${toPos.y}, ${endX} ${toPos.y}`;
                const highlighted = spotlight === from || spotlight === to;
                return (
                  <g
                    key={`${from}:${to}`}
                    className={highlighted ? styles.highlight : styles.edge}
                  >
                    <path d={path} />
                    {highlighted && <path d={path} className={styles.flow} />}
                  </g>
                );
              })}
            </g>

            {Array.from(nodes).map(([key, node]) => {
              const { x, y } = positions.get(key)!;
              const isDimmed = spotlight && spotlight !== key && !neighbors.has(key);

              if (node.kind === "topic") {
                return (
                  <g
                    key={key}
                    transform={`translate(${x},${y})`}
                    role="button"
                    tabIndex={0}
                    aria-label={`subject: ${node.label}`}
                    aria-pressed={active === key}
                    className={`${styles.node} ${styles.topic} ${isDimmed ? styles.dimmed : ""}`}
                    data-spotlight={spotlight === key}
                    data-neighbor={neighbors.has(key)}
                    onPointerEnter={(event) => {
                      if (event.pointerType !== "touch") setHovered(key);
                    }}
                    onPointerLeave={() => setHovered(null)}
                    onFocus={(event) => {
                      if (event.currentTarget.matches(":focus-visible")) setFocused(key);
                    }}
                    onBlur={() => setFocused(null)}
                    onClick={() => setSelected(active === key ? null : key)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelected(active === key ? null : key);
                      }
                    }}
                  >
                    <title>{node.label}</title>
                    <rect
                      x={-TOPIC_PILL_HALF_W - 4}
                      y={-TOPIC_PILL_H / 2 - 4}
                      width={TOPIC_PILL_HALF_W * 2 + 8}
                      height={TOPIC_PILL_H + 8}
                      rx={22}
                      className={styles.topicHalo}
                    />
                    <rect
                      x={-TOPIC_PILL_HALF_W}
                      y={-TOPIC_PILL_H / 2}
                      width={TOPIC_PILL_HALF_W * 2}
                      height={TOPIC_PILL_H}
                      rx={19}
                      className={styles.topicPill}
                    />
                    <circle cx={-TOPIC_PILL_HALF_W + 16} cy={0} r={4.5} className={styles.dot} />
                    <text
                      x={-TOPIC_PILL_HALF_W + 28}
                      y={4.5}
                      textAnchor="start"
                      className={styles.topicLabel}
                    >
                      {node.shortLabel}
                    </text>
                  </g>
                );
              }

              const textOffset = node.kind === "source" ? -14 : 14;
              const anchor = node.kind === "source" ? "end" : "start";

              return (
                <g
                  key={key}
                  transform={`translate(${x},${y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${node.kind}: ${node.label}`}
                  aria-pressed={active === key}
                  className={`${styles.node} ${styles[node.kind]} ${isDimmed ? styles.dimmed : ""}`}
                  data-spotlight={spotlight === key}
                  data-neighbor={neighbors.has(key)}
                  onPointerEnter={(event) => {
                    if (event.pointerType !== "touch") setHovered(key);
                  }}
                  onPointerLeave={() => setHovered(null)}
                  onFocus={(event) => {
                    if (event.currentTarget.matches(":focus-visible")) setFocused(key);
                  }}
                  onBlur={() => setFocused(null)}
                  onClick={() => setSelected(active === key ? null : key)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelected(active === key ? null : key);
                    }
                  }}
                >
                  <title>{node.label}</title>
                  <circle r={13} fill="transparent" />
                  <circle className={styles.halo} r={12} />
                  <circle className={styles.dot} r={6} />
                  <text
                    x={textOffset}
                    y={4}
                    textAnchor={anchor}
                    className={styles.leafLabel}
                  >
                    {node.shortLabel}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <aside className={styles.detail} aria-label="Node details">
        {!detail && (
          <div className={styles.detailEmpty}>
            <span className="empty-icon" aria-hidden="true">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="6" cy="6" r="2.5" />
                <circle cx="18" cy="7" r="2.5" />
                <circle cx="12" cy="18" r="2.5" />
                <path d="M8.2 7.2 15.5 7" />
                <path d="M7.3 8.1 10.7 15.8" />
                <path d="M16.7 9.1 13.3 15.8" />
              </svg>
            </span>
            <p className="note" style={{ margin: 0 }}>
              Hover or select any source, subject, or exam question to trace curriculum connections.
            </p>
          </div>
        )}

        {detail && (
          <div className={styles.detailHeader}>
            <span className={`${styles.detailKind} ${styles[detail.kind]}`}>
              {detail.kind === "topic" ? "Course subject" : detail.kind}
            </span>
          </div>
        )}

        {detail?.kind === "topic" && (
          <>
            <h2>{detail.label}</h2>
            {detail.topic.description && (
              <p className={styles.detailBody}>{detail.topic.description}</p>
            )}
            {detail.topic.keywords && detail.topic.keywords.length > 0 && (
              <div className={styles.keywordRow}>
                {detail.topic.keywords.map((kw) => (
                  <span key={kw} className="meta-chip">
                    {kw}
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        {detail?.kind === "source" && (
          <>
            <h2>{detail.source.file_name}</h2>
            <p className="note" style={{ marginBottom: 12 }}>
              {detail.source.page_number != null &&
                `${detail.source.is_slide ? "Slide" : "Page"} ${detail.source.page_number} `}
              {detail.source.start_seconds != null &&
                detail.source.end_seconds != null &&
                `${formatShortSeconds(detail.source.start_seconds)}–${formatShortSeconds(detail.source.end_seconds)}`}
              {detail.source.reason ? ` · ${detail.source.reason}` : ""}
            </p>
            <FormattedSourceText
              className={styles.excerpt}
              text={detail.source.text}
            />
          </>
        )}

        {detail?.kind === "question" && (() => {
          const parsedQuestion = splitQuestionTitleAndBody(detail.label);
          return (
            <>
              <h2>
                {detail.questionNumber ? `Q${detail.questionNumber}. ` : ""}
                {parsedQuestion.title || "Exam question"}
              </h2>
              <p className={styles.excerpt}>{parsedQuestion.body}</p>
            </>
          );
        })()}

        {connectedSources.length > 0 && (
          <div className={styles.connectionsSection}>
            <div className={styles.connectionsHeader}>
              <span>Grounded sources</span>
              <span className="count-pill">{connectedSources.length}</span>
            </div>
            <ul className={styles.connections}>
              {connectedSources.map((key) => {
                const n = nodes.get(key);
                return (
                  <li key={key}>
                    <button type="button" onClick={() => setSelected(key)}>
                      <span>{n?.shortLabel}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {connectedQuestions.length > 0 && (
          <div className={styles.connectionsSection}>
            <div className={styles.connectionsHeader}>
              <span>Linked exam questions</span>
              <span className="count-pill">{connectedQuestions.length}</span>
            </div>
            <ul className={styles.connections}>
              {connectedQuestions.map((key) => {
                const n = nodes.get(key);
                return (
                  <li key={key}>
                    <button type="button" onClick={() => setSelected(key)}>
                      <span>{n?.shortLabel}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {connectedTopics.length > 0 && (
          <div className={styles.connectionsSection}>
            <div className={styles.connectionsHeader}>
              <span>Connected subjects</span>
              <span className="count-pill">{connectedTopics.length}</span>
            </div>
            <ul className={styles.connections}>
              {connectedTopics.map((key) => {
                const n = nodes.get(key);
                return (
                  <li key={key}>
                    <button type="button" onClick={() => setSelected(key)}>
                      <span>{n?.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </aside>
    </section>
  );
}
