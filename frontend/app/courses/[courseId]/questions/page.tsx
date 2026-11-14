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
      <main className="page">
        <h1>Exam questions</h1>
        <div className="loading">Loading questions…</div>
      </main>
    );
  }

  if (error && !selected) {
    return (
      <main className="page">
        <h1>Exam questions</h1>
        <div className="error">
          Failed to load questions:{" "}
          {error instanceof Error ? error.message : String(error)}
        </div>
      </main>
    );
  }

  if (selected) {
    return (
      <main className="page container">
        <button
          type="button"
          className="btn secondary small"
          onClick={() => {
            setSelected(null);
            setSources(null);
          }}
        >
          Back to questions
        </button>
        <h1>Question {selected.question_number}</h1>
        <div className="card">
          <p>{selected.text}</p>
          <p className="course-meta">
            From {selected.material_title}
            {selected.page_number != null ? `, p. ${selected.page_number}` : ""}
          </p>
        </div>
        <h2>Candidate sources</h2>
        <p className="note">Keyword matches only; check the cited passage before relying on it.</p>
        {error != null && <p role="alert" className="error">Failed to load sources: {apiErrorMessage(error)}</p>}
        {sourceLoading ? (
          <div className="loading">Loading sources…</div>
        ) : !!error ? null : sources === null || sources.length === 0 ? (
          <p className="empty">No reliable match found.</p>
        ) : (
          <ul className="course-list">
            {sources.map((source) => (
              <li className="card" key={source.chunk_id}>
                <p>{source.text}</p>
                <p className="course-meta">
                  {source.material_title} ({source.material_kind})
                  {source.page_number != null ? ` · p. ${source.page_number}` : ""}
                  {source.start_seconds != null && source.end_seconds != null
                    ? ` · ${source.start_seconds}s–${source.end_seconds}s`
                    : ""}
                </p>
                <p className="note">
                  score {source.score} · {source.reason} · {source.method}
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
      <a href={`/courses/${id}/materials`} className="btn secondary small">
        Back to materials
      </a>
      <h1>Exam questions</h1>
      {questions.length === 0 ? (
        <p className="empty">
          No exam questions found for this course yet. Upload a past exam on
          the{" "}
          <a href={`/courses/${id}/materials`}>materials</a> page.
        </p>
      ) : (
        <ul className="course-list">
          {questions.map((question) => (
            <li className="course-item" key={question.id}>
              <div>
                <strong>
                  Question {question.question_number}
                </strong>{" "}
                {question.page_number != null ? `, p. ${question.page_number}` : ""}
                <p className="note">{question.text}</p>
                <p className="course-meta">{question.material_title}</p>
              </div>
              <button
                type="button"
                className="btn small secondary"
                onClick={() => void selectQuestion(question)}
              >
                Open
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
