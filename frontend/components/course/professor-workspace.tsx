"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  apiErrorMessage,
  knowledgeApi,
  professorApi,
  questionsApi,
  type KnowledgeGraph,
  type ProfessorDashboard,
  type ProfessorFeedbackCategory,
  type ProfessorFeedbackItem,
  type ProfessorTeachingBriefing,
} from "@/lib/api";
import { formatTimestampRange, splitQuestionTitleAndBody } from "@/lib/format";

const NOTE_TYPE_OPTIONS: Array<{
  value: ProfessorFeedbackCategory;
  label: string;
  badgeClass: string;
}> = [
  { value: "emphasis", label: "Exam focus", badgeClass: "teal-badge" },
  { value: "rubric_note", label: "Grading tip", badgeClass: "kind-badge" },
  { value: "clarification", label: "Clarification", badgeClass: "status-ready" },
  { value: "coverage_gap", label: "Coverage gap", badgeClass: "status-active" },
];

const CATEGORY_META: Record<
  ProfessorFeedbackCategory,
  { label: string; badgeClass: string }
> = {
  emphasis: { label: "Exam focus", badgeClass: "teal-badge" },
  rubric_note: { label: "Grading tip", badgeClass: "kind-badge" },
  clarification: { label: "Clarification", badgeClass: "status-ready" },
  coverage_gap: { label: "Coverage gap", badgeClass: "status-active" },
};

const ALIGNMENT_LABEL: Record<string, { label: string; className: string }> = {
  well_aligned: { label: "Covered & tested", className: "status-ready" },
  exam_heavy_gap: { label: "Needs lecture depth", className: "status-active" },
  taught_untested: { label: "Not yet tested", className: "" },
};

