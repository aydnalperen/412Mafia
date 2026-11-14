"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  apiErrorMessage,
  professorApi,
  questionsApi,
  type ProfessorDashboard,
  type ProfessorFeedbackCategory,
  type ProfessorFeedbackItem,
  type ProfessorTeachingBriefing,
} from "@/lib/api";
import { formatTimestampRange, splitQuestionTitleAndBody } from "@/lib/format";

const CATEGORY_LABELS: Record<ProfessorFeedbackCategory, string> = {
  rubric_note: "Rubric & grading note",
  emphasis: "Exam emphasis",
  clarification: "Concept clarification",
  coverage_gap: "Coverage gap",
};

const CATEGORY_BADGE_CLASS: Record<ProfessorFeedbackCategory, string> = {
  rubric_note: "kind-badge",
  emphasis: "teal-badge",
  clarification: "status-ready",
  coverage_gap: "status-active",
};

const ALIGNMENT_LABEL: Record<string, { label: string; className: string }> = {
  well_aligned: { label: "Well aligned", className: "status-ready" },
  exam_heavy_gap: { label: "Exam gap · needs material", className: "status-active" },
  taught_untested: { label: "Taught · untested", className: "" },
};

const QUESTION_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  supported: { label: "Well supported", className: "status-ready" },
  partial: { label: "Partial evidence", className: "kind-badge" },
  uncovered: { label: "No saved evidence", className: "status-active" },
};

