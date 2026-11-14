"use client";

import { useEffect, useRef, useState } from "react";
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

type FlashcardFilter = "all" | "to_review" | "known";
type StudyViewMode = "deck" | "grid";

const BLANK_PATTERN = /(\[…\]|\[\.\.\.\])/g;

function cleanFrontCopy(text: string): string {
  return text
    .replace(/[\uf000-\uf8ff≣]/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function FlashcardPrompt({
  front,
  back,
  revealed,
}: {
  front: string;
  back: string;
  revealed: boolean;
}) {
  const cleaned = cleanFrontCopy(front);
  const hasBlank = /(\[…\]|\[\.\.\.\])/.test(cleaned);

  if (!hasBlank) {
    return <p className="flashcard-question-text">{cleaned}</p>;
  }

  const parts = cleaned.split(BLANK_PATTERN);
  return (
    <p className="flashcard-cloze-text">
      {parts.map((part, index) => {
        if (part === "[…]" || part === "[...]") {
          return (
            <span
              key={index}
              className={`flashcard-blank${revealed ? " filled" : ""}`}
            >
              {revealed ? back : "________"}
            </span>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </p>
  );
}

function FlashcardSourceFooter({ card }: { card: Flashcard }) {
  const timeRange = formatTimestampRange(
    card.source.start_seconds,
    card.source.end_seconds
  );
  return (
    <div className="flashcard-source-meta">
      <span className="meta-chip">{card.source.file_name}</span>
      {card.source.page_number !== null && (
        <span className="meta-chip mono">
          {card.source.is_slide ? "Slide" : "p."} {card.source.page_number}
        </span>
      )}
      {timeRange && <span className="timestamp-chip">{timeRange}</span>}
    </div>
  );
}

export function FlashcardsWorkspace({
  courseId,
  oralSession,
  onOpenKnowledge,
  onOpenOral,
  onCardsChanged,
}: {
  courseId: string;
  oralSession?: number | null;
  onOpenKnowledge?: () => void;
  onOpenOral?: () => void;
  onCardsChanged?: (cards: Flashcard[]) => void;
}) {
  const [cards, setCards] = useState<Flashcard[] | null>(null);
  const [topics, setTopics] = useState<{ id: number; name: string }[] | null>(
    null
  );
  const [topicId, setTopicId] = useState("");
  const [filter, setFilter] = useState<FlashcardFilter>("all");
  const [viewMode, setViewMode] = useState<StudyViewMode>("deck");
  const [deckIndex, setDeckIndex] = useState(0);
  const [revealedIds, setRevealedIds] = useState<Record<number, boolean>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [topicError, setTopicError] = useState("");
  const [status, setStatus] = useState("");
  const onCardsChangedRef = useRef(onCardsChanged);
  onCardsChangedRef.current = onCardsChanged;

  useEffect(() => {
    let active = true;
    flashcardsApi
      .list(courseId)
      .then((items) => {
        if (!active) return;
        setCards(items);
        onCardsChangedRef.current?.(items);
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
        const merged = Array.from(byId.values());
        onCardsChangedRef.current?.(merged);
        return merged;
      });
      setFilter("all");
      setDeckIndex(0);
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

  async function review(
    cardId: number,
    rating: FlashcardRating,
    options?: { advanceDeck?: boolean; visibleCount?: number }
  ) {
    setPending(true);
    setStatus("");
    setError("");
    try {
      const updated = await flashcardsApi.review(courseId, cardId, rating);
      setCards((current) => {
        const next =
          current?.map((card) => (card.id === updated.id ? updated : card)) ??
          null;
        if (next) onCardsChangedRef.current?.(next);
        return next;
      });
      setStatus(`Marked ${RATINGS[rating]}.`);
      if (options?.advanceDeck && (options.visibleCount ?? 0) > 1) {
        setDeckIndex((idx) => (idx + 1) % (options.visibleCount ?? 1));
      }
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  function toggleReveal(cardId: number) {
    setRevealedIds((prev) => ({ ...prev, [cardId]: !prev[cardId] }));
  }

  const allCards = cards ?? [];
  const knownCount = allCards.filter(
    (card) => card.review_state === "known"
  ).length;
  const reviewAgainCount = allCards.filter(
    (card) => card.review_state === "review_again"
  ).length;
  const toReviewCount = allCards.length - knownCount;
  const masteryPercent =
    allCards.length > 0 ? Math.round((knownCount / allCards.length) * 100) : 0;

  const visibleCards = allCards.filter((card) => {
    if (filter === "known") return card.review_state === "known";
    if (filter === "to_review") return card.review_state !== "known";
    return true;
  });

  const safeDeckIndex =
    visibleCards.length > 0 ? Math.min(deckIndex, visibleCards.length - 1) : 0;
  const activeCard =
    visibleCards.length > 0 ? visibleCards[safeDeckIndex] : null;

  return (
    <div className="overview-stack">
      <section className="card flashcards-controls-card">
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
          ) : (
            <a className="btn small secondary" href={`/courses/${courseId}/oral`}>
              Open oral exam report
            </a>
          )}
        </div>

        {topics && topics.length > 0 ? (
          <form
            className="flashcards-generate-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (cards !== null && !pending && topicId) {
                void generate({ topic_id: Number(topicId) });
              }
            }}
          >
            <div className="field flashcards-topic-field">
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
              {pending ? "Generating…" : "Generate flashcards"}
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

      {cards && cards.length === 0 && (
        <div className="empty">
          <strong>No flashcards yet</strong>
          <p className="note" style={{ margin: 0 }}>
            Choose a course topic above or finish an oral exam report to turn
            missed concepts into study cards.
          </p>
        </div>
      )}

      {cards && cards.length > 0 && (
        <>
          <section className="card flashcards-summary" aria-label="Study progress">
            <div className="flashcards-summary-top">
              <div className="flashcards-stats">
                <span className="course-stat-pill">
                  <strong>{cards.length}</strong> total
                </span>
                <span className="course-stat-pill">
                  <strong>{knownCount}</strong> known ({masteryPercent}%)
                </span>
                <span className="course-stat-pill">
                  <strong>{reviewAgainCount}</strong> review again
                </span>
              </div>

              <div className="flashcards-toolbar-right">
                <div
                  className="flashcards-filters"
                  role="group"
                  aria-label="Filter flashcards"
                >
                  <button
                    type="button"
                    className={`flashcard-filter-btn${filter === "all" ? " active" : ""}`}
                    onClick={() => {
                      setFilter("all");
                      setDeckIndex(0);
                    }}
                  >
                    All ({cards.length})
                  </button>
                  <button
                    type="button"
                    className={`flashcard-filter-btn${filter === "to_review" ? " active" : ""}`}
                    onClick={() => {
                      setFilter("to_review");
                      setDeckIndex(0);
                    }}
                  >
                    To study ({toReviewCount})
                  </button>
                  <button
                    type="button"
                    className={`flashcard-filter-btn${filter === "known" ? " active" : ""}`}
                    onClick={() => {
                      setFilter("known");
                      setDeckIndex(0);
                    }}
                  >
                    Known ({knownCount})
                  </button>
                </div>

                <div
                  className="flashcards-filters"
                  role="group"
                  aria-label="Flashcards layout"
                >
                  <button
                    type="button"
                    className={`flashcard-filter-btn${viewMode === "deck" ? " active" : ""}`}
                    onClick={() => setViewMode("deck")}
                  >
                    Study deck
                  </button>
                  <button
                    type="button"
                    className={`flashcard-filter-btn${viewMode === "grid" ? " active" : ""}`}
                    onClick={() => setViewMode("grid")}
                  >
                    All cards
                  </button>
                </div>
              </div>
            </div>

            <div className="flashcards-progress-track" aria-hidden="true">
              <div
                className="flashcards-progress-fill"
                style={{ width: `${masteryPercent}%` }}
              />
            </div>
          </section>

          {visibleCards.length === 0 ? (
            <div className="empty">
              <span>No flashcards match this filter.</span>
            </div>
          ) : viewMode === "deck" && activeCard ? (
            <section className="flashcard-deck-stage" aria-label="Study card">
              <div className="card flashcard-deck-card">
                <div className="flashcard-card-top">
                  <div className="actions">
                    <span className="question-num-badge tabular">
                      Card {safeDeckIndex + 1} / {visibleCards.length}
                    </span>
                    <span
                      className={`badge ${
                        activeCard.review_state === "known"
                          ? "status-ready"
                          : activeCard.review_state === "review_again"
                            ? "status-active"
                            : ""
                      }`}
                    >
                      <span className="badge-dot" aria-hidden="true" />
                      {activeCard.review_state === "new"
                        ? "New"
                        : RATINGS[activeCard.review_state]}
                    </span>
                  </div>
                  <FlashcardSourceFooter card={activeCard} />
                </div>

                <div className="flashcard-deck-body">
                  <span className="flashcard-side-label">Prompt</span>
                  <FlashcardPrompt
                    front={activeCard.front}
                    back={activeCard.back}
                    revealed={!!revealedIds[activeCard.id]}
                  />
                </div>

                {revealedIds[activeCard.id] && (
                  <div className="flashcard-answer-panel">
                    <span className="flashcard-answer-label">Answer</span>
                    <p className="flashcard-answer-text">{activeCard.back}</p>
                  </div>
                )}

                <div className="flashcard-deck-footer">
                  <div className="actions">
                    <button
                      type="button"
                      className="btn secondary small"
                      disabled={visibleCards.length <= 1}
                      onClick={() =>
                        setDeckIndex(
                          (idx) =>
                            (idx - 1 + visibleCards.length) %
                            visibleCards.length
                        )
                      }
                    >
                      &larr; Previous
                    </button>
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={() => toggleReveal(activeCard.id)}
                    >
                      {revealedIds[activeCard.id]
                        ? "Hide answer"
                        : "Show answer"}
                    </button>
                    <button
                      type="button"
                      className="btn secondary small"
                      disabled={visibleCards.length <= 1}
                      onClick={() =>
                        setDeckIndex((idx) => (idx + 1) % visibleCards.length)
                      }
                    >
                      Next &rarr;
                    </button>
                  </div>

                  <div className="actions">
                    <button
                      type="button"
                      className="btn secondary small flashcard-rate-btn review_again"
                      disabled={pending}
                      aria-pressed={activeCard.review_state === "review_again"}
                      onClick={() =>
                        void review(activeCard.id, "review_again", {
                          advanceDeck: true,
                          visibleCount: visibleCards.length,
                        })
                      }
                    >
                      Review Again
                    </button>
                    <button
                      type="button"
                      className="btn secondary small flashcard-rate-btn known"
                      disabled={pending}
                      aria-pressed={activeCard.review_state === "known"}
                      onClick={() =>
                        void review(activeCard.id, "known", {
                          advanceDeck: true,
                          visibleCount: visibleCards.length,
                        })
                      }
                    >
                      Known
                    </button>
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <ul className="course-list flashcards-grid">
              {visibleCards.map((card, idx) => {
                const isRevealed = !!revealedIds[card.id];
                const stateClass =
                  card.review_state === "known"
                    ? "status-ready"
                    : card.review_state === "review_again"
                      ? "status-active"
                      : "";
                return (
                  <li key={card.id} className="card flashcard-card">
                    <div className="flashcard-card-top">
                      <div className="actions">
                        <span className="question-num-badge tabular">
                          #{idx + 1}
                        </span>
                        <span className={`badge ${stateClass}`}>
                          <span className="badge-dot" aria-hidden="true" />
                          {card.review_state === "new"
                            ? "New"
                            : RATINGS[card.review_state]}
                        </span>
                      </div>
                      <FlashcardSourceFooter card={card} />
                    </div>

                    <div className="flashcard-prompt">
                      <FlashcardPrompt
                        front={card.front}
                        back={card.back}
                        revealed={isRevealed}
                      />
                    </div>

                    {isRevealed && (
                      <div className="flashcard-answer-panel">
                        <span className="flashcard-answer-label">Answer</span>
                        <p className="flashcard-answer-text">{card.back}</p>
                      </div>
                    )}

                    <div className="flashcard-card-actions">
                      <button
                        type="button"
                        className="btn secondary small"
                        onClick={() => toggleReveal(card.id)}
                      >
                        {isRevealed ? "Hide answer" : "Show answer"}
                      </button>
                      <div className="actions">
                        {(["review_again", "known"] as const).map((rating) => (
                          <button
                            key={rating}
                            type="button"
                            className={`btn secondary small flashcard-rate-btn ${rating}`}
                            disabled={pending}
                            aria-pressed={card.review_state === rating}
                            onClick={() => void review(card.id, rating)}
                          >
                            {RATINGS[rating]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
