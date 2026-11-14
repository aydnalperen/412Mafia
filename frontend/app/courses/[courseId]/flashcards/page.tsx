"use client";

import { useEffect, useState } from "react";
import { apiErrorMessage, flashcardsApi, knowledgeApi, type Flashcard, type FlashcardRating } from "@/lib/api";

const RATINGS = { known: "Known", review_again: "Review Again" } as const;

export default function FlashcardsPage({ params, searchParams }: {
  params: { courseId: string };
  searchParams: { oralSession?: string | string[] };
}) {
  const session = typeof searchParams.oralSession === "string" ? Number(searchParams.oralSession) : NaN;
  const oralSession = Number.isSafeInteger(session) && session > 0 ? session : null;
  return <Flashcards key={params.courseId} courseId={params.courseId} oralSession={oralSession} />;
}

function Flashcards({ courseId, oralSession }: { courseId: string; oralSession: number | null }) {
  const [cards, setCards] = useState<Flashcard[] | null>(null);
  const [topics, setTopics] = useState<{ id: number; name: string }[] | null>(null);
  const [topicId, setTopicId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [topicError, setTopicError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    flashcardsApi.list(courseId)
      .then((items) => { if (active) setCards(items); })
      .catch((err: unknown) => { if (active) setError(apiErrorMessage(err)); });
    knowledgeApi.get(courseId)
      .then((graph) => { if (active) setTopics(graph.topics); })
      .catch((err: unknown) => { if (active) setTopicError(apiErrorMessage(err)); });
    return () => { active = false; };
  }, [courseId]);

  async function generate(origin: Parameters<typeof flashcardsApi.generate>[1]) {
    setPending(true);
    setStatus("Generating flashcards…");
    setError("");
    try {
      const generated = await flashcardsApi.generate(courseId, origin);
      setCards((current) => {
        const byId = new Map((current ?? []).map((card) => [card.id, card]));
        for (const card of generated) byId.set(card.id, card);
        return Array.from(byId.values());
      });
      setStatus(`${generated.length} flashcard${generated.length === 1 ? "" : "s"} ready to study.`);
    } catch (err) {
      setStatus("");
      setError(apiErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function review(cardId: number, rating: FlashcardRating) {
    setPending(true);
    setStatus("");
    setError("");
    try {
      const updated = await flashcardsApi.review(courseId, cardId, rating);
      setCards((current) => current?.map((card) => card.id === updated.id ? updated : card) ?? null);
      setStatus(`Marked ${RATINGS[rating]}.`);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="page container">
      <div className="page-nav">
        <a className="btn secondary small" href={`/courses/${courseId}`}>Back to course</a>
      </div>
      <div className="page-header">
        <h1>Flashcards</h1>
      </div>
      <section className="card">
        <h2>Generate flashcards</h2>
        {topics && topics.length > 0 && (
          <form onSubmit={(event) => {
            event.preventDefault();
            if (cards !== null && !pending && topicId) void generate({ topic_id: Number(topicId) });
          }}>
            <div className="field">
              <label htmlFor="flashcard-topic">Topic</label>
              <select id="flashcard-topic" value={topicId} onChange={(event) => setTopicId(event.target.value)}>
                <option value="">Choose a topic</option>
                {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
              </select>
            </div>
            <button className="btn" type="submit" disabled={cards === null || pending || !topicId}>Generate from topic</button>
          </form>
        )}
        {topics?.length === 0 && (
          <p>Generate sourced topics in the <a href={`/courses/${courseId}/knowledge`}>knowledge graph</a> first.</p>
        )}
        {topicError && <p role="alert" className="error">{topicError}</p>}
        {oralSession !== null ? (
          <button className="btn secondary" type="button" disabled={cards === null || pending}
            onClick={() => void generate({ oral_session_id: oralSession })}>
            Generate from missed concepts
          </button>
        ) : (
          <p className="note">Open a completed <a href={`/courses/${courseId}/oral`}>oral exam</a> report to practice missed concepts.</p>
        )}
      </section>
      <p role="status" className="course-meta">{status || (cards === null && !error ? "Loading flashcards…" : "")}</p>
      {error && <p role="alert" className="error">{error}</p>}
      {cards?.length === 0 && <p className="empty">No flashcards yet.</p>}
      {cards && cards.length > 0 && (
        <ul className="course-list">
          {cards.map((card) => (
            <li key={card.id} className="card">
              <p className="course-meta">{card.review_state === "new" ? "New" : RATINGS[card.review_state]}</p>
              <p className="source-excerpt">{card.front}</p>
              <details>
                <summary>Reveal answer</summary>
                <p><strong>{card.back}</strong></p>
                <p className="source-footer">
                  <span>{card.source.file_name}</span>
                  {card.source.page_number !== null && (
                    <span className="meta-chip mono">
                      {card.source.is_slide ? "Slide" : "p."} {card.source.page_number}
                    </span>
                  )}
                  {card.source.start_seconds !== null && card.source.end_seconds !== null && (
                    <span className="timestamp-chip">{card.source.start_seconds}s–{card.source.end_seconds}s</span>
                  )}
                </p>
                <div className="actions">
                  {(["known", "review_again"] as const).map((rating) => (
                    <button key={rating} type="button" className="btn secondary small" disabled={pending}
                      aria-pressed={card.review_state === rating} onClick={() => void review(card.id, rating)}>
                      {RATINGS[rating]}
                    </button>
                  ))}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
