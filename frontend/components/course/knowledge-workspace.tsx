"use client";

import { useEffect, useState } from "react";
import { TopicGraph } from "@/app/courses/[courseId]/knowledge/topic-graph";
import { FormattedSourceText } from "@/components/formatted-source";
import {
  apiErrorMessage,
  knowledgeApi,
  questionsApi,
  type KnowledgeGraph,
  type Question,
} from "@/lib/api";

export function KnowledgeWorkspace({
  courseId,
  onGraphChanged,
}: {
  courseId: string;
  onGraphChanged?: (graph: KnowledgeGraph) => void;
}) {
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setGraph(null);
    Promise.all([knowledgeApi.get(courseId), questionsApi.list(courseId)])
      .then(([savedGraph, savedQuestions]) => {
        if (!active) return;
        setGraph(savedGraph);
        setQuestions(savedQuestions);
      })
      .catch((err: unknown) => {
        if (active) setError(apiErrorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [courseId]);

  async function generate(mode: "local" | "openrouter") {
    setGenerating(true);
    setError(null);
    try {
      const updated = await knowledgeApi.generate(courseId, mode);
      setGraph(updated);
      setQuestions(await questionsApi.list(courseId));
      onGraphChanged?.(updated);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setGenerating(false);
    }
  }

  const questionsById = new Map(
    questions.map((question) => [Number(question.id), question])
  );

  return (
    <>
      {graph && (
        <div className="card kg-controls-card">
          <div className="kg-controls-actions">
            <button
              type="button"
              className="btn"
              disabled={generating}
              onClick={() => void generate("local")}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="6" cy="6" r="2.5" />
                <circle cx="18" cy="7" r="2.5" />
                <circle cx="12" cy="18" r="2.5" />
                <path d="M8.2 7.2 15.5 7" />
                <path d="M7.3 8.1 10.7 15.8" />
                <path d="M16.7 9.1 13.3 15.8" />
              </svg>
              <span>Analyze subjects locally</span>
            </button>
            {graph.openrouter_available && (
              <button
                type="button"
                className="btn secondary"
                disabled={generating}
                onClick={() => void generate("openrouter")}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                  <path d="M16 16h5v5" />
                </svg>
                <span>Analyze subjects with OpenRouter</span>
              </button>
            )}
          </div>
          {graph.openrouter_available && (
            <p className="note" style={{ margin: 0 }}>
              Sends selected course excerpts to OpenRouter; may incur a charge.
            </p>
          )}
        </div>
      )}

      {loading && (
        <p role="status" className="loading">
          <span className="spinner" aria-hidden="true" />
          <span>Loading knowledge graph…</span>
        </p>
      )}
      {generating && (
        <p role="status" className="loading">
          <span className="spinner" aria-hidden="true" />
          <span>Generating topics…</span>
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {graph && graph.topics.length > 0 && (
        <TopicGraph key={courseId} topics={graph.topics} questions={questions} />
      )}

      {graph?.topics.length === 0 && !generating && (
        <p className="empty">
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
          <span>
            No sourced topics yet. Add course materials and generate topics.
          </span>
        </p>
      )}

      {graph && graph.topics.length > 0 && (
        <details className="card kg-details">
          <summary className="kg-details-summary">
            <span className="kg-details-summary-left">
              <span>Browse topics as a list</span>
              <span className="count-pill">{graph.topics.length}</span>
            </span>
            <svg
              className="kg-details-chevron"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </summary>

          <div className="kg-details-body">
            {graph.topics.map((topic) => (
              <section key={topic.id} className="card kg-topic-card">
                <div className="section-header" style={{ marginBottom: 4 }}>
                  <h2>{topic.name}</h2>
                  <div className="material-badges">
                    <span className="meta-chip tabular">
                      {topic.sources.length} sources
                    </span>
                    <span className="meta-chip tabular">
                      {topic.question_ids.length} questions
                    </span>
                  </div>
                </div>
                {topic.description && (
                  <p className="kg-topic-desc">{topic.description}</p>
                )}
                {topic.keywords && topic.keywords.length > 0 && (
                  <div className="material-badges" style={{ marginBottom: 10 }}>
                    {topic.keywords.slice(0, 8).map((kw) => (
                      <span key={kw} className="meta-chip">
                        {kw}
                      </span>
                    ))}
                  </div>
                )}

                <h3 className="kg-subsection-title">Exam questions</h3>
                {topic.question_ids.length === 0 ? (
                  <p className="note">No linked exam questions.</p>
                ) : (
                  <ul className="kg-question-list">
                    {topic.question_ids.map((questionId) => {
                      const question = questionsById.get(questionId);
                      return (
                        question && (
                          <li key={questionId} className="kg-question-item">
                            {question.text}
                          </li>
                        )
                      );
                    })}
                  </ul>
                )}

                <h3 className="kg-subsection-title">Sources</h3>
                <ul className="course-list sources-grid">
                  {topic.sources.map((source) => (
                    <li key={source.chunk_id} className="card source-card">
                      <div className="source-card-top">
                        <div className="source-location">
                          <span>{source.file_name}</span>
                          {source.page_number != null && (
                            <span className="meta-chip mono">
                              {source.is_slide ? "slide" : "p."}{" "}
                              {source.page_number}
                            </span>
                          )}
                          {source.start_seconds != null &&
                            source.end_seconds != null && (
                              <span className="timestamp-chip">
                                {source.start_seconds}s–{source.end_seconds}s
                              </span>
                            )}
                        </div>
                      </div>
                      <FormattedSourceText text={source.text} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </details>
      )}
    </>
  );
}
