"use client";

import { useCallback, useEffect, useState } from "react";
import { FormattedSourceText } from "@/components/formatted-source";
import {
  apiErrorMessage,
  questionsApi,
  type Question,
  type QuestionSource,
} from "@/lib/api";
import { splitQuestionTitleAndBody } from "@/lib/format";

export function QuestionsWorkspace({
  courseId,
  initialQuestionId,
  onStartOralExam,
  onOpenMaterials,
}: {
  courseId: string;
  initialQuestionId?: string | number | null;
  onStartOralExam?: (question: Question) => void;
  onOpenMaterials?: () => void;
}) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selected, setSelected] = useState<Question | null>(null);
  const [sources, setSources] = useState<QuestionSource[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const selectQuestion = useCallback(async (question: Question) => {
    setSelected(question);
    setSources(null);
    setSourceLoading(true);
    setError(null);
    try {
      setSources(await questionsApi.sources(question.id));
    } catch (err) {
      setError(err);
    } finally {
      setSourceLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await questionsApi.list(courseId);
      setQuestions(items);
      if (initialQuestionId != null) {
        const match = items.find(
          (entry) => String(entry.id) === String(initialQuestionId)
        );
        if (match) {
          void selectQuestion(match);
        }
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [courseId, initialQuestionId, selectQuestion]);

  useEffect(() => {
    void load();
  }, [load]);

  const analyzeSources = async () => {
    if (!selected || sourceLoading) return;
    setSourceLoading(true);
    setError(null);
    try {
      setSources(await questionsApi.analyzeSources(selected.id));
    } catch (err) {
      setError(err);
    } finally {
      setSourceLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <span className="spinner" aria-hidden="true" />
        <span>Loading questions…</span>
      </div>
    );
  }

  if (error && !selected) {
    return (
      <div className="error" role="alert">
        <span>
          Failed to load questions:{" "}
          {error instanceof Error ? error.message : String(error)}
        </span>
      </div>
    );
  }

  if (selected) {
    const parsedSelected = splitQuestionTitleAndBody(selected.text);
    return (
      <>
        <div className="page-nav" style={{ marginBottom: 16 }}>
          <button
            type="button"
            className="btn secondary small"
            onClick={() => {
              setSelected(null);
              setSources(null);
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span>Back to all questions</span>
          </button>

          {onStartOralExam ? (
            <button
              type="button"
              className="btn secondary small"
              onClick={() => onStartOralExam(selected)}
            >
              <span>Practice in Oral exam</span>
            </button>
          ) : (
            <a href={`/courses/${courseId}/oral`} className="btn secondary small">
              <span>Practice in Oral exam</span>
            </a>
          )}
        </div>

        <div className="question-workspace">
          <section className="question-pane-sticky" aria-label="Selected question">
            <div className="page-header" style={{ marginBottom: 14 }}>
              <span className="eyebrow">Selected Question</span>
              <h2 className="tabular" style={{ fontSize: "1.45rem" }}>
                Question {selected.question_number}
              </h2>
            </div>

            <div className="card question-detail-card">
              {parsedSelected.title && (
                <h3 className="question-detail-title">{parsedSelected.title}</h3>
              )}
              <p className="question-detail-text">{parsedSelected.body}</p>
              <p className="course-meta" style={{ marginTop: 16 }}>
                <span className="meta-chip">
                  From {selected.material_title}
                  {selected.page_number != null
                    ? `, p. ${selected.page_number}`
                    : ""}
                </span>
              </p>
            </div>
          </section>

          <section aria-label="Candidate sources">
            <div className="section-header" style={{ marginBottom: 12 }}>
              <div className="section-title-group">
                <h2>Candidate sources</h2>
                {sources !== null && !sourceLoading && !error && (
                  <span className="count-pill">{sources.length}</span>
                )}
              </div>
              <button
                type="button"
                className="btn small"
                disabled={sourceLoading}
                onClick={() => void analyzeSources()}
              >
                <svg
                  width="14"
                  height="14"
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
                <span>
                  {sources === null ? "Analyze sources" : "Re-analyze sources"}
                </span>
              </button>
            </div>

            <div className="callout-info">
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
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
              <p className="note" style={{ margin: 0 }}>
                This button re-runs keyword matching and, when configured,
                OpenRouter ranking. It may send question and course excerpts to
                OpenRouter and incur a charge. Scores are heuristics; check the
                cited passage.
              </p>
            </div>

            {error != null && (
              <p role="alert" className="error">
                Failed to load sources: {apiErrorMessage(error)}
              </p>
            )}

            {sourceLoading ? (
              <div className="loading">
                <span className="spinner" aria-hidden="true" />
                <span>Loading sources…</span>
              </div>
            ) : !!error ? null : sources === null ? (
              <p className="empty">
                No saved matches. Select Analyze sources to run matching again.
              </p>
            ) : sources.length === 0 ? (
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
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                </span>
                <span>No reliable match found.</span>
              </p>
            ) : (
              <ul className="course-list">
                {sources.map((source) => (
                  <li className="card source-card" key={source.chunk_id}>
                    <div className="source-card-top">
                      <div className="source-location">
                        <span>{source.material_title}</span>
                        <span className="badge kind-badge">
                          {source.material_kind}
                        </span>
                        {source.page_number != null && (
                          <span className="meta-chip mono">
                            p. {source.page_number}
                          </span>
                        )}
                        {source.start_seconds != null &&
                          source.end_seconds != null && (
                            <span className="timestamp-chip">
                              {source.start_seconds}s–{source.end_seconds}s
                            </span>
                          )}
                      </div>
                      <span className="score-pill">score {source.score}</span>
                    </div>

                    <FormattedSourceText text={source.text} />

                    <p className="source-footer">
                      <span>{source.reason}</span>
                      <span aria-hidden="true">·</span>
                      <span className="badge teal-badge">{source.method}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </>
    );
  }

  return questions.length === 0 ? (
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
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <path d="M12 17h.01" />
        </svg>
      </span>
      <span>
        No exam questions found for this course yet. Upload a past exam on{" "}
        {onOpenMaterials ? (
          <button
            type="button"
            className="link"
            style={{ background: "none", border: "none", padding: 0 }}
            onClick={onOpenMaterials}
          >
            Materials
          </button>
        ) : (
          <a href={`/courses/${courseId}/materials`} className="link">
            materials
          </a>
        )}
        .
      </span>
    </p>
  ) : (
    <ul className="course-list questions-cards-grid">
      {questions.map((question) => {
        const parsed = splitQuestionTitleAndBody(question.text);
        return (
          <li className="question-item-card" key={question.id}>
            <div className="course-item-main">
              <div className="question-item-header">
                <span className="question-num-badge tabular">
                  Question {question.question_number}
                </span>
                {question.page_number != null && (
                  <span className="meta-chip mono">
                    p. {question.page_number}
                  </span>
                )}
              </div>
              {parsed.title && (
                <h3 className="question-preview-title">{parsed.title}</h3>
              )}
              <p className="question-preview-body">{parsed.body}</p>
            </div>
            <div className="question-item-footer">
              <span className="course-meta" style={{ marginTop: 0 }}>
                {question.material_title}
              </span>
              <button
                type="button"
                className="btn small secondary"
                onClick={() => void selectQuestion(question)}
              >
                <span>Open</span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