export function ProfessorWorkspace({
  courseId,
  onOpenQuestions,
  onOpenKnowledge,
  onOpenMaterials,
  onOpenOral,
  onFeedbackCountChanged,
}: {
  courseId: string;
  onOpenQuestions?: (questionId?: string | number) => void;
  onOpenKnowledge?: () => void;
  onOpenMaterials?: () => void;
  onOpenOral?: () => void;
  onFeedbackCountChanged?: (count: number) => void;
}) {
  const [dashboard, setDashboard] = useState<ProfessorDashboard | null>(null);
  const [briefing, setBriefing] = useState<ProfessorTeachingBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [analyzingQuestionId, setAnalyzingQuestionId] = useState<number | null>(null);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [busyFeedbackId, setBusyFeedbackId] = useState<number | null>(null);
  const [questionFilter, setQuestionFilter] = useState<"all" | "gaps">("all");
  const [feedbackFilter, setFeedbackFilter] = useState<"all" | "pinned" | ProfessorFeedbackCategory>("all");

  const [authorName, setAuthorName] = useState("Course Instructor");
  const [category, setCategory] = useState<ProfessorFeedbackCategory>("rubric_note");
  const [targetType, setTargetType] = useState<"course" | "topic" | "question">("course");
  const [selectedTopicId, setSelectedTopicId] = useState<string>("");
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [isPinned, setIsPinned] = useState(true);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const loadDashboard = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setLoading(true);
      setError(null);
      try {
        const data = await professorApi.dashboard(courseId);
        setDashboard(data);
        onFeedbackCountChanged?.(data.feedback.length);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    },
    [courseId, onFeedbackCountChanged]
  );

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const handleAnalyzeQuestion = async (questionId: number) => {
    if (analyzingQuestionId !== null) return;
    setAnalyzingQuestionId(questionId);
    setError(null);
    setStatusMessage(null);
    try {
      const links = await questionsApi.analyzeSources(questionId);
      setStatusMessage(
        links.length > 0
          ? `Linked ${links.length} source excerpt${links.length === 1 ? "" : "s"} to question.`
          : "No matching lecture or slide excerpts met the evidence threshold."
      );
      await loadDashboard({ silent: true });
    } catch (err) {
      setError(err);
    } finally {
      setAnalyzingQuestionId(null);
    }
  };

  const handleGenerateBriefing = async () => {
    if (briefingLoading) return;
    setBriefingLoading(true);
    setError(null);
    try {
      const next = await professorApi.generateInsights(courseId);
      setBriefing(next);
      await loadDashboard({ silent: true });
    } catch (err) {
      setError(err);
    } finally {
      setBriefingLoading(false);
    }
  };

  const handleSubmitFeedback = async (event: FormEvent) => {
    event.preventDefault();
    if (savingFeedback) return;
    setSavingFeedback(true);
    setError(null);
    setStatusMessage(null);
    try {
      const created = await professorApi.createFeedback(courseId, {
        author_name: authorName.trim() || "Course Instructor",
        category,
        title: title.trim(),
        comment: comment.trim(),
        topic_id:
          targetType === "topic" && selectedTopicId
            ? Number(selectedTopicId)
            : null,
        question_id:
          targetType === "question" && selectedQuestionId
            ? Number(selectedQuestionId)
            : null,
        is_pinned: isPinned,
      });
      setTitle("");
      setComment("");
      setStatusMessage(`Saved instructor note "${created.title}".`);
      await loadDashboard({ silent: true });
    } catch (err) {
      setError(err);
    } finally {
      setSavingFeedback(false);
    }
  };

  const togglePin = async (item: ProfessorFeedbackItem) => {
    if (busyFeedbackId !== null) return;
    setBusyFeedbackId(item.id);
    setError(null);
    try {
      await professorApi.updateFeedback(courseId, item.id, {
        is_pinned: !item.is_pinned,
      });
      await loadDashboard({ silent: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusyFeedbackId(null);
    }
  };

  const deleteFeedback = async (item: ProfessorFeedbackItem) => {
    if (busyFeedbackId !== null) return;
    setBusyFeedbackId(item.id);
    setError(null);
    try {
      await professorApi.deleteFeedback(courseId, item.id);
      setStatusMessage(`Removed note "${item.title}".`);
      await loadDashboard({ silent: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusyFeedbackId(null);
    }
  };

  const prefillQuestionFeedback = (questionId: number, questionNumber: string) => {
    setTargetType("question");
    setSelectedQuestionId(String(questionId));
    setCategory("coverage_gap");
    if (!title.trim()) {
      setTitle(`Question ${questionNumber} clarification & coverage`);
    }
    const input = document.getElementById("prof-feedback-title");
    input?.focus();
    input?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const filteredQuestions = useMemo(() => {
    if (!dashboard) return [];
    if (questionFilter === "gaps") {
      return dashboard.question_coverage.filter((q) => q.coverage_status !== "supported");
    }
    return dashboard.question_coverage;
  }, [dashboard, questionFilter]);

  const filteredFeedback = useMemo(() => {
    if (!dashboard) return [];
    if (feedbackFilter === "all") return dashboard.feedback;
    if (feedbackFilter === "pinned") return dashboard.feedback.filter((f) => f.is_pinned);
    return dashboard.feedback.filter((f) => f.category === feedbackFilter);
  }, [dashboard, feedbackFilter]);

  if (loading && !dashboard) {
    return (
      <div className="loading">
        <span className="spinner" aria-hidden="true" />
        <span>Loading teaching–assessment coverage &amp; feedback…</span>
      </div>
    );
  }

  if (!dashboard) {
    return error != null ? (
      <p role="alert" className="error">
        {apiErrorMessage(error)}
      </p>
    ) : null;
  }

  const { summary, ai_budget } = dashboard;
  const gapsCount = summary.questions_uncovered +
    dashboard.topic_alignment.filter((t) => t.alignment_status === "exam_heavy_gap").length;

  return (
    <div className="professor-workspace-stack">
      {error != null && (
        <p role="alert" className="error">
          {apiErrorMessage(error)}
        </p>
      )}
      {statusMessage && (
        <div className="callout-info" role="status">
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
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <p className="note" style={{ margin: 0, color: "var(--text)" }}>
            {statusMessage}
          </p>
        </div>
      )}

      {/* Top KPI Row matching Flashcards / Course Overview design language */}
      <div className="summary-grid" aria-label="Course teaching alignment metrics">
        <div className="summary-stat">
          <span className="summary-label">Materials indexed</span>
          <strong className="summary-value">
            {summary.materials_ready}/{summary.materials_total}
          </strong>
          <span className="note" style={{ margin: 0 }}>
            {summary.slides_count} slides · {summary.transcripts_count} transcripts · {summary.chunks_count} chunks
          </span>
        </div>

        <div className="summary-stat">
          <span className="summary-label">Exam evidence coverage</span>
          <strong className="summary-value">
            {summary.questions_with_sources}/{summary.questions_total}
          </strong>
          <span className="note" style={{ margin: 0 }}>
            {summary.questions_uncovered > 0
              ? `${summary.questions_uncovered} awaiting source linking`
              : summary.questions_total > 0
                ? "All past questions linked"
                : "No past exam uploaded yet"}
          </span>
        </div>

        <div className="summary-stat">
          <span className="summary-label">Oral readiness average</span>
          <strong className="summary-value">
            {summary.avg_accuracy !== null
              ? `${summary.avg_accuracy}/5 · ${summary.avg_completeness}/5`
              : "—"}
          </strong>
          <span className="note" style={{ margin: 0 }}>
            {summary.oral_turns_count > 0
              ? `Accuracy · Completeness across ${summary.oral_turns_count} turn${summary.oral_turns_count === 1 ? "" : "s"}`
              : "No oral exam turns evaluated yet"}
          </span>
        </div>

        <div className="summary-stat">
          <span className="summary-label">Instructor notes &amp; AI cap</span>
          <strong className="summary-value">{summary.feedback_count}</strong>
          <span className="note" style={{ margin: 0 }}>
            AI spend: ${ai_budget.spent_usd.toFixed(3)} / ${ai_budget.budget_usd.toFixed(2)} cap
          </span>
        </div>
      </div>

      {/* Bounded Workflow Pipeline Strip */}
      <section className="card pipeline-card" aria-label="Course pipeline status">
        <div className="section-header" style={{ marginBottom: 14 }}>
          <div className="section-title-group">
            <span className="eyebrow" style={{ marginRight: 6 }}>Workflow Coordinator</span>
            <h2>Course pipeline health</h2>
          </div>
          <span className={`badge ${ai_budget.budget_exceeded ? "status-failed" : "teal-badge"}`}>
            <span className="badge-dot" aria-hidden="true" />
            AI calls: {ai_budget.llm_calls + ai_budget.stt_calls} · Remaining ${ai_budget.remaining_usd.toFixed(2)}
          </span>
        </div>

        <ol className="pipeline-stepper">
          {dashboard.pipeline.map((step, index) => {
            const badgeClass =
              step.status === "ready"
                ? "status-ready"
                : step.status === "active" || step.status === "partial"
                  ? "status-active"
                  : "";
            return (
              <li key={step.key} className={`pipeline-step is-${step.status}`}>
                <div className="pipeline-step-head">
                  <span className="pipeline-step-index tabular">{index + 1}</span>
                  <span className="pipeline-step-title">{step.label}</span>
                  <span className={`badge ${badgeClass}`} style={{ marginLeft: "auto" }}>
                    {step.status}
                  </span>
                </div>
                <p className="pipeline-step-detail">{step.detail}</p>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Main 2-Column Professor Studio */}
      <div className="professor-studio-grid">
        {/* Left Column: Alignment Matrix, Question Audit, Weaknesses & AI Briefing */}
        <div className="professor-analytics-col">
          {/* Topic Teaching-Assessment Alignment */}
          <section className="card">
            <div className="section-header" style={{ marginBottom: 14 }}>
              <div className="section-title-group">
                <h2>Teaching–assessment topic matrix</h2>
                <span className="count-pill">{dashboard.topic_alignment.length}</span>
              </div>
              {onOpenKnowledge && (
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={onOpenKnowledge}
                >
                  Open knowledge graph
                </button>
              )}
            </div>

            {dashboard.topic_alignment.length === 0 ? (
              <div className="empty">
                <span>
                  No course topics generated yet. Generate the knowledge graph from uploaded slides and transcripts to audit topic alignment.
                </span>
              </div>
            ) : (
              <div className="coverage-table-wrap">
                <table className="coverage-table">
                  <thead>
                    <tr>
                      <th>Topic</th>
                      <th>Teaching sources</th>
                      <th>Exam links</th>
                      <th>Oral gaps</th>
                      <th>Alignment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.topic_alignment.map((topic) => {
                      const statusMeta = ALIGNMENT_LABEL[topic.alignment_status] ?? {
                        label: topic.alignment_status,
                        className: "",
                      };
                      return (
                        <tr key={topic.topic_id}>
                          <td>
                            <div className="coverage-topic-name">{topic.name}</div>
                            {topic.description && (
                              <div className="coverage-topic-desc">{topic.description}</div>
                            )}
                          </td>
                          <td>
                            <div className="meta-row" style={{ marginTop: 0 }}>
                              <span className="meta-chip">{topic.slide_chunks} slides</span>
                              <span className="meta-chip">{topic.transcript_chunks} lecture</span>
                              {topic.study_chunks > 0 && (
                                <span className="meta-chip">{topic.study_chunks} study</span>
                              )}
                            </div>
                          </td>
                          <td>
                            {topic.linked_questions.length > 0 ? (
                              <div className="meta-row" style={{ marginTop: 0 }}>
                                {topic.linked_questions.map((q) =>
                                  onOpenQuestions ? (
                                    <button
                                      key={q.id}
                                      type="button"
                                      className="meta-chip link-chip"
                                      onClick={() => onOpenQuestions(q.id)}
                                    >
                                      Q{q.question_number}
                                    </button>
                                  ) : (
                                    <span key={q.id} className="meta-chip">
                                      Q{q.question_number}
                                    </span>
                                  )
                                )}
                              </div>
                            ) : (
                              <span className="note" style={{ margin: 0 }}>None</span>
                            )}
                          </td>
                          <td className="tabular">
                            {topic.oral_weakness_hits > 0 ? (
                              <span className="badge status-active">
                                {topic.oral_weakness_hits}
                              </span>
                            ) : (
                              <span className="note" style={{ margin: 0 }}>0</span>
                            )}
                          </td>
                          <td>
                            <span
                              className={`badge ${statusMeta.className}`}
                              style={{ textTransform: "none" }}
                            >
                              {statusMeta.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Past Exam Question Evidence Audit */}
          <section className="card">
            <div className="section-header" style={{ marginBottom: 14 }}>
              <div className="section-title-group">
                <h2>Exam question evidence audit</h2>
                <span className="count-pill">{filteredQuestions.length}</span>
                {gapsCount > 0 && (
                  <span className="badge status-active" style={{ textTransform: "none" }}>
                    {summary.questions_uncovered} uncovered
                  </span>
                )}
              </div>

              <div className="flashcards-filters" role="group" aria-label="Filter question coverage">
                <button
                  type="button"
                  className={`flashcards-filter-btn${questionFilter === "all" ? " active" : ""}`}
                  onClick={() => setQuestionFilter("all")}
                >
                  All ({dashboard.question_coverage.length})
                </button>
                <button
                  type="button"
                  className={`flashcards-filter-btn${questionFilter === "gaps" ? " active" : ""}`}
                  onClick={() => setQuestionFilter("gaps")}
                >
                  Needs attention (
                  {dashboard.question_coverage.filter((q) => q.coverage_status !== "supported").length})
                </button>
              </div>
            </div>

            {filteredQuestions.length === 0 ? (
              <div className="empty">
                <span>
                  {dashboard.question_coverage.length === 0
                    ? "No past-exam questions uploaded yet."
                    : "All extracted past exam questions have strong lecture & slide evidence."}
                </span>
                {dashboard.question_coverage.length === 0 && onOpenMaterials && (
                  <button
                    type="button"
                    className="btn small secondary"
                    onClick={onOpenMaterials}
                  >
                    Upload past exam
                  </button>
                )}
              </div>
            ) : (
              <ul className="overview-list">
                {filteredQuestions.map((q) => {
                  const parsed = splitQuestionTitleAndBody(q.text);
                  const badgeMeta = QUESTION_STATUS_LABEL[q.coverage_status] ?? {
                    label: q.coverage_status,
                    className: "",
                  };
                  const busy = analyzingQuestionId === q.question_id;

                  return (
                    <li key={q.question_id} className="overview-list-item professor-question-row">
                      <div className="overview-list-main">
                        <div className="question-item-header">
                          <span className="question-num-badge tabular">
                            Q{q.question_number}
                          </span>
                          <span
                            className={`badge ${badgeMeta.className}`}
                            style={{ textTransform: "none" }}
                          >
                            {badgeMeta.label}
                          </span>
                          {q.has_slides && <span className="meta-chip">Slides</span>}
                          {q.has_transcript && <span className="meta-chip">Transcript</span>}
                          {q.feedback_count > 0 && (
                            <span className="badge teal-badge" style={{ textTransform: "none" }}>
                              {q.feedback_count} note{q.feedback_count === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                        <div className="overview-list-title">
                          {parsed.title || (parsed.body.length > 130 ? `${parsed.body.slice(0, 130)}…` : parsed.body)}
                        </div>
                        <div className="note" style={{ margin: 0 }}>
                          {q.material_title}
                          {q.page_number !== null ? ` · p. ${q.page_number}` : ""}
                          {" · "}
                          {q.source_count} saved {q.source_count === 1 ? "source" : "sources"}
                        </div>
                      </div>

                      <div className="actions" style={{ marginTop: 0, flexShrink: 0 }}>
                        {q.coverage_status !== "supported" && (
                          <button
                            type="button"
                            className="btn small"
                            disabled={busy}
                            onClick={() => void handleAnalyzeQuestion(q.question_id)}
                          >
                            {busy ? "Analyzing…" : "Analyze sources"}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn small secondary"
                          onClick={() =>
                            prefillQuestionFeedback(q.question_id, q.question_number)
                          }
                        >
                          + Feedback
                        </button>
                        {onOpenQuestions && (
                          <button
                            type="button"
                            className="btn small secondary"
                            onClick={() => onOpenQuestions(q.question_id)}
                          >
                            Inspect
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Student Weaknesses from Oral Practice + AI Teaching Briefing */}
          <section className="card">
            <div className="section-header" style={{ marginBottom: 14 }}>
              <div className="section-title-group">
                <h2>Oral practice gaps &amp; teaching briefing</h2>
                <span className="count-pill">{dashboard.recurring_weaknesses.length}</span>
              </div>
              <div className="actions" style={{ marginTop: 0 }}>
                {onOpenOral && (
                  <button
                    type="button"
                    className="btn small secondary"
                    onClick={onOpenOral}
                  >
                    Open oral exam
                  </button>
                )}
                {dashboard.openrouter_available && (
                  <button
                    type="button"
                    className="btn small"
                    disabled={briefingLoading || ai_budget.budget_exceeded}
                    onClick={() => void handleGenerateBriefing()}
                  >
                    {briefingLoading ? "Synthesizing…" : "Generate AI briefing"}
                  </button>
                )}
              </div>
            </div>

            {briefing && (
              <div className="professor-briefing-box">
                <div className="section-title-group" style={{ marginBottom: 8 }}>
                  <span className="badge teal-badge">AI Teaching Briefing</span>
                  <span className="note" style={{ margin: 0 }}>
                    Grounded strictly in verified course coverage &amp; oral gaps
                  </span>
                </div>
                <p className="professor-briefing-summary">{briefing.executive_summary}</p>
                {briefing.teaching_priorities.length > 0 && (
                  <ul className="professor-priority-list">
                    {briefing.teaching_priorities.map((p, idx) => (
                      <li key={idx} className="professor-priority-item">
                        <strong>{p.title}</strong>
                        <p>{p.rationale}</p>
                        {(p.cited_question_ids.length > 0 || p.cited_topic_ids.length > 0) && (
                          <div className="meta-row" style={{ marginTop: 6 }}>
                            {p.cited_question_ids.map((qid) => (
                              <span key={`q-${qid}`} className="meta-chip mono">
                                Question #{qid}
                              </span>
                            ))}
                            {p.cited_topic_ids.map((tid) => (
                              <span key={`t-${tid}`} className="meta-chip mono">
                                Topic #{tid}
                              </span>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {dashboard.recurring_weaknesses.length === 0 ? (
              <div className="empty">
                <span>
                  No missing concepts reported from oral exam sessions yet. Real weaknesses appear here automatically as oral exams complete.
                </span>
              </div>
            ) : (
              <ul className="overview-list">
                {dashboard.recurring_weaknesses.map((item, idx) => (
                  <li key={idx} className="overview-list-item">
                    <div className="overview-list-main">
                      <div className="question-item-header">
                        <span className="badge status-active" style={{ textTransform: "none" }}>
                          {item.occurrences} session{item.occurrences === 1 ? "" : "s"}
                        </span>
                        {item.question_numbers.map((qn) => (
                          <span key={qn} className="meta-chip">
                            Q{qn}
                          </span>
                        ))}
                      </div>
                      <div className="overview-list-title">{item.concept}</div>
                      {item.revision_sources.length > 0 && (
                        <div className="meta-row" style={{ marginTop: 4 }}>
                          {item.revision_sources.map((src) => {
                            const range = formatTimestampRange(src.start_seconds, src.end_seconds);
                            return (
                              <span key={src.chunk_id} className="meta-chip mono">
                                {src.material_title}
                                {src.page_number !== null ? ` · p. ${src.page_number}` : ""}
                                {range ? ` · ${range}` : ""}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Right Column: Professor Feedback & Rubric Guidance Studio */}
        <div className="professor-feedback-col">
          <section className="card">
            <span className="eyebrow">Instructor Guidance</span>
            <h2 style={{ marginTop: 4, marginBottom: 8 }}>Leave professor feedback</h2>
            <p className="note" style={{ marginTop: 0, marginBottom: 14 }}>
              Publish real grading rubrics, emphasis notes, or concept clarifications. Pinned notes surface directly beside matching exam questions and oral practice prompts.
            </p>

            <form onSubmit={(e) => void handleSubmitFeedback(e)}>
              <div className="professor-form-row">
                <div className="field">
                  <label htmlFor="prof-author">Instructor label</label>
                  <input
                    id="prof-author"
                    type="text"
                    maxLength={80}
                    value={authorName}
                    onChange={(e) => setAuthorName(e.target.value)}
                    placeholder="e.g. Prof. Rossi"
                  />
                </div>
                <div className="field">
                  <label htmlFor="prof-category">Category</label>
                  <select
                    id="prof-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ProfessorFeedbackCategory)}
                  >
                    <option value="rubric_note">Rubric &amp; grading note</option>
                    <option value="emphasis">Exam emphasis</option>
                    <option value="clarification">Concept clarification</option>
                    <option value="coverage_gap">Coverage gap</option>
                  </select>
                </div>
              </div>

              <div className="professor-form-row">
                <div className="field">
                  <label htmlFor="prof-target-type">Applies to</label>
                  <select
                    id="prof-target-type"
                    value={targetType}
                    onChange={(e) =>
                      setTargetType(e.target.value as "course" | "topic" | "question")
                    }
                  >
                    <option value="course">Whole course</option>
                    <option value="question">Specific exam question</option>
                    <option value="topic">Specific topic</option>
                  </select>
                </div>

                {targetType === "question" && (
                  <div className="field">
                    <label htmlFor="prof-question">Exam question</label>
                    <select
                      id="prof-question"
                      required
                      value={selectedQuestionId}
                      onChange={(e) => setSelectedQuestionId(e.target.value)}
                    >
                      <option value="">Select question…</option>
                      {dashboard.question_coverage.map((q) => (
                        <option key={q.question_id} value={q.question_id}>
                          Q{q.question_number} — {q.text.slice(0, 64)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {targetType === "topic" && (
                  <div className="field">
                    <label htmlFor="prof-topic">Course topic</label>
                    <select
                      id="prof-topic"
                      required
                      value={selectedTopicId}
                      onChange={(e) => setSelectedTopicId(e.target.value)}
                    >
                      <option value="">Select topic…</option>
                      {dashboard.topic_alignment.map((t) => (
                        <option key={t.topic_id} value={t.topic_id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="field">
                <label htmlFor="prof-feedback-title">Headline</label>
                <input
                  id="prof-feedback-title"
                  type="text"
                  required
                  maxLength={160}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Strict 2PL is tested for cascading abort prevention"
                />
              </div>

              <div className="field">
                <label htmlFor="prof-feedback-comment">Feedback / guidance</label>
                <textarea
                  id="prof-feedback-comment"
                  rows={4}
                  required
                  maxLength={2000}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Share exact rubric expectations, slide omissions, or follow-up hints…"
                />
              </div>

              <label className="professor-pin-toggle">
                <input
                  type="checkbox"
                  checked={isPinned}
                  onChange={(e) => setIsPinned(e.target.checked)}
                />
                <span>Pin note to student Exam questions &amp; Overview</span>
              </label>

              <button
                type="submit"
                className="btn full"
                disabled={savingFeedback || !title.trim() || !comment.trim()}
              >
                {savingFeedback ? "Saving feedback…" : "Publish instructor feedback"}
              </button>
            </form>
          </section>

          <section className="card">
            <div className="section-header" style={{ marginBottom: 12 }}>
              <div className="section-title-group">
                <h2>Published feedback</h2>
                <span className="count-pill">{filteredFeedback.length}</span>
              </div>
            </div>

            <div className="flashcards-filters" style={{ marginBottom: 14 }}>
              {(
                [
                  ["all", "All"],
                  ["pinned", "Pinned"],
                  ["rubric_note", "Rubric"],
                  ["emphasis", "Emphasis"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`flashcards-filter-btn${feedbackFilter === key ? " active" : ""}`}
                  onClick={() => setFeedbackFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            {filteredFeedback.length === 0 ? (
              <div className="empty">
                <span>No instructor feedback notes yet. Add a rubric or emphasis note above.</span>
              </div>
            ) : (
              <ul className="professor-feedback-feed">
                {filteredFeedback.map((item) => (
                  <li
                    key={item.id}
                    className={`professor-feedback-item${item.is_pinned ? " is-pinned" : ""}`}
                  >
                    <div className="question-item-header">
                      <span
                        className={`badge ${CATEGORY_BADGE_CLASS[item.category]}`}
                        style={{ textTransform: "none" }}
                      >
                        {CATEGORY_LABELS[item.category]}
                      </span>
                      {item.is_pinned && (
                        <span className="badge teal-badge">Pinned</span>
                      )}
                      {item.question_number && (
                        <button
                          type="button"
                          className="meta-chip link-chip"
                          onClick={() =>
                            item.question_id && onOpenQuestions?.(item.question_id)
                          }
                        >
                          Q{item.question_number}
                        </button>
                      )}
                      {item.topic_name && (
                        <span className="meta-chip">{item.topic_name}</span>
                      )}
                    </div>

                    <h3 className="professor-feedback-title">{item.title}</h3>
                    <p className="professor-feedback-body">{item.comment}</p>

                    <div className="professor-feedback-footer">
                      <span className="note" style={{ margin: 0 }}>
                        {item.author_name} · {new Date(item.created_at).toLocaleDateString()}
                      </span>
                      <div className="actions" style={{ marginTop: 0 }}>
                        <button
                          type="button"
                          className="btn small secondary"
                          disabled={busyFeedbackId === item.id}
                          onClick={() => void togglePin(item)}
                        >
                          {item.is_pinned ? "Unpin" : "Pin"}
                        </button>
                        <button
                          type="button"
                          className="btn small danger-outline"
                          disabled={busyFeedbackId === item.id}
                          onClick={() => void deleteFeedback(item)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
