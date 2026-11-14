"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { TopicGraph } from "@/app/courses/[courseId]/knowledge/topic-graph";
import { FlashcardsWorkspace } from "@/components/course/flashcards-workspace";
import { KnowledgeWorkspace } from "@/components/course/knowledge-workspace";
import { MaterialsWorkspace } from "@/components/course/materials-workspace";
import { OralWorkspace } from "@/components/course/oral-workspace";
import { QuestionsWorkspace } from "@/components/course/questions-workspace";
import {
  apiErrorMessage,
  coursesApi,
  knowledgeApi,
  materialsApi,
  questionsApi,
  recordingsApi,
  type Course,
  type KnowledgeGraph,
  type Material,
  type Question,
  type TranscriptSegment,
  type TranscriptionJob,
} from "@/lib/api";
import {
  formatTimestampRange,
  formatTranscriptParagraphs,
  splitQuestionTitleAndBody,
} from "@/lib/format";

type CourseTab =
  | "overview"
  | "knowledge"
  | "materials"
  | "questions"
  | "oral"
  | "flashcards";

const VALID_TABS: CourseTab[] = [
  "overview",
  "knowledge",
  "materials",
  "questions",
  "oral",
  "flashcards",
];

function isValidTab(value: string | null): value is CourseTab {
  return value !== null && VALID_TABS.includes(value as CourseTab);
}

function isJobActive(job: TranscriptionJob | null): boolean {
  return (
    job !== null &&
    (job.status === "queued" ||
      job.status === "extracting_audio" ||
      job.status === "transcribing" ||
      job.status === "indexing")
  );
}

