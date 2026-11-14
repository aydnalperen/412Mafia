"use client";

import { useEffect, useState } from "react";
import { FormattedSourceText } from "@/components/formatted-source";
import {
  apiErrorMessage,
  flashcardsApi,
  knowledgeApi,
  type Flashcard,
  type FlashcardRating,
} from "@/lib/api";
import { formatTimestampRange } from "@/lib/format";

const RATINGS: Record<FlashcardRating, string> = {
  known: "Known",
  review_again: "Review Again",
};

export function FlashcardsWorkspace({
  courseId,
  oralSession,
  onOpenKnowledge,
  onOpenOral,
}: {
  courseId: string;
  oralSession?: number | null;
  onOpenKnowledge?: () => void;
  onOpenOral?: () => void;
}) {
  const [cards, setCards] = useState<Flashcard[] | null>(null);
  const [topics, setTopics] = useState<{ id: number; name: string }[] | null>(
    null
  );
  const [topicId, setTopicId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [topicError, setTopicError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    flashcardsApi
      .list(courseId)
      .then((items) => {
        if (active) setCards(items);
      })
      .catch((err: unknown) => {
        if (active) setError(apiErrorMessage(err));
      });
    knowledgeApi
      .get(courseId)
      .then((graph) => {
        if (active) setTopics(graph.topics);
      })
      .catch((err: unknown) => {
        if (active) setTopicError(apiErrorMessage(err));
      });
    return () => {
      active = false;
    };
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
      setStatus(
        `${generated.length} flashcard${generated.length === 1 ? "" : "s"} ready to study.`
      );
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
      setCards(
        (current) =>
          current?.map((card) => (card.id === updated.id ? updated : card)) ??
          null
      );
      setStatus(`Marked ${RATINGS[rating]}.`);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="overview-stack">
      <section className="card">
        <div className="overview-section-header" style={{ marginBottom: 14 }}>
          <div>
            <p className="eyebrow">Active Recall</p>
            <h2>Generate source-backed flashcards</h2>
          </div>
          {oralSession ? (
            <button
              className="btn small"
              type="button"
              disabled={cards === null || pending}
              onClick={() => void generate({ oral_session_id: oralSession })}
            >
              Generate from missed concepts
            </button>
          ) : onOpenOral ? (
            <button
              type="button"
              className="btn small secondary"
              onClick={onOpenOral}
            >
              Open oral exam report
            </button>
          ) : null}
        </div>

        {topics && topics.length > 0 ? (
          <form
            className="actions"
            style={{ alignItems: "flex-end", gap: 12 }}
            onSubmit={(event) => {
              event.preventDefault();
              if (cards !== null && !pending && topicId) {
                void generate({ topic_id: Number(topicId) });
              }
            }}
          >
            <div className="field" style={{ flex: "1 1 280px", margin: 0 }}>
              <label htmlFor="flashcard-topic">Topic</label>
              <select
                id="flashcard-topic"
                value={topicId}
                onChange={(event) => setTopicId(event.target.value)}
              >
                <option value="">Choose a topic</option>
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="btn"
              type="submit"
              disabled={cards === null || pending || !topicId}
            >
              Generate from topic
            </button>
          </form>
        ) : topics?.length === 0 ? (
          <p className="note" style={{ margin: 0 }}>
            Generate sourced topics in the{" "}
            {onOpenKnowledge ? (
              <button
                type="button"
                className="link"
                style={{ background: "none", border: "none", padding: 0 }}
                onClick={onOpenKnowledge}
              >
                knowledge graph
              </button>
            ) : (
              <a className="link" href={`/courses/${courseId}/knowledge`}>
                knowledge graph
              </a>
            )}{" "}
            first.
          </p>
        ) : null}

        {topicError && (
          <p role="alert" className="error" style={{ marginTop: 12 }}>
            {topicError}
          </p>
        )}
      </section>

      {status && (
        <div role="status" className="callout-info">
          <span>{status}</span>
        </div>
      )}

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {cards === null && !error && (
        <div className="loading" role="status">
          <span className="spinner" aria-hidden="true" />
          <span>Loading flashcards…</span>
        </div>
      )}

      {cards?.length === 0 && (
        <div className="empty">
          <strong>No flashcards yet</strong>
          <p className="note" style={{ margin: 0 }}>
            Choose a course topic above or finish an oral exam report to turn
            weaknesses into study cards.
          </p>
        </div>
      )}

      {cards && cards.length > 0 && (
        <ul className="course-list questions-cards-grid">
          {cards.map((card) => {
            const timeRange = formatTimestampRange(
              card.source.start_seconds,
              card.source.end_seconds
            );
            const stateClass =
              card.review_state === "known"
                ? "status-ready"
                : card.review_state === "review_again"
                  ? "status-active"
                  : "";
            return (
              <li key={card.id} className="card">
                <div className="split-header" style={{ marginBottom: 10 }}>
                  <span className={`badge ${stateClass}`}>
                    <span className="badge-dot" aria-hidden="true" />
                    {card.review_state === "new"
                      ? "New"
                      : RATINGS[card.review_state]}
                  </span>
                  <span className="meta-chip">{card.source.file_name}</span>
                </div>

                <FormattedSourceText className="source-excerpt" text={card.front} />

                <details className="kg-details" style={{ marginTop: 14 }}>
                  <summary className="kg-details-summary">Reveal answer</summary>
                  <div className="kg-details-body">
                    <p style={{ margin: "0 0 10px" }}>
                      <strong>{card.back}</strong>
                    </p>
                    <p className="source-footer">
                      <span>{card.source.file_name}</span>
                      {card.source.page_number !== null && (
                        <span className="meta-chip mono">
                          {card.source.is_slide ? "Slide" : "p."}{" "}
                          {card.source.page_number}
                        </span>
                      )}
                      {timeRange && (
                        <span className="timestamp-chip">{timeRange}</span>
                      )}
                    </p>
                    <div className="actions" style={{ marginTop: 12 }}>
                      {(["known", "review_again"] as const).map((rating) => (
                        <button
                          key={rating}
                          type="button"
                          className="btn secondary small"
                          disabled={pending}
                          aria-pressed={card.review_state === rating}
                          onClick={() => void review(card.id, rating)}
                        >
                          {RATINGS[rating]}
                        </button>
                      ))}
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
