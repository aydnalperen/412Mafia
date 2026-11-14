"use client";

import { useEffect, useState } from "react";
import {
  apiErrorMessage,
  oralApi,
  questionsApi,
  type OralSession,
  type Question,
} from "@/lib/api";

const MAX_TURNS = 3;

function sessionKey(courseId: string) {
  return `lecturegraph:oral:${courseId}`;
}

export default function OralPage({
  params,
}: {
  params: { courseId: string };
}) {
  const id = params.courseId;
  const [questions, setQuestions] = useState<Question[]>([]);
  const [session, setSession] = useState<OralSession | null>(null);
  const [selected, setSelected] = useState<Question | null>(null);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setSession(null);
    const stored = localStorage.getItem(sessionKey(id));
    Promise.all([questionsApi.list(id), stored ? oralApi.get(stored).catch(() => {
      localStorage.removeItem(sessionKey(id));
      return null;
    }) : Promise.resolve(null)])
      .then(([items, saved]) => {
        if (!active) return;
        setQuestions(items);
        if (saved && String(saved.course_id) === id) setSession(saved);
        else if (saved) localStorage.removeItem(sessionKey(id));
      })
      .catch((err: unknown) => { if (active) setError(err); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  const startExam = async (question: Question) => {
    setError(null);
    setSubmitting(true);
    try {
      const s = await oralApi.start(id, { question_id: Number(question.id) });
      localStorage.setItem(sessionKey(id), String(s.id));
      setSelected(question);
      setSession(s);
      setAnswer("");
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const submitAnswer = async () => {
    if (!session || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const updated = await oralApi.answer(session.id, {
        answer,
        expected_turn: session.turns.length,
      });
      setSession(updated);
      setAnswer("");
      localStorage.setItem(sessionKey(id), String(updated.id));
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const restart = () => {
    localStorage.removeItem(sessionKey(id));
    setSession(null);
    setSelected(null);
    setAnswer("");
    setError(null);
  };

  if (loading && !session) {
    return (
      <main className="page container">
        <div className="page-header">
          <span className="eyebrow">Oral Exam</span>
          <h1>Oral Exam</h1>
        </div>
        <div className="loading">
          <span className="spinner" aria-hidden="true" />
          <span>Loading questions…</span>
        </div>
      </main>
    );
  }

  if (error && !session && questions.length === 0) {
    return (
      <main className="page container">
        <div className="page-nav">
          <a href={`/courses/${id}`} className="btn secondary small">
            Back to course
          </a>
        </div>
        <div className="page-header">
          <span className="eyebrow">Oral Exam</span>
          <h1>Oral Exam</h1>
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

  const isComplete = session?.status === "completed";
  const turnsDone = session?.turns.length ?? 0;
  const currentQuestion =
    session?.current_question ?? selected?.text ?? "";

  if (!session) {
    return (
      <main className="page container">
        <div className="page-nav">
          <a href={`/courses/${id}`} className="btn secondary small">
            Back to course
          </a>
        </div>
        <div className="page-header">
          <span className="eyebrow">Oral Exam</span>
          <h1>Oral Exam</h1>
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
              No exam questions found for this course yet. Upload a past exam on
              the materials page.
            </span>
          </p>
        ) : (
          <>
            <p className="note">
              Pick a past-exam question with saved source matches to begin (up to {MAX_TURNS} turns). Analyze its sources on the Questions page first. Requires backend OpenRouter configuration and may incur a charge per answer. Feedback is formative, not an official grade.
            </p>
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
                      disabled={submitting}
                      onClick={() => void startExam(question)}
                    >
                      Start
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
            {error != null && (
              <p role="alert" className="error">
                {apiErrorMessage(error)}
              </p>
            )}
          </>
        )}
      </main>
    );
  }

  return (
    <main className="page container">
      <div className="page-nav">
        <a href={`/courses/${id}`} className="btn secondary small">
          Back to course
        </a>
        <button type="button" className="btn secondary small" disabled={submitting} onClick={restart}>
          Restart
        </button>
      </div>

      <div className="page-header">
        <span className="eyebrow">Oral Exam</span>
        <div className="section-title-group">
          <h1>
            {isComplete ? "Completed" : `Turn ${turnsDone + 1} of ${MAX_TURNS}`}
          </h1>
          <span className="count-pill">{turnsDone}/{MAX_TURNS}</span>
        </div>
      </div>

      {error != null && (
        <p role="alert" className="error">{apiErrorMessage(error)}</p>
      )}

      {!isComplete && (
        <div className="card question-detail-card">
          <p className="question-detail-text" style={{ whiteSpace: "pre-wrap" }}>{currentQuestion}</p>
        </div>
      )}

      {isComplete && session.report ? (
        <>
          <div className="section-header" style={{ marginBottom: 6 }}>
            <h2>Report</h2>
          </div>
          <div className="card">
            {session.report.strengths.length > 0 && (
              <>
                <h3>Strengths</h3>
                <ul className="course-list" style={{ paddingLeft: 20, margin: 0 }}>
                  {session.report.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </>
            )}
            {session.report.missing_concepts.length > 0 && (
              <>
                <h3>Missing concepts</h3>
                <ul className="course-list" style={{ paddingLeft: 20, margin: 0 }}>
                  {session.report.missing_concepts.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </>
            )}
            {session.report.revision_sources.length > 0 && (
              <>
                <h3>Revision sources</h3>
                <ul className="course-list">
                  {session.report.revision_sources.map((src, i) => (
                    <li className="card source-card" key={i}>
                      <p className="source-excerpt">{src.text}</p>
                      <p className="source-footer">
                        <span>{src.material_title}</span>
                        {src.page_number != null && (
                          <span className="meta-chip mono">
                            p. {src.page_number}
                          </span>
                        )}
                        {src.start_seconds != null &&
                          src.end_seconds != null && (
                            <span className="timestamp-chip">
                              {src.start_seconds}s–{src.end_seconds}s
                            </span>
                          )}
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="oral-answer">Your answer</label>
            <textarea
              id="oral-answer"
              value={answer}
              maxLength={3000}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your spoken answer here…"
            />
          </div>
          <p className="note">
            Answer in your own words. You have {MAX_TURNS - turnsDone} turn(s)
            remaining.
          </p>
          <button
            type="button"
            className="btn full"
            disabled={submitting || answer.trim() === "" || isComplete}
            onClick={submitAnswer}
          >
            {submitting ? "Submitting…" : "Submit answer"}
          </button>
        </>
      )}
      {turnsDone > 0 && (
            <ul className="course-list">
              {session.turns.map((t, i) => (
                <li className="card" key={i} style={{ padding: 14, marginBottom: 10 }}>
                  <p className="question-detail-text" style={{ margin: "0 0 8px 0", fontSize: 13.5 }}>
                    Q{i + 1}: {t.question}
                  </p>
                  <p style={{ margin: "0 0 8px 0", fontSize: 13.5, color: "#334155" }}>
                    Your answer: {t.answer}
                  </p>
                  {t.feedback && (
                    <>
                      <p style={{ margin: "0 0 4px 0", fontSize: 13, fontWeight: 600, color: "#0f766e" }}>
                        Feedback — accuracy {t.feedback.accuracy}, completeness {t.feedback.completeness}
                      </p>
                      {t.feedback.correct_points.length > 0 && (
                        <p style={{ margin: 0, fontSize: 13, color: "#065f46" }}>
                          Correct: {t.feedback.correct_points.join("; ")}
                        </p>
                      )}
                      {t.feedback.missing_points.length > 0 && (
                        <p style={{ margin: 0, fontSize: 13, color: "#92400e" }}>
                          Missing: {t.feedback.missing_points.join("; ")}
                        </p>
                      )}
                      {t.feedback.source_chunk_ids.length > 0 && (
                        <p className="course-meta">
                          Sources: {t.feedback.source_chunk_ids.map((chunkId) => {
                            const source = session.sources.find((item) => item.chunk_id === chunkId);
                            return source ? `${source.material_title}${source.page_number != null ? ` p. ${source.page_number}` : ""}${source.start_seconds != null ? ` ${source.start_seconds}s` : ""} (chunk ${chunkId})` : `chunk ${chunkId}`;
                          }).join("; ")}
                        </p>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
      )}
    </main>
  );
}