export default function CoursePage({
  params,
}: {
  params: { courseId: string };
}) {
  const id = params.courseId;
  const [activeTab, setActiveTab] = useState<CourseTab>("overview");
  const [selectedTranscriptId, setSelectedTranscriptId] = useState<
    string | number | null
  >(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<
    string | number | null
  >(null);
  const [selectedOralSessionId, setSelectedOralSessionId] = useState<
    number | null
  >(null);

  const [course, setCourse] = useState<Course | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [latestJob, setLatestJob] = useState<TranscriptionJob | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [transcriptPreview, setTranscriptPreview] = useState<{
    materialId: string | number;
    fileName: string;
    segments: TranscriptSegment[];
  } | null>(null);
  const [generatingGraph, setGeneratingGraph] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const paramsFromUrl = new URLSearchParams(window.location.search);
    const requestedTab = paramsFromUrl.get("tab");
    if (isValidTab(requestedTab)) {
      setActiveTab(requestedTab);
    }
    const rawSession = Number(paramsFromUrl.get("oralSession"));
    if (Number.isSafeInteger(rawSession) && rawSession > 0) {
      setSelectedOralSessionId(rawSession);
    }
  }, []);

  const switchTab = useCallback(
    (
      nextTab: CourseTab,
      options?: {
        transcriptMaterialId?: string | number | null;
        questionId?: string | number | null;
        oralSessionId?: number | null;
      }
    ) => {
      if (options?.transcriptMaterialId !== undefined) {
        setSelectedTranscriptId(options.transcriptMaterialId);
      }
      if (options?.questionId !== undefined) {
        setSelectedQuestionId(options.questionId);
      }
      if (options?.oralSessionId !== undefined) {
        setSelectedOralSessionId(options.oralSessionId);
      }
      setActiveTab(nextTab);
      if (typeof window !== "undefined") {
        const nextUrl =
          nextTab === "overview"
            ? `/courses/${id}`
            : `/courses/${id}?tab=${nextTab}`;
        window.history.replaceState(null, "", nextUrl);
      }
    },
    [id]
  );

  const refreshCourseOverview = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setLoading(true);
      }
      setError(null);
      try {
        const [courseData, materialList, jobList, questionList, graphData] =
          await Promise.all([
            coursesApi.get(id),
            materialsApi.list(id),
            recordingsApi.list(id),
            questionsApi.list(id),
            knowledgeApi.get(id),
          ]);
        setCourse(courseData);
        setMaterials(materialList);
        const latest = jobList[0] ?? null;
        setLatestJob(latest);
        setQuestions(questionList);
        setGraph(graphData);

        const primaryTranscript =
          (latest?.output_material_id
            ? materialList.find((item) => item.id === latest.output_material_id)
            : undefined) ??
          materialList.find((item) => item.kind === "transcript");

        if (primaryTranscript) {
          try {
            const segments = await materialsApi.transcript(primaryTranscript.id);
            setTranscriptPreview({
              materialId: primaryTranscript.id,
              fileName: primaryTranscript.file_name,
              segments,
            });
          } catch {
            setTranscriptPreview(null);
          }
        } else {
          setTranscriptPreview(null);
        }
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    void refreshCourseOverview();
  }, [refreshCourseOverview]);

  async function handleGenerateGraph(mode: "local" | "openrouter") {
    setGeneratingGraph(true);
    setGraphError(null);
    try {
      const next = await knowledgeApi.generate(id, mode);
      setGraph(next);
    } catch (err) {
      setGraphError(apiErrorMessage(err));
    } finally {
      setGeneratingGraph(false);
    }
  }

  const topics = graph?.topics ?? [];
  const openRouterAvailable = graph?.openrouter_available ?? false;
  const readyMaterialsCount = materials.filter(
    (item) => item.status === "ready"
  ).length;
  const transcriptCount = materials.filter(
    (item) => item.kind === "transcript"
  ).length;
  const firstSegmentRange = transcriptPreview?.segments[0]
    ? formatTimestampRange(
        transcriptPreview.segments[0].start_seconds,
        transcriptPreview.segments[0].end_seconds
      )
    : null;
  const transcriptParagraphs = transcriptPreview
    ? formatTranscriptParagraphs(
        transcriptPreview.segments.map((segment) => segment.text).join("\n\n")
      )
    : [];

  return (
    <main className="page container">
      <nav className="page-nav">
        <Link href="/courses" className="btn secondary small">
          &larr; All courses
        </Link>
      </nav>

      {loading && (
        <div className="loading">
          <span className="spinner" aria-hidden="true" />
          <span>Loading course details…</span>
        </div>
      )}

      {error ? (
        <div className="error" role="alert">
          <span>{apiErrorMessage(error)}</span>
        </div>
      ) : null}

      {course && (
        <>
          <section className="course-cockpit-header">
            <div className="course-cockpit-top">
              <div className="course-cockpit-title-block">
                <p className="eyebrow">Course workspace</p>
                <h1>{course.name}</h1>
                {course.description ? (
                  <p className="course-cockpit-desc">{course.description}</p>
                ) : (
                  <p className="course-cockpit-desc">
                    Visualize how course topics connect to lecture transcripts,
                    slides, past exam questions, and oral practice sessions.
                  </p>
                )}
              </div>

              <div className="course-stats-strip" aria-label="Course summary">
                <span className="course-stat-pill">
                  <strong>{topics.length}</strong> topics
                </span>
                <span className="course-stat-pill">
                  <strong>{readyMaterialsCount}</strong>/{materials.length} materials ready
                </span>
                <span className="course-stat-pill">
                  <strong>{transcriptCount}</strong> transcripts
                </span>
                <span className="course-stat-pill">
                  <strong>{questions.length}</strong> exam questions
                </span>
              </div>
            </div>

            <div className="course-tabs" role="tablist" aria-label="Course sections">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "overview"}
                className={`course-tab${activeTab === "overview" ? " active" : ""}`}
                onClick={() => {
                  switchTab("overview");
                  void refreshCourseOverview({ silent: true });
                }}
              >
                Overview
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "knowledge"}
                className={`course-tab${activeTab === "knowledge" ? " active" : ""}`}
                onClick={() => switchTab("knowledge")}
              >
                Knowledge graph
                <span className="course-tab-count">{topics.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "materials"}
                className={`course-tab${activeTab === "materials" ? " active" : ""}`}
                onClick={() => switchTab("materials")}
              >
                Materials &amp; transcript
                <span className="course-tab-count">{materials.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "questions"}
                className={`course-tab${activeTab === "questions" ? " active" : ""}`}
                onClick={() => switchTab("questions")}
              >
                Exam questions
                <span className="course-tab-count">{questions.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "oral"}
                className={`course-tab${activeTab === "oral" ? " active" : ""}`}
                onClick={() => switchTab("oral")}
              >
                Oral exam
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "flashcards"}
                className={`course-tab${activeTab === "flashcards" ? " active" : ""}`}
                onClick={() => switchTab("flashcards")}
              >
                Flashcards
              </button>
            </div>
          </section>

          {activeTab === "overview" && (
            <div className="overview-stack">
              <section
                className="overview-section"
                aria-label="Knowledge graph visualization"
              >
                <div className="overview-section-header">
                  <div>
                    <p className="eyebrow">Knowledge visualization</p>
                    <h2>Course knowledge graph</h2>
                  </div>
                  <div className="actions">
                    <button
                      type="button"
                      className="btn secondary small"
                      disabled={generatingGraph}
                      onClick={() => void handleGenerateGraph("local")}
                    >
                      {generatingGraph
                        ? "Analyzing…"
                        : topics.length > 0
                          ? "Refresh locally"
                          : "Generate topics locally"}
                    </button>
                    {openRouterAvailable ? (
                      <button
                        type="button"
                        className="btn small"
                        disabled={generatingGraph}
                        onClick={() => void handleGenerateGraph("openrouter")}
                      >
                        {generatingGraph
                          ? "Analyzing…"
                          : topics.length > 0
                            ? "Re-analyze with OpenRouter"
                            : "Analyze with OpenRouter"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={() => switchTab("knowledge")}
                    >
                      Topic details
                    </button>
                  </div>
                </div>

                {graphError ? (
                  <div className="error" role="alert">
                    <span>{graphError}</span>
                  </div>
                ) : null}

                {topics.length > 0 ? (
                  <TopicGraph topics={topics} questions={questions} />
                ) : (
                  <div className="empty">
                    <strong>No knowledge graph generated yet</strong>
                    <p className="note">
                      {materials.length > 0
                        ? "Your course already has materials indexed. Generate topics to visualize how lecture concepts, slides, and exam questions connect."
                        : "Upload lecture recordings, transcripts, slides, or past exams first, then generate the knowledge graph."}
                    </p>
                  </div>
                )}
              </section>

              <div className="overview-split-grid">
                <section
                  className="card overview-panel"
                  aria-label="Course materials and transcript"
                >
                  <div className="overview-section-header">
                    <div>
                      <p className="eyebrow">Sources &amp; lectures</p>
                      <h2>Materials &amp; transcript</h2>
                    </div>
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={() => switchTab("materials")}
                    >
                      Upload &amp; manage
                    </button>
                  </div>

                  {isJobActive(latestJob) && latestJob ? (
                    <div className="callout-info">
                      <span>
                        <strong>Transcription {latestJob.status}:</strong>{" "}
                        {latestJob.progress}% complete. Open{" "}
                        <strong>Materials &amp; transcript</strong> to monitor
                        progress.
                      </span>
                    </div>
                  ) : null}

                  {transcriptPreview && transcriptPreview.segments.length > 0 ? (
                    <div className="overview-transcript-preview">
                      <div className="overview-section-header">
                        <div>
                          <span className="badge status-ready">Transcript</span>{" "}
                          <strong>{transcriptPreview.fileName}</strong>
                          <span className="note" style={{ marginLeft: 8 }}>
                            {transcriptPreview.segments.length} segments
                            {firstSegmentRange
                              ? ` · starts at ${firstSegmentRange}`
                              : ""}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="btn secondary small"
                          onClick={() =>
                            switchTab("materials", {
                              transcriptMaterialId: transcriptPreview.materialId,
                            })
                          }
                        >
                          Read full transcript
                        </button>
                      </div>
                      <div className="overview-transcript-paragraphs">
                        {transcriptParagraphs.slice(0, 3).map((paragraph, idx) => (
                          <p key={idx}>{paragraph}</p>
                        ))}
                        {transcriptParagraphs.length > 3 ? (
                          <p className="note">
                            +{transcriptParagraphs.length - 3} more formatted
                            paragraphs in full reader…
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {materials.length === 0 ? (
                    <div className="empty">
                      <span>
                        No materials uploaded yet. Open{" "}
                        <strong>Materials &amp; transcript</strong> to add
                        recordings, slides, transcripts, or past exams.
                      </span>
                    </div>
                  ) : (
                    <div className="overview-list">
                      {materials.slice(0, 6).map((material) => (
                        <div key={material.id} className="overview-list-item">
                          <div className="overview-list-main">
                            <div className="overview-list-title">
                              {material.file_name}
                            </div>
                            <div className="actions">
                              <span className="badge kind-badge">
                                {material.kind}
                              </span>
                              <span className="meta-chip">{material.status}</span>
                            </div>
                          </div>
                          {material.kind === "transcript" ? (
                            <button
                              type="button"
                              className="btn secondary small"
                              onClick={() =>
                                switchTab("materials", {
                                  transcriptMaterialId: material.id,
                                })
                              }
                            >
                              Read
                            </button>
                          ) : null}
                        </div>
                      ))}
                      {materials.length > 6 ? (
                        <p className="note">
                          Showing 6 of {materials.length} materials.{" "}
                          <button
                            type="button"
                            className="btn secondary small"
                            onClick={() => switchTab("materials")}
                          >
                            View all
                          </button>
                        </p>
                      ) : null}
                    </div>
                  )}
                </section>

                <section
                  className="card overview-panel"
                  aria-label="Exam questions and oral practice"
                >
                  <div className="overview-section-header">
                    <div>
                      <p className="eyebrow">Assessment</p>
                      <h2>Exam questions</h2>
                    </div>
                    <div className="actions">
                      <button
                        type="button"
                        className="btn secondary small"
                        onClick={() => switchTab("questions")}
                      >
                        All questions
                      </button>
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => switchTab("oral")}
                      >
                        Start oral exam
                      </button>
                    </div>
                  </div>

                  {questions.length === 0 ? (
                    <div className="empty">
                      <span>
                        No exam questions extracted yet. Upload a past exam in{" "}
                        <strong>Materials &amp; transcript</strong> to extract
                        sourced questions and unlock oral exam practice.
                      </span>
                    </div>
                  ) : (
                    <div className="overview-list">
                      {questions.slice(0, 6).map((question) => {
                        const { title, body } = splitQuestionTitleAndBody(
                          question.text
                        );
                        const headline = title || body;
                        return (
                          <div key={question.id} className="overview-list-item">
                            <div className="overview-list-main">
                              <div className="overview-list-title">
                                {question.question_number
                                  ? `Q${question.question_number}. `
                                  : ""}
                                {headline.length > 110
                                  ? `${headline.slice(0, 110)}…`
                                  : headline}
                              </div>
                              {title && body ? (
                                <p className="overview-list-snippet">
                                  {body.length > 140
                                    ? `${body.slice(0, 140)}…`
                                    : body}
                                </p>
                              ) : null}
                              <div className="note">
                                {question.material_title}
                                {question.page_number !== null
                                  ? ` · p. ${question.page_number}`
                                  : ""}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="btn secondary small"
                              onClick={() =>
                                switchTab("questions", { questionId: question.id })
                              }
                            >
                              Sources
                            </button>
                          </div>
                        );
                      })}
                      {questions.length > 6 ? (
                        <p className="note">
                          Showing 6 of {questions.length} exam questions.
                        </p>
                      ) : null}
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}

          {activeTab === "knowledge" && (
            <KnowledgeWorkspace
              courseId={id}
              onGraphChanged={(nextGraph) => {
                setGraph(nextGraph);
              }}
            />
          )}

          {activeTab === "materials" && (
            <MaterialsWorkspace
              courseId={id}
              initialTranscriptMaterialId={selectedTranscriptId}
              onMaterialsChanged={() => {
                void refreshCourseOverview({ silent: true });
              }}
            />
          )}

          {activeTab === "questions" && (
            <QuestionsWorkspace
              courseId={id}
              initialQuestionId={selectedQuestionId}
              onStartOralExam={() => switchTab("oral")}
              onOpenMaterials={() => switchTab("materials")}
            />
          )}

          {activeTab === "oral" && (
            <OralWorkspace
              courseId={id}
              onOpenQuestions={(questionId) =>
                switchTab("questions", { questionId })
              }
              onOpenMaterials={() => switchTab("materials")}
              onPracticeMissedConcepts={(sessionId) =>
                switchTab("flashcards", {
                  oralSessionId: Number(sessionId),
                })
              }
            />
          )}

          {activeTab === "flashcards" && (
            <FlashcardsWorkspace
              courseId={id}
              oralSession={selectedOralSessionId}
              onOpenKnowledge={() => switchTab("knowledge")}
              onOpenOral={() => switchTab("oral")}
            />
          )}
        </>
      )}
    </main>
  );
}
