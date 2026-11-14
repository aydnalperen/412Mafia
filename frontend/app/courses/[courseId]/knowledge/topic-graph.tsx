"use client";

import { useMemo, useState } from "react";
import type { KnowledgeGraph, Question } from "@/lib/api";
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
      nodes.set(to, { kind: "question", label: question?.text || `Question ${id}` });
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
      const radius = ring ? 230 - (index % 2) * 24 : group.length > 1 ? 132 : 0;
      positions.set(key, { x: 410 + Math.cos(angle) * radius * 1.25, y: 267 + Math.sin(angle) * radius });
    });
  });
  return { nodes, positions, edges };
}

export function TopicGraph({ topics, questions }: { topics: Topic[]; questions: Question[] }) {
  const { nodes, positions, edges } = useMemo(
    () => layout(topics, new Map(questions.map((question) => [Number(question.id), question]))),
    [topics, questions],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
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

  return (
    <section className={styles.workspace} aria-label="Interactive knowledge graph">
      <div className={styles.graph}>
        <div className={styles.toolbar}>
          <div className={styles.legend}>
            <span className={styles.topic}>Topic</span>
            <span className={styles.source}>Source</span>
            <span className={styles.question}>Exam question</span>
          </div>
          <div className={styles.zoom}>
            <button type="button" aria-label="Zoom out" disabled={zoom <= 100} onClick={() => setZoom(zoom - 25)}>−</button>
            <button type="button" aria-label="Reset zoom" onClick={() => setZoom(100)}>{zoom}%</button>
            <button type="button" aria-label="Zoom in" disabled={zoom >= 200} onClick={() => setZoom(zoom + 25)}>+</button>
          </div>
        </div>
        <div className={styles.viewport}>
          <svg viewBox="0 0 820 534" width={`${zoom}%`} aria-label="Topics and their linked sources and questions">
            <g aria-hidden="true" className={spotlight ? styles.quietEdges : undefined}>
              {edges.map(({ from, to }) => {
                const start = positions.get(from)!;
                const end = positions.get(to)!;
                const highlighted = spotlight === from || spotlight === to;
                const midX = (start.x + end.x) / 2 + (end.y - start.y) * 0.13;
                const midY = (start.y + end.y) / 2;
                const path = `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`;
                return (
                  <g key={`${from}:${to}`} className={highlighted ? styles.highlight : styles.edge}>
                    <path d={path} />
                    {highlighted && <path d={path} className={styles.flow} />}
                  </g>
                );
              })}
            </g>
            {Array.from(nodes).map(([key, node]) => {
              const { x, y } = positions.get(key)!;
              return (
                <g key={key} transform={`translate(${x},${y})`} role="button" tabIndex={0}
                  aria-label={`${node.kind}: ${node.label}`} aria-pressed={active === key}
                  className={`${styles.node} ${styles[node.kind]} ${spotlight && spotlight !== key && !neighbors.has(key) ? styles.dimmed : ""}`}
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
                  <circle r={node.kind === "topic" ? 16 : 10} fill="transparent" />
                  <circle className={styles.halo} r={node.kind === "topic" ? 16 : 11} />
                  <circle className={styles.dot} r={node.kind === "topic" ? 9 : 5} />
                  {(node.kind === "topic" || spotlight === key) && <text y={24} textAnchor="middle">{node.label.length > 26 ? `${node.label.slice(0, 25)}…` : node.label}</text>}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      <aside className={styles.detail} aria-label="Node details">
        {!detail && <p className="note">Hover to trace connections. Select a node to read its details.</p>}
        {detail?.kind === "topic" && <><h2>{detail.label}</h2>{detail.topic.description && <p>{detail.topic.description}</p>}</>}
        {detail?.kind === "source" && (
          <>
            <h2>{detail.label}</h2>
            <p className="note">
              {detail.source.page_number != null && `${detail.source.is_slide ? "Slide" : "Page"} ${detail.source.page_number} `}
              {detail.source.start_seconds != null && detail.source.end_seconds != null &&
                `${detail.source.start_seconds}s–${detail.source.end_seconds}s`}
            </p>
            <p className={styles.excerpt}>{detail.source.text}</p>
          </>
        )}
        {detail?.kind === "question" && <><h2>Exam question</h2><p className={styles.excerpt}>{detail.label}</p></>}
        {connections.length > 0 && (
          <ul className={styles.connections}>
            {connections.map((key) => (
              <li key={key}><button type="button" onClick={() => setSelected(key)}>{nodes.get(key)?.label}</button></li>
            ))}
          </ul>
        )}
      </aside>
    </section>
  );
}
