"use client";

import { useEffect, useState } from "react";
import { apiErrorMessage, knowledgeApi, questionsApi, type KnowledgeGraph, type Question } from "@/lib/api";
import { TopicGraph } from "./topic-graph";

export default function KnowledgePage({ params }: { params: { courseId: string } }) {
  const id = params.courseId;
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
    Promise.all([knowledgeApi.get(id), questionsApi.list(id)])
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
  }, [id]);

  async function generate(mode: "local" | "openrouter") {
    setGenerating(true);
    setError(null);
    try {
      const updated = await knowledgeApi.generate(id, mode);
      setGraph(updated);
      setQuestions(await questionsApi.list(id));
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setGenerating(false);
    }
  }

  const questionsById = new Map(questions.map((question) => [Number(question.id), question]));

  return (
    <main className="page container">
      <a href={`/courses/${id}`} className="btn secondary small">Back to course</a>
      <h1>Knowledge graph</h1>
      {graph && (
        <div className="card">
          <button type="button" className="btn" disabled={generating} onClick={() => void generate("local")}>
            Generate topics locally
          </button>
          {graph.openrouter_available && (
            <button type="button" className="btn secondary" disabled={generating}
              onClick={() => void generate("openrouter")}>
              Re-analyze topics with OpenRouter
            </button>
          )}
          {graph.openrouter_available && <p className="note">Sends selected course excerpts to OpenRouter; may incur a charge.</p>}
        </div>
      )}
      {loading && <p role="status" className="loading">Loading knowledge graph…</p>}
      {generating && <p role="status" className="loading">Generating topics…</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {graph && graph.topics.length > 0 && <TopicGraph key={id} topics={graph.topics} questions={questions} />}
      {graph?.topics.length === 0 && !generating && (
        <p className="empty">No sourced topics yet. Add course materials and generate topics.</p>
      )}
      {graph && graph.topics.length > 0 && <details className="card" style={{ marginTop: 16 }}>
        <summary>Browse topics as a list</summary>
      {graph.topics.map((topic) => (
        <section key={topic.id} className="card">
          <h2>{topic.name}</h2>
          {topic.description && <p>{topic.description}</p>}
          <h3>Exam questions</h3>
          {topic.question_ids.length === 0 ? (
            <p className="note">No linked exam questions.</p>
          ) : (
            <ul>
              {topic.question_ids.map((questionId) => {
                const question = questionsById.get(questionId);
                return question && <li key={questionId}>{question.text}</li>;
              })}
            </ul>
          )}
          <h3>Sources</h3>
          <ul className="course-list">
            {topic.sources.map((source) => (
              <li key={source.chunk_id} className="course-item">
                <div>
                  <p className="course-meta">
                    {source.file_name}
                    {source.page_number != null
                      ? ` · ${source.is_slide ? "slide" : "p."} ${source.page_number}`
                      : ""}
                    {source.start_seconds != null && source.end_seconds != null
                      ? ` · ${source.start_seconds}s–${source.end_seconds}s`
                      : ""}
                  </p>
                  <p style={{ whiteSpace: "pre-wrap" }}>{source.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      </details>}
    </main>
  );
}
