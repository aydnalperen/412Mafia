"use client";

import { useCallback, useEffect, useState } from "react";
import {
  apiErrorMessage,
  questionsApi,
  type Question,
  type QuestionSource,
} from "@/lib/api";

export default function QuestionsPage({
  params,
}: {
  params: { courseId: string };
}) {
  const id = params.courseId;
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selected, setSelected] = useState<Question | null>(null);
  const [sources, setSources] = useState<QuestionSource[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setQuestions(await questionsApi.list(id));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectQuestion = async (question: Question) => {
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
  };

  if (loading) {
    return (
      <main className="page container">
        <div className="page-header">
          <span className="eyebrow">Question Traceability</span>
          <h1>Exam questions</h1>
        </div>
        <div className="loading">
          <span className="spinner" aria-hidden="true" />
          <span>Loading questions…</span>
        </div>
      </main>
    );
  }

  if (error && !selected) {
    return (
      <main className="page container">
        <div className="page-nav">
          <a href={`/courses/${id}/materials`} className="btn secondary small">
            Back to materials
          </a>
        </div>
        <div className="page-header">
          <span className="eyebrow">Question Traceability</span>
          <h1>Exam questions</h1>
        </div>
        <div className="error" role="alert">
          <span>
            Failed to load questions:{" "}
            {error instanceof Error ? error.message : String(error)}
          </span>
        </div>
      </main>
    );
  }

  if (selected) {
    return (
      <main className="page container">
        <div className="page-nav">
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
            <span>Back to questions</span>
          </button>
        </div>

        <div className="page-header" style={{ marginBottom: 12 }}>
          <span className="eyebrow">Selected Question</span>
          <h1 className="tabular">Question {selected.question_number}</h1>
        </div>

        <div className="card question-detail-card">
          <p className="question-detail-text">{selected.text}</p>
          <p className="course-meta" style={{ marginTop: 14 }}>
            <span className="meta-chip">
              From {selected.material_title}
              {selected.page_number != null ? `, p. ${selected.page_number}` : ""}
            </span>
          </p>
        </div>

        <div className="section-header" style={{ marginBottom: 6 }}>
          <div className="section-title-group">
            <h2>Candidate sources</h2>
            {sources !== null && !sourceLoading && !error && (
              <span className="count-pill">{sources.length}</span>
            )}
          </div>
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
            Candidates use keyword matching; when configured, OpenRouter ranks them. Scores are heuristics, not verified probabilities. Check the cited passage before relying on it.
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
        ) : !!error ? null : sources === null || sources.length === 0 ? (
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

                <p className="source-excerpt">{source.text}</p>

                <p className="source-footer">
                  <span>{source.reason}</span>
                  <span aria-hidden="true">·</span>
                  <span className="badge teal-badge">{source.method}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>
    );
  }

  return (
    <main className="page container">
      <div className="page-nav">
        <a href={`/courses/${id}/materials`} className="btn secondary small">
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
          <span>Back to materials</span>
        </a>
      </div>

      <div className="page-header">
        <span className="eyebrow">Question Traceability</span>
        <div className="section-title-group">
          <h1>Exam questions</h1>
          <span className="count-pill">{questions.length}</span>
        </div>
      </div>

      {questions.length === 0 ? (
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
            No exam questions found for this course yet. Upload a past exam on the{" "}
            <a href={`/courses/${id}/materials`} className="link">
              materials
            </a>{" "}
            page.
          </span>
        </p>
      ) : (
        <ul className="course-list">
          {questions.map((question) => (
            <li className="course-item" key={question.id}>
              <div className="course-item-main">
                <div className="material-title-row">
                  <span className="question-num-badge tabular">
                    Question {question.question_number}
                  </span>
                  {question.page_number != null && (
                    <span className="meta-chip mono">
                      p. {question.page_number}
                    </span>
                  )}
                </div>
                <p className="question-preview">{question.text}</p>
                <p className="course-meta">{question.material_title}</p>
              </div>
              <div className="actions">
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
          ))}
        </ul>
      )}
    </main>
  );
}
