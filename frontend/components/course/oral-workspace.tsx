"use client";

import { useEffect, useState } from "react";
import { FormattedSourceText } from "@/components/formatted-source";
import {
  apiErrorMessage,
  oralApi,
  professorApi,
  questionsApi,
  type OralSession,
  type OralSessionSummary,
  type ProfessorFeedbackItem,
  type Question,
} from "@/lib/api";
import {
  formatTimestampRange,
  splitQuestionTitleAndBody,
} from "@/lib/format";

const MAX_TURNS = 3;

function sessionKey(courseId: string) {
  return `lecturegraph:oral:${courseId}`;
}

export function OralWorkspace({
  courseId,
  onOpenQuestions,
  onOpenMaterials,
  onPracticeMissedConcepts,
}: {
  courseId: string;
  onOpenQuestions?: (questionId?: string | number) => void;
  onOpenMaterials?: () => void;
  onPracticeMissedConcepts?: (sessionId: string | number) => void;
}) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [session, setSession] = useState<OralSession | null>(null);
  const [selected, setSelected] = useState<Question | null>(null);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [startingQuestionId, setStartingQuestionId] = useState<
    string | number | null
  >(null);
  const [analyzingQuestionId, setAnalyzingQuestionId] = useState<
    string | number | null
  >(null);
  const [sourceCounts, setSourceCounts] = useState<
    Record<string | number, number>
  >({});
  const [recentSessions, setRecentSessions] = useState<OralSessionSummary[]>(
    []
  );
  const [feedbackNotes, setFeedbackNotes] = useState<ProfessorFeedbackItem[]>(
    []
  );
  const [needsAnalysisQuestion, setNeedsAnalysisQuestion] =
    useState<Question | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setSession(null);
    setNeedsAnalysisQuestion(null);
    const stored = localStorage.getItem(sessionKey(courseId));
    Promise.all([
      questionsApi.list(courseId),
      stored
        ? oralApi.get(stored).catch(() => {
            localStorage.removeItem(sessionKey(courseId));
            return null;
          })
        : Promise.resolve(null),
      oralApi.list(courseId).catch(() => [] as OralSessionSummary[]),
      professorApi.listFeedback(courseId).catch(() => [] as ProfessorFeedbackItem[]),
    ])
      .then(([items, saved, history, notes]) => {
        if (!active) return;
        setQuestions(items);
        setRecentSessions(history);
        setFeedbackNotes(notes);
        if (saved && String(saved.course_id) === courseId) setSession(saved);
        else if (saved) localStorage.removeItem(sessionKey(courseId));
        if (items.length > 0) {
          Promise.all(
            items.map((item) =>
              questionsApi
                .sources(item.id)
                .then((links) => [item.id, links.length] as const)
                .catch(() => [item.id, null] as const)
            )
          ).then((pairs) => {
            if (!active) return;
            const next: Record<string | number, number> = {};
            for (const [id, count] of pairs) {
              if (count != null) next[id] = count;
            }
            setSourceCounts(next);
          });
        }
      })
      .catch((err: unknown) => {
        if (active) setError(err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [courseId]);

  const openExistingSession = async (sessionId: number) => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const loaded = await oralApi.get(sessionId);
      localStorage.setItem(sessionKey(courseId), String(loaded.id));
      const matched =
        questions.find((q) => Number(q.id) === Number(loaded.question_id)) ?? null;
      setSelected(matched);
      setSession(loaded);
      setAnswer("");
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const beginOralSession = async (question: Question) => {
    const s = await oralApi.start(courseId, {
      question_id: Number(question.id),
    });
    localStorage.setItem(sessionKey(courseId), String(s.id));
    setSelected(question);
    setSession(s);
    setAnswer("");
    setNeedsAnalysisQuestion(null);
  };

  const startExam = async (question: Question) => {
    if (submitting) return;
    setError(null);
    setNeedsAnalysisQuestion(null);
    setSubmitting(true);
    setStartingQuestionId(question.id);
    try {
      await beginOralSession(question);
    } catch (err) {
      const msg = apiErrorMessage(err);
      if (
        msg.toLowerCase().includes("analyze sources for this question first")
      ) {
        setNeedsAnalysisQuestion(question);
        setSourceCounts((prev) => ({ ...prev, [question.id]: 0 }));
      }
      setError(err);
    } finally {
      setSubmitting(false);
      setStartingQuestionId(null);
    }
  };

  const analyzeAndStart = async (question: Question) => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    setAnalyzingQuestionId(question.id);
    setStartingQuestionId(question.id);
    try {
      const links = await questionsApi.analyzeSources(question.id);
      setSourceCounts((prev) => ({ ...prev, [question.id]: links.length }));
      if (links.length === 0) {
        setNeedsAnalysisQuestion(question);
        setError(
          "No reliable lecture transcript or slide evidence matched this question yet. Upload matching course materials or inspect matches on Exam questions."
        );
        return;
      }
      await beginOralSession(question);
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
      setAnalyzingQuestionId(null);
      setStartingQuestionId(null);
    }
  };

  const submitAnswer = async () => {
    if (!session || submitting || answer.trim() === "") return;
    setError(null);
    setSubmitting(true);
    try {
      const updated = await oralApi.answer(session.id, {
        answer,
        expected_turn: session.turns.length,
      });
      setSession(updated);
      setAnswer("");
      localStorage.setItem(sessionKey(courseId), String(updated.id));
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const restart = () => {
    localStorage.removeItem(sessionKey(courseId));
    setSession(null);
    setSelected(null);
    setAnswer("");
    setError(null);
  };

  if (loading && !session) {
    return (
      <div className="loading">
        <span className="spinner" aria-hidden="true" />
        <span>Loading oral exam questions…</span>
      </div>
    );
  }

  if (error && !session && questions.length === 0) {
    return (
      <div className="error" role="alert">
        <span>
          Failed to load questions:{" "}
          {error instanceof Error ? error.message : String(error)}
        </span>
      </div>
    );
  }

  const isComplete = session?.status === "completed";
  const turnsDone = session?.turns.length ?? 0;
  const currentQuestion = session?.current_question ?? selected?.text ?? "";
  const parsedCurrentQuestion = splitQuestionTitleAndBody(currentQuestion);

  if (!session) {
    return (
      <>
        {error != null && (
          <div role="alert" className="error" style={{ display: "grid", gap: "10px" }}>
            <p style={{ margin: 0 }}>{apiErrorMessage(error)}</p>
            {needsAnalysisQuestion && (
              <div className="actions" style={{ marginTop: 0 }}>
                <button
                  type="button"
                  className="btn small"
                  disabled={submitting}
                  onClick={() => void analyzeAndStart(needsAnalysisQuestion)}
                >
                  {analyzingQuestionId === needsAnalysisQuestion.id
                    ? "Analyzing sources…"
                    : `Analyze sources & start Q${needsAnalysisQuestion.question_number}`}
                </button>
                {onOpenQuestions && (
                  <button
                    type="button"
                    className="btn small secondary"
                    disabled={submitting}
                    onClick={() => onOpenQuestions(needsAnalysisQuestion.id)}
                  >
                    Inspect in Exam questions
                  </button>
                )}
              </div>
            )}
          </div>
        )}

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
          <>
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
                Pick a past-exam question to begin a bounded oral practice session (up to {MAX_TURNS} turns). Questions without saved lecture evidence can be analyzed in one click right here or reviewed on{" "}
                {onOpenQuestions ? (
                  <button
                    type="button"
                    className="link"
                    style={{ background: "none", border: "none", padding: 0 }}
                    onClick={() => onOpenQuestions()}
                  >
                    Exam questions
                  </button>
                ) : (
                  <a href={`/courses/${courseId}/questions`} className="link">
                    Exam questions
                  </a>
                )}
                . Requires backend OpenRouter configuration; feedback is formative, not an official grade.
              </p>
            </div>

            <ul className="course-list questions-cards-grid">
              {questions.map((question) => {
                const parsed = splitQuestionTitleAndBody(question.text);
                const isStarting = startingQuestionId === question.id;
                const isAnalyzing = analyzingQuestionId === question.id;
                const savedCount = sourceCounts[question.id];
                const needsAnalysis = savedCount === 0;

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
                        {savedCount !== undefined && (
                          <span
                            className={`badge ${savedCount > 0 ? "status-ready" : "status-active"}`}
                            style={{ marginLeft: "auto", textTransform: "none" }}
                          >
                            <span className="badge-dot" aria-hidden="true" />
                            <span>
                              {savedCount > 0
                                ? `${savedCount} source${savedCount === 1 ? "" : "s"} saved`
                                : "Needs source analysis"}
                            </span>
                          </span>
                        )}
                      </div>
                      {parsed.title && (
                        <h3 className="question-preview-title">
                          {parsed.title}
                        </h3>
                      )}
                      <p className="question-preview-body">{parsed.body}</p>
                    </div>
                    <div className="question-item-footer">
                      <span className="course-meta" style={{ marginTop: 0 }}>
                        {question.material_title}
                      </span>
                      <div className="actions">
                        {onOpenQuestions && (
                          <button
                            type="button"
                            className="btn small secondary"
                            disabled={submitting}
                            onClick={() => onOpenQuestions(question.id)}
                          >
                            Sources
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn small"
                          disabled={submitting}
                          onClick={() =>
                            void (needsAnalysis
                              ? analyzeAndStart(question)
                              : startExam(question))
                          }
                        >
                          <span>
                            {isAnalyzing
                              ? "Analyzing sources…"
                              : isStarting
                                ? "Starting…"
                                : needsAnalysis
                                  ? "Analyze sources & start"
                                  : "Start oral exam"}
                          </span>
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
                    </div>
                  </li>
                );
              })}
            </ul>

            {recentSessions.length > 0 && (
              <section className="card" style={{ marginTop: 22 }} aria-label="Previous oral sessions">
                <div className="section-header" style={{ marginBottom: 12 }}>
                  <div className="section-title-group">
                    <h2>Saved oral sessions</h2>
                    <span className="count-pill">{recentSessions.length}</span>
                  </div>
                </div>
                <ul className="overview-list">
                  {recentSessions.slice(0, 6).map((item) => (
                    <li key={item.id} className="overview-list-item">
                      <div className="overview-list-main">
                        <div className="question-item-header">
                          <span className="question-num-badge tabular">
                            Q{item.question_number}
                          </span>
                          <span
                            className={`badge ${
                              item.status === "completed" ? "status-ready" : "status-active"
                            }`}
                          >
                            <span className="badge-dot" aria-hidden="true" />
                            {item.status}
                          </span>
                          <span className="meta-chip tabular">
                            {item.turns_count}/{MAX_TURNS} turns
                          </span>
                          {item.avg_accuracy !== null && (
                            <span className="score-pill">
                              avg {item.avg_accuracy}/5 acc · {item.avg_completeness}/5 comp
                            </span>
                          )}
                        </div>
                        <div className="overview-list-title">
                          {item.question_text.length > 130
                            ? `${item.question_text.slice(0, 130)}…`
                            : item.question_text}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn small secondary"
                        disabled={submitting}
                        onClick={() => void openExistingSession(item.id)}
                      >
                        {item.status === "completed" ? "View report" : "Resume"}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </>
    );
  }

  return (
    <>
      <div className="section-header" style={{ marginBottom: 18 }}>
        <div>
          <div className="section-title-group">
            <h2>
              {isComplete
                ? "Oral Exam Completed"
                : `Turn ${turnsDone + 1} of ${MAX_TURNS}`}
            </h2>
            <span
              className={`badge ${isComplete ? "status-ready" : "status-active"}`}
            >
              <span className="badge-dot" aria-hidden="true" />
              {isComplete ? "Completed" : "In progress"}
            </span>
            <span className="count-pill tabular">
              {turnsDone}/{MAX_TURNS}
            </span>
          </div>
          <div
            className="oral-progress-bar"
            role="progressbar"
            aria-valuenow={turnsDone}
            aria-valuemin={0}
            aria-valuemax={MAX_TURNS}
            aria-label="Oral exam turns completed"
          >
            {Array.from({ length: MAX_TURNS }).map((_, stepIndex) => {
              const stateClass =
                stepIndex < turnsDone
                  ? "done"
                  : !isComplete && stepIndex === turnsDone
                    ? "active"
                    : "";
              return (
                <div key={stepIndex} className={`oral-step ${stateClass}`} />
              );
            })}
          </div>
        </div>
        <button
          type="button"
          className="btn secondary small"
          disabled={submitting}
          onClick={restart}
        >
          Restart session
        </button>
      </div>

      {error != null && (
        <p role="alert" className="error">
          {apiErrorMessage(error)}
        </p>
      )}

      <div className="oral-workspace">
        <div className="oral-primary-col">
          {!isComplete ? (
            <>
              <div className="card question-detail-card">
                <div className="oral-prompt-header">
                  <span className="question-num-badge tabular">
                    Prompt · Turn {turnsDone + 1}
                  </span>
                </div>
                {parsedCurrentQuestion.title && (
                  <h3 className="question-detail-title">
                    {parsedCurrentQuestion.title}
                  </h3>
                )}
                <p className="question-detail-text">
                  {parsedCurrentQuestion.body}
                </p>
              </div>

              <div className="card oral-answer-card">
                <div className="oral-answer-header">
                  <label htmlFor="oral-answer">Your answer</label>
                  <span className="oral-char-count">
                    {answer.length.toLocaleString()} / 3,000
                  </span>
                </div>
                <textarea
                  id="oral-answer"
                  className="oral-textarea"
                  rows={7}
                  value={answer}
                  maxLength={3000}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Type your response in clear concepts and reasoning…"
                />
                <div className="oral-composer-footer">
                  <p className="note" style={{ margin: 0 }}>
                    Answer in your own words. You have {MAX_TURNS - turnsDone}{" "}
                    turn(s) remaining.
                  </p>
                  <button
                    type="button"
                    className="btn"
                    disabled={submitting || answer.trim() === "" || isComplete}
                    onClick={() => void submitAnswer()}
                  >
                    {submitting ? (
                      <>
                        <span className="spinner" aria-hidden="true" />
                        <span>Evaluating…</span>
                      </>
                    ) : (
                      <span>Submit answer</span>
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : session.report ? (
            <section className="oral-report-stack" aria-label="Oral exam report">
              <div className="section-header" style={{ marginBottom: 0 }}>
                <div className="section-title-group">
                  <h2>Formative report</h2>
                  <span className="badge teal-badge">Source-linked summary</span>
                </div>
              </div>

              <div className="oral-summary-grid">
                <div className="card oral-summary-card strengths">
                  <h3>
                    <span className="badge status-ready">
                      <span className="badge-dot" aria-hidden="true" />
                      Strengths
                    </span>
                  </h3>
                  {session.report.strengths.length > 0 ? (
                    <ul className="oral-point-list">
                      {session.report.strengths.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="note" style={{ margin: 0 }}>
                      No strengths recorded for this session.
                    </p>
                  )}
                </div>

                <div className="card oral-summary-card gaps">
                  <h3>
                    <span className="badge status-active">
                      <span className="badge-dot" aria-hidden="true" />
                      Missing concepts
                    </span>
                  </h3>
                  {session.report.missing_concepts.length > 0 ? (
                    <>
                      <ul className="oral-point-list">
                        {session.report.missing_concepts.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                      <div style={{ marginTop: 12 }}>
                        {onPracticeMissedConcepts ? (
                          <button
                            type="button"
                            className="btn secondary small"
                            onClick={() => onPracticeMissedConcepts(session.id)}
                          >
                            Practice missed concepts
                          </button>
                        ) : (
                          <a
                            className="btn secondary small"
                            href={`/courses/${courseId}/flashcards?oralSession=${encodeURIComponent(
                              String(session.id)
                            )}`}
                          >
                            Practice missed concepts
                          </a>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="note" style={{ margin: 0 }}>
                      No missing concepts flagged across your turns.
                    </p>
                  )}
                </div>
              </div>

              {session.report.revision_sources.length > 0 && (
                <div>
                  <div className="section-header">
                    <div className="section-title-group">
                      <h3>Revision sources</h3>
                      <span className="count-pill">
                        {session.report.revision_sources.length}
                      </span>
                    </div>
                  </div>
                  <ul className="course-list">
                    {session.report.revision_sources.map((src, i) => {
                      const timeRange = formatTimestampRange(
                        src.start_seconds,
                        src.end_seconds
                      );
                      return (
                        <li className="card source-card" key={i}>
                          <div className="source-card-top">
                            <div className="source-location">
                              <span>{src.material_title}</span>
                              {src.page_number != null && (
                                <span className="meta-chip mono">
                                  p. {src.page_number}
                                </span>
                              )}
                              {timeRange && (
                                <span className="timestamp-chip">
                                  {timeRange}
                                </span>
                              )}
                            </div>
                          </div>
                          <FormattedSourceText text={src.text} />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </section>
          ) : null}
        </div>

        <aside className="oral-history-pane" aria-label="Turn history">
          {feedbackNotes.some(
            (n) =>
              n.question_id === Number(session.question_id) ||
              (n.is_pinned && n.question_id == null)
          ) && (
            <div className="instructor-notes-stack" aria-label="Instructor guidance">
              {feedbackNotes
                .filter(
                  (n) =>
                    n.question_id === Number(session.question_id) ||
                    (n.is_pinned && n.question_id == null)
                )
                .map((note) => (
                  <div key={note.id} className="instructor-note-card">
                    <div className="question-item-header">
                      <span className="badge teal-badge">Instructor Note</span>
                      <span className="meta-chip">{note.author_name}</span>
                    </div>
                    <strong>{note.title}</strong>
                    <p>{note.comment}</p>
                  </div>
                ))}
            </div>
          )}

          <div className="section-header" style={{ marginBottom: 0 }}>
            <div className="section-title-group">
              <h2>Turn history &amp; feedback</h2>
              <span className="count-pill">{turnsDone}</span>
            </div>
          </div>

          {turnsDone === 0 ? (
            <div className="empty">
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
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </span>
              <span>
                Your submitted answers, scores, and grounded citations will appear
                here after each turn.
              </span>
            </div>
          ) : (
            <ul className="oral-turn-list">
              {session.turns.map((t, i) => (
                <li className="card oral-turn-card" key={i}>
                  <div className="oral-turn-header">
                    <span className="question-num-badge tabular">
                      Turn {i + 1}
                    </span>
                    {t.feedback && (
                      <div className="oral-turn-scores">
                        <span className="score-pill">
                          Accuracy {t.feedback.accuracy}/5
                        </span>
                        <span className="score-pill">
                          Completeness {t.feedback.completeness}/5
                        </span>
                      </div>
                    )}
                  </div>

                  <p className="oral-turn-question">{t.question}</p>

                  <div>
                    <p className="oral-turn-answer-label">Your answer</p>
                    <p className="oral-turn-answer">{t.answer}</p>
                  </div>

                  {t.feedback && (
                    <>
                      {t.feedback.correct_points.length > 0 && (
                        <div className="oral-feedback-group correct">
                          <p className="oral-feedback-title">Correct points</p>
                          <ul className="oral-feedback-list">
                            {t.feedback.correct_points.map((pt, ptIdx) => (
                              <li key={ptIdx}>{pt}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {t.feedback.missing_points.length > 0 && (
                        <div className="oral-feedback-group missing">
                          <p className="oral-feedback-title">Missing points</p>
                          <ul className="oral-feedback-list">
                            {t.feedback.missing_points.map((pt, ptIdx) => (
                              <li key={ptIdx}>{pt}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {t.feedback.source_chunk_ids.length > 0 && (
                        <div className="oral-citations">
                          <span
                            className="note"
                            style={{ margin: 0, fontWeight: 600 }}
                          >
                            Sources:
                          </span>
                          {t.feedback.source_chunk_ids.map((chunkId) => {
                            const source = session.sources.find(
                              (item) => item.chunk_id === chunkId
                            );
                            const timeRange = source
                              ? formatTimestampRange(
                                  source.start_seconds,
                                  source.end_seconds
                                )
                              : null;
                            return (
                              <span key={chunkId} className="meta-chip mono">
                                {source
                                  ? `${source.material_title}${
                                      source.page_number != null
                                        ? ` · p. ${source.page_number}`
                                        : ""
                                    }${timeRange ? ` · ${timeRange}` : ""}`
                                  : `chunk ${chunkId}`}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </>
  );
}
