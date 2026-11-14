"use client";

import { useMemo, useRef, useState } from "react";
import { FormattedSourceText } from "@/components/formatted-source";
import type { KnowledgeGraph, Question } from "@/lib/api";
import { splitQuestionTitleAndBody } from "@/lib/format";
import styles from "./topic-graph.module.css";

type Topic = KnowledgeGraph["topics"][number];
type Source = Topic["sources"][number];
type Node =
  | { kind: "topic"; label: string; topic: Topic }
  | { kind: "source"; label: string; source: Source }
  | { kind: "question"; label: string };

function layout(topics: Topic[], questions: Map<number, Question>) {
  const nodes = new Map<string, Node>();
  const edges: { from: string; to: string }[] = [];
  for (const topic of topics) {
    const from = `topic-${topic.id}`;
    nodes.set(from, { kind: "topic", label: topic.name, topic });
    for (const source of topic.sources) {
      const to = `source-${source.chunk_id}`;
      nodes.set(to, { kind: "source", label: source.file_name, source });
      edges.push({ from, to });
    }
    for (const id of topic.question_ids) {
      const to = `question-${id}`;
      const question = questions.get(id);
      nodes.set(to, {
        kind: "question",
        label: question?.text || `Question ${id}`,
      });
      edges.push({ from, to });
    }
  }
  const positions = new Map<string, { x: number; y: number }>();
  const groups = [
    Array.from(nodes).filter(([, node]) => node.kind === "topic"),
    Array.from(nodes).filter(([, node]) => node.kind !== "topic"),
  ];
  groups.forEach((group, ring) => {
    group.forEach(([key], index) => {
      const angle = (index / group.length) * 2 * Math.PI - Math.PI / 2;
      const radius = ring
        ? 268 - (index % 2) * 36
        : group.length > 1
          ? Math.min(176, 128 + group.length * 6)
          : 0;
      const xScale = ring ? 1.46 : 1.28;
      const yScale = ring ? 0.96 : 0.92;
      positions.set(key, {
        x: 490 + Math.cos(angle) * radius * xScale,
        y: 320 + Math.sin(angle) * radius * yScale,
      });
    });
  });
  return { nodes, positions, edges };
}

export function TopicGraph({
  topics,
  questions,
}: {
  topics: Topic[];
  questions: Question[];
}) {
  const { nodes, positions, edges } = useMemo(
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

  const scale = zoom / 100;
  const viewWidth = 980 / scale;
  const viewHeight = 640 / scale;
  const maxPanX = Math.max(0, (980 - viewWidth) / 2);
  const maxPanY = Math.max(0, (640 - viewHeight) / 2);
  const clampedPanX = Math.max(-maxPanX, Math.min(maxPanX, pan.x));
  const clampedPanY = Math.max(-maxPanY, Math.min(maxPanY, pan.y));
  const viewX = 490 - viewWidth / 2 - clampedPanX;
  const viewY = 320 - viewHeight / 2 - clampedPanY;

  function applyZoom(nextZoom: number) {
    const clampedZoom = Math.max(100, Math.min(200, nextZoom));
    setZoom(clampedZoom);
    if (clampedZoom <= 100) {
      setPan({ x: 0, y: 0 });
    } else {
      const nextWidth = 980 / (clampedZoom / 100);
      const nextHeight = 640 / (clampedZoom / 100);
      const boundX = (980 - nextWidth) / 2;
      const boundY = (640 - nextHeight) / 2;
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
            <span className={styles.topic}>Topic</span>
            <span className={styles.source}>Source</span>
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
            const dy = ((event.clientY - origin.clientY) / origin.rectHeight) * viewHeight;
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
            viewBox={`${viewX} ${viewY} ${viewWidth} ${viewHeight}`}
            width="100%"
            aria-label="Topics and their linked sources and questions"
          >
            <g
              aria-hidden="true"
              className={spotlight ? styles.quietEdges : undefined}
            >
              {edges.map(({ from, to }) => {
                const start = positions.get(from)!;
                const end = positions.get(to)!;
                const highlighted = spotlight === from || spotlight === to;
                const midX = (start.x + end.x) / 2 + (end.y - start.y) * 0.13;
                const midY = (start.y + end.y) / 2;
                const path = `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`;
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
              return (
                <g
                  key={key}
                  transform={`translate(${x},${y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${node.kind}: ${node.label}`}
                  aria-pressed={active === key}
                  className={`${styles.node} ${styles[node.kind]} ${spotlight && spotlight !== key && !neighbors.has(key) ? styles.dimmed : ""}`}
                  data-spotlight={spotlight === key}
                  data-neighbor={neighbors.has(key)}
                  onPointerEnter={(event) => {
                    if (event.pointerType !== "touch") setHovered(key);
                  }}
                  onPointerLeave={() => setHovered(null)}
                  onFocus={(event) => {
                    if (event.currentTarget.matches(":focus-visible"))
                      setFocused(key);
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
                  <circle r={node.kind === "topic" ? 18 : 12} fill="transparent" />
                  <circle
                    className={styles.halo}
                    r={node.kind === "topic" ? 18 : 12}
                  />
                  <circle
                    className={styles.dot}
                    r={node.kind === "topic" ? 9.5 : 6}
                  />
                  {(node.kind === "topic" || spotlight === key) && (
                    <text y={26} textAnchor="middle">
                      {node.label.length > 26
                        ? `${node.label.slice(0, 25)}…`
                        : node.label}
                    </text>
                  )}
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
              Hover to trace connections. Select a node to read its details.
            </p>
          </div>
        )}

        {detail && (
          <div className={styles.detailHeader}>
            <span className={`${styles.detailKind} ${styles[detail.kind]}`}>
              {detail.kind}
            </span>
          </div>
        )}

        {detail?.kind === "topic" && (
          <>
            <h2>{detail.label}</h2>
            {detail.topic.description && (
              <p className={styles.detailBody}>{detail.topic.description}</p>
            )}
          </>
        )}

        {detail?.kind === "source" && (
          <>
            <h2>{detail.label}</h2>
            <p className="note" style={{ marginBottom: 12 }}>
              {detail.source.page_number != null &&
                `${detail.source.is_slide ? "Slide" : "Page"} ${detail.source.page_number} `}
              {detail.source.start_seconds != null &&
                detail.source.end_seconds != null &&
                `${detail.source.start_seconds}s–${detail.source.end_seconds}s`}
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
              <h2>{parsedQuestion.title || "Exam question"}</h2>
              <p className={styles.excerpt}>{parsedQuestion.body}</p>
            </>
          );
        })()}

        {connections.length > 0 && (
          <div className={styles.connectionsSection}>
            <div className={styles.connectionsHeader}>
              <span>Connected nodes</span>
              <span className="count-pill">{connections.length}</span>
            </div>
            <ul className={styles.connections}>
              {connections.map((key) => (
                <li key={key}>
                  <button type="button" onClick={() => setSelected(key)}>
                    <span>{nodes.get(key)?.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </section>
  );
}