export function ProfessorWorkspace({
  courseId,
  onOpenQuestions,
  onOpenKnowledge,
  onOpenMaterials,
  onOpenOral,
  onFeedbackCountChanged,
  onGraphChanged,
  onCourseDataChanged,
}: {
  courseId: string;
  onOpenQuestions?: (questionId?: string | number) => void;
  onOpenKnowledge?: () => void;
  onOpenMaterials?: () => void;
  onOpenOral?: () => void;
  onFeedbackCountChanged?: (count: number) => void;
  onGraphChanged?: (graph: KnowledgeGraph) => void;
  onCourseDataChanged?: () => void;
}) {
  const [dashboard, setDashboard] = useState<ProfessorDashboard | null>(null);
  const [briefing, setBriefing] = useState<ProfessorTeachingBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [analyzingQuestionId, setAnalyzingQuestionId] = useState<number | null>(null);
  const [linkingAll, setLinkingAll] = useState(false);
  const [analyzingSubjects, setAnalyzingSubjects] = useState(false);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [busyFeedbackId, setBusyFeedbackId] = useState<number | null>(null);
  const [questionFilter, setQuestionFilter] = useState<"all" | "gaps">("all");

  // Simplified unified target value: "course" | "question:<id>" | "topic:<id>"
  const [targetValue, setTargetValue] = useState<string>("course");
  const [category, setCategory] = useState<ProfessorFeedbackCategory>("emphasis");
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
      onCourseDataChanged?.();
    } catch (err) {
      setError(err);
    } finally {
      setAnalyzingQuestionId(null);
    }
  };

  const handleLinkAllQuestions = async () => {
    if (linkingAll || analyzingQuestionId !== null) return;
    setLinkingAll(true);
    setError(null);
    setStatusMessage(null);
    try {
      const next = await professorApi.linkQuestions(courseId, "local");
      setDashboard(next);
      onFeedbackCountChanged?.(next.feedback.length);
      onCourseDataChanged?.();
      setStatusMessage(
        `Matched evidence across ${next.summary.questions_with_sources} of ${next.summary.questions_total} exam questions.`
      );
    } catch (err) {
      setError(err);
    } finally {
      setLinkingAll(false);
    }
  };

  const handleAnalyzeSubjects = async () => {
    if (analyzingSubjects) return;
    setAnalyzingSubjects(true);
    setError(null);
    setStatusMessage(null);
    try {
      const nextGraph = await knowledgeApi.generate(courseId, "local");
      onGraphChanged?.(nextGraph);
      onCourseDataChanged?.();
      setStatusMessage(
        `Analyzed ${nextGraph.topics.length} course subject${nextGraph.topics.length === 1 ? "" : "s"} from lectures and slides.`
      );
      await loadDashboard({ silent: true });
    } catch (err) {
      setError(err);
    } finally {
      setAnalyzingSubjects(false);
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

    let topicId: number | null = null;
    let questionId: number | null = null;
    if (targetValue.startsWith("topic:")) {
      topicId = Number(targetValue.slice("topic:".length));
    } else if (targetValue.startsWith("question:")) {
      questionId = Number(targetValue.slice("question:".length));
    }

    const trimmedComment = comment.trim();
    const resolvedTitle =
      title.trim() ||
      trimmedComment.split(/[.!?\n]/)[0].trim().slice(0, 80) ||
      CATEGORY_META[category].label;

    try {
      const created = await professorApi.createFeedback(courseId, {
        author_name: "Course Instructor",
        category,
        title: resolvedTitle,
        comment: trimmedComment,
        topic_id: topicId,
        question_id: questionId,
        is_pinned: isPinned,
      });
      setTitle("");
      setComment("");
      setStatusMessage(`Published note "${created.title}".`);
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
      setStatusMessage(`Removed "${item.title}".`);
      await loadDashboard({ silent: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusyFeedbackId(null);
    }
  };

  const prefillQuestionFeedback = (questionId: number, questionNumber: string) => {
    setTargetValue(`question:${questionId}`);
    setCategory("clarification");
    if (!title.trim()) {
      setTitle(`Question ${questionNumber} guidance`);
    }
    const input = document.getElementById("prof-feedback-comment");
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

  if (loading && !dashboard) {
    return (
      <div className="loading">
        <span className="spinner" aria-hidden="true" />
        <span>Loading teaching alignment &amp; feedback…</span>
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
  const coverageRatio =
    summary.questions_total > 0
      ? Math.round((summary.questions_with_sources / summary.questions_total) * 100)
      : 0;
  const attentionCount = dashboard.question_coverage.filter(
    (q) => q.coverage_status !== "supported"
  ).length;

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

      {/* Clean Modern Header Banner */}
      <section className="card prof-banner" aria-label="Course teaching summary">
        <div className="prof-banner-main">
          <div className="prof-banner-heading">
            <span className="eyebrow">Teaching &amp; Assessment Alignment</span>
            <h2>Course readiness overview</h2>
          </div>

          <div className="prof-coverage-meter">
            <div className="prof-coverage-meter-head">
              <span>
                <strong>{summary.questions_with_sources}</strong> of{" "}
                <strong>{summary.questions_total}</strong> past-exam questions backed by lecture/slide sources
              </span>
              <span className="meta-chip tabular">{coverageRatio}% linked</span>
            </div>
            <div className="prof-progress-track" aria-hidden="true">
              <div
                className="prof-progress-fill"
                style={{ width: `${coverageRatio}%` }}
              />
            </div>
          </div>
        </div>

        <div className="prof-banner-actions">
          <div className="prof-banner-pills">
            {summary.oral_turns_count > 0 && summary.avg_accuracy !== null && (
              <span className="badge teal-badge" style={{ textTransform: "none" }}>
                Oral avg {summary.avg_accuracy}/5 · {summary.oral_turns_count} turn{summary.oral_turns_count === 1 ? "" : "s"}
              </span>
            )}
            <span className="meta-chip mono">
              AI budget ${ai_budget.spent_usd.toFixed(3)} / ${ai_budget.budget_usd.toFixed(2)}
            </span>
          </div>

          {dashboard.openrouter_available && (
            <button
              type="button"
              className="btn small"
              disabled={briefingLoading || ai_budget.budget_exceeded}
              onClick={() => void handleGenerateBriefing()}
            >
              {briefingLoading ? "Synthesizing…" : "Generate AI teaching briefing"}
            </button>
          )}
        </div>
      </section>

      {briefing && (
        <section className="card prof-briefing-card" aria-label="AI Teaching Briefing">
          <div className="section-header" style={{ marginBottom: 10 }}>
            <div className="section-title-group">
              <span className="badge kind-badge">AI Teaching Briefing</span>
              <span className="note" style={{ margin: 0 }}>
                Synthesized strictly from real course materials and oral practice gaps
              </span>
            </div>
          </div>
          <p className="professor-briefing-summary">{briefing.executive_summary}</p>
          {briefing.teaching_priorities.length > 0 && (
            <div className="prof-priority-grid">
              {briefing.teaching_priorities.map((p, idx) => (
                <div key={idx} className="professor-priority-item">
                  <strong>{p.title}</strong>
                  <p>{p.rationale}</p>
                  {(p.cited_question_ids.length > 0 || p.cited_topic_ids.length > 0) && (
                    <div className="meta-row" style={{ marginTop: 8 }}>
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
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Main 2-Column Workspace */}
      <div className="professor-studio-grid">
        {/* Left Column: Modernized Question Evidence Audit & Topic/Oral Alignment */}
        <div className="professor-analytics-col">
          <section className="card" aria-label="Exam question evidence audit">
            <div className="section-header" style={{ marginBottom: 16 }}>
              <div className="section-title-group">
                <h2>Exam question evidence audit</h2>
                <span className="count-pill">{filteredQuestions.length}</span>
              </div>

              <div className="actions" style={{ marginTop: 0 }}>
                {attentionCount > 0 && (
                  <button
                    type="button"
                    className="btn small"
                    disabled={linkingAll || analyzingQuestionId !== null}
                    onClick={() => void handleLinkAllQuestions()}
                  >
                    {linkingAll ? "Matching…" : "Match missing questions"}
                  </button>
                )}
                <div className="flashcards-filters" role="group" aria-label="Filter questions">
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
                    Needs attention ({attentionCount})
                  </button>
                </div>
              </div>
            </div>

            {filteredQuestions.length === 0 ? (
              <div className="empty">
                <span>
                  {dashboard.question_coverage.length === 0
                    ? "No past-exam questions uploaded yet."
                    : "Every exam question has verified slide and lecture coverage."}
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
              <div className="prof-audit-list">
                {filteredQuestions.map((q) => {
                  const parsed = splitQuestionTitleAndBody(q.text);
                  const headline =
                    parsed.title ||
                    (parsed.body.length > 125
                      ? `${parsed.body.slice(0, 125)}…`
                      : parsed.body);
                  const busy = analyzingQuestionId === q.question_id;
                  const statusLabel =
                    q.coverage_status === "supported"
                      ? "Supported"
                      : q.coverage_status === "partial"
                        ? "Partial evidence"
                        : "Missing evidence";
                  const statusClass =
                    q.coverage_status === "supported"
                      ? "status-ready"
                      : q.coverage_status === "partial"
                        ? "kind-badge"
                        : "status-active";

                  return (
                    <article
                      key={q.question_id}
                      className={`prof-audit-card is-${q.coverage_status}`}
                    >
                      <div className="prof-audit-top">
                        <div className="prof-audit-badges">
                          <span className="question-num-badge tabular">
                            Q{q.question_number}
                          </span>
                          <span
                            className={`badge ${statusClass}`}
                            style={{ textTransform: "none" }}
                          >
                            <span className="badge-dot" aria-hidden="true" />
                            {statusLabel}
                          </span>
                          {q.feedback_count > 0 && (
                            <span className="badge teal-badge" style={{ textTransform: "none" }}>
                              {q.feedback_count} note{q.feedback_count === 1 ? "" : "s"}
                            </span>
                          )}
                          {q.topics?.slice(0, 3).map((t) => (
                            <span key={t.id} className="meta-chip">
                              {t.name}
                            </span>
                          ))}
                        </div>

                        <div className="prof-audit-sources">
                          <span className={`prof-source-pill ${q.has_slides ? "is-present" : "is-absent"}`}>
                            {q.has_slides ? "✓ Slides" : "No slides"}
                          </span>
                          <span className={`prof-source-pill ${q.has_transcript ? "is-present" : "is-absent"}`}>
                            {q.has_transcript ? "✓ Lecture" : "No lecture"}
                          </span>
                        </div>
                      </div>

                      <h3 className="prof-audit-title">{headline}</h3>

                      <div className="prof-audit-footer">
                        <span className="note" style={{ margin: 0 }}>
                          {q.material_title}
                          {q.page_number !== null ? ` · p. ${q.page_number}` : ""}
                          {" · "}
                          {q.source_count} saved {q.source_count === 1 ? "excerpt" : "excerpts"}
                        </span>

                        <div className="actions" style={{ marginTop: 0 }}>
                          {q.coverage_status !== "supported" && (
                            <button
                              type="button"
                              className="btn small"
                              disabled={busy}
                              onClick={() => void handleAnalyzeQuestion(q.question_id)}
                            >
                              {busy ? "Linking…" : "Link sources"}
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn small secondary"
                            onClick={() =>
                              prefillQuestionFeedback(q.question_id, q.question_number)
                            }
                          >
                            Add note
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
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* Topic Alignment & Oral Practice Gaps Card */}
          <section className="card" aria-label="Topics and student weaknesses">
            <div className="section-header" style={{ marginBottom: 14 }}>
              <div className="section-title-group">
                <h2>Topic coverage &amp; oral gaps</h2>
                <span className="count-pill">{dashboard.topic_alignment.length}</span>
              </div>
              <div className="actions" style={{ marginTop: 0 }}>
                <button
                  type="button"
                  className="btn small secondary"
                  disabled={analyzingSubjects}
                  onClick={() => void handleAnalyzeSubjects()}
                >
                  {analyzingSubjects
                    ? "Analyzing…"
                    : dashboard.topic_alignment.length === 0
                      ? "Analyze subjects"
                      : "Refresh subjects"}
                </button>
                {onOpenKnowledge && (
                  <button
                    type="button"
                    className="btn small secondary"
                    onClick={onOpenKnowledge}
                  >
                    Knowledge graph
                  </button>
                )}
                {onOpenOral && (
                  <button
                    type="button"
                    className="btn small secondary"
                    onClick={onOpenOral}
                  >
                    Oral exam
                  </button>
                )}
              </div>
            </div>

            {dashboard.topic_alignment.length === 0 ? (
              <div className="empty">
                <span>
                  Analyze course subjects to compare lecture coverage against past exam questions.
                </span>
                <button
                  type="button"
                  className="btn small"
                  disabled={analyzingSubjects}
                  onClick={() => void handleAnalyzeSubjects()}
                >
                  {analyzingSubjects ? "Analyzing…" : "Analyze subjects"}
                </button>
              </div>
            ) : (
              <div className="prof-topics-grid">
                {dashboard.topic_alignment.map((topic) => {
                  const statusMeta = ALIGNMENT_LABEL[topic.alignment_status] ?? {
                    label: topic.alignment_status,
                    className: "",
                  };
                  return (
                    <div key={topic.topic_id} className="prof-topic-row">
                      <div className="prof-topic-info">
                        <div className="prof-topic-head">
                          <strong>{topic.name}</strong>
                          <span
                            className={`badge ${statusMeta.className}`}
                            style={{ textTransform: "none" }}
                          >
                            {statusMeta.label}
                          </span>
                        </div>
                        {topic.keywords && topic.keywords.length > 0 && (
                          <div className="note" style={{ margin: "3px 0 0", fontSize: "0.8rem" }}>
                            {topic.keywords.slice(0, 5).join(" · ")}
                          </div>
                        )}
                        <div className="meta-row" style={{ marginTop: 6 }}>
                          <span className="meta-chip">{topic.slide_chunks} slides</span>
                          <span className="meta-chip">{topic.transcript_chunks} lecture</span>
                          {topic.study_chunks > 0 && (
                            <span className="meta-chip">{topic.study_chunks} study</span>
                          )}
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
                          {topic.oral_weakness_hits > 0 && (
                            <span className="badge status-active" style={{ textTransform: "none" }}>
                              {topic.oral_weakness_hits} oral gap{topic.oral_weakness_hits === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {dashboard.recurring_weaknesses.length > 0 && (
              <div className="prof-weakness-subsection">
                <div className="section-title-group" style={{ marginBottom: 10 }}>
                  <span className="eyebrow">Observed in Oral Practice</span>
                </div>
                <ul className="overview-list">
                  {dashboard.recurring_weaknesses.map((item, idx) => (
                    <li key={idx} className="overview-list-item">
                      <div className="overview-list-main">
                        <div className="question-item-header">
                          <span className="badge status-active" style={{ textTransform: "none" }}>
                            Missed {item.occurrences}×
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
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Simplified Professor Feedback Composer & Notes */}
        <div className="professor-feedback-col">
          <section className="card prof-composer-card">
            <span className="eyebrow">For Students</span>
            <h2 style={{ marginTop: 4, marginBottom: 6 }}>Leave feedback</h2>
            <p className="note" style={{ marginTop: 0, marginBottom: 16 }}>
              Share exam focus, grading expectations, or quick clarifications. Notes show up right beside matching questions.
            </p>

            <form onSubmit={(e) => void handleSubmitFeedback(e)}>
              <div className="field">
                <label htmlFor="prof-unified-target">1. Where should this appear?</label>
                <select
                  id="prof-unified-target"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                >
                  <option value="course">Entire course (Overview &amp; study workspace)</option>
                  {dashboard.question_coverage.length > 0 && (
                    <optgroup label="Specific exam question">
                      {dashboard.question_coverage.map((q) => (
                        <option key={`q-${q.question_id}`} value={`question:${q.question_id}`}>
                          Question {q.question_number} — {q.text.slice(0, 56)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {dashboard.topic_alignment.length > 0 && (
                    <optgroup label="Specific topic">
                      {dashboard.topic_alignment.map((t) => (
                        <option key={`t-${t.topic_id}`} value={`topic:${t.topic_id}`}>
                          Topic: {t.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <div className="field">
                <label>2. Type of feedback</label>
                <div className="prof-type-pills" role="radiogroup" aria-label="Feedback type">
                  {NOTE_TYPE_OPTIONS.slice(0, 3).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`prof-type-pill${category === opt.value ? " active" : ""}`}
                      onClick={() => setCategory(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label htmlFor="prof-feedback-title">Headline (optional)</label>
                <input
                  id="prof-feedback-title"
                  type="text"
                  maxLength={160}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Focus on strict 2PL and cascading aborts"
                />
              </div>

              <div className="field">
                <label htmlFor="prof-feedback-comment">3. Your guidance for students</label>
                <textarea
                  id="prof-feedback-comment"
                  rows={4}
                  required
                  maxLength={2000}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Write what students should pay attention to, common grading pitfalls, or missing slide details…"
                />
              </div>

              <div className="prof-composer-footer">
                <label className="professor-pin-toggle" style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={isPinned}
                    onChange={(e) => setIsPinned(e.target.checked)}
                  />
                  <span>Pin to course overview</span>
                </label>

                <button
                  type="submit"
                  className="btn"
                  disabled={savingFeedback || comment.trim().length < 4}
                >
                  {savingFeedback ? "Posting…" : "Post feedback"}
                </button>
              </div>
            </form>
          </section>

          <section className="card">
            <div className="section-header" style={{ marginBottom: 12 }}>
              <div className="section-title-group">
                <h2>Posted feedback</h2>
                <span className="count-pill">{dashboard.feedback.length}</span>
              </div>
            </div>

            {dashboard.feedback.length === 0 ? (
              <div className="empty">
                <span>
                  No feedback posted yet. Write your first note above and it will appear for students immediately.
                </span>
              </div>
            ) : (
              <ul className="professor-feedback-feed">
                {dashboard.feedback.map((item) => {
                  const meta = CATEGORY_META[item.category] ?? {
                    label: item.category,
                    badgeClass: "",
                  };
                  return (
                    <li
                      key={item.id}
                      className={`professor-feedback-item${item.is_pinned ? " is-pinned" : ""}`}
                    >
                      <div className="question-item-header">
                        <span
                          className={`badge ${meta.badgeClass}`}
                          style={{ textTransform: "none" }}
                        >
                          {meta.label}
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
                          {new Date(item.created_at).toLocaleDateString()}
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
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
