import re

from django.db import transaction
from rest_framework.exceptions import ValidationError

from exams.service import WORDS, tokens
from knowledge.service import phrases, serialize_source, source_chunks

from .models import Flashcard


CARDS_PER_GENERATION = 5


def course_cards(course_id):
    return Flashcard.objects.filter(source__in=source_chunks(course_id)).select_related(
        "source__material__source_material",
    ).order_by("pk")


def card_data(card):
    source = serialize_source(card.source)
    del source["text"]
    return {"id": card.pk, "front": card.front, "back": card.back, "source": source, "review_state": card.review_state}


def topic_targets(topic):
    linked_ids = topic.source_links.values("chunk_id")
    chunks = source_chunks(topic.course_id).filter(pk__in=linked_ids).order_by("pk")
    for chunk in chunks:
        target = next((label for key, label in phrases(chunk.text) if key == topic.normalized_name), None)
        if target:
            yield chunk, target


def oral_targets(session):
    saved_ids = session.sources.values("pk")
    chunks = {
        chunk.pk: chunk for chunk in source_chunks(session.course_id).filter(pk__in=saved_ids)
    }
    for turn in session.turns.order_by("turn_index"):
        feedback = turn.feedback
        cited = feedback["source_chunk_ids"]
        if not cited or not set(cited) <= chunks.keys():
            continue
        for point in feedback["missing_points"]:
            point_phrases = {key for key, _ in phrases(point)}
            point_tokens = tokens(point)
            for pk in cited:
                chunk = chunks[pk]
                # shortcut: lexical overlap can miss paraphrases; revisit if useful weaknesses routinely yield no cards.
                target = max((label for key, label in phrases(chunk.text) if key in point_phrases), key=len, default="")
                if not target:
                    target = max((word for word in WORDS.findall(chunk.text)
                                  if len(word) <= 120 and tokens(word) & point_tokens), key=len, default="")
                if target:
                    yield chunk, target


def cloze_fields(chunk, target):
    pattern = re.compile(rf"(?<!\w){re.escape(target)}(?!\w)", re.IGNORECASE)
    match = pattern.search(chunk.text)
    if not match:
        return None
    start = max(0, match.start() - 105)
    end = min(len(chunk.text), match.end() + 165)
    window = chunk.text[start:end].strip()
    if len(tokens(pattern.sub("", window))) < 3:
        return None
    front = ("…" if start else "") + pattern.sub("[…]", window) + ("…" if end < len(chunk.text) else "")
    return chunk.pk, front, match.group()


@transaction.atomic
def generate_cards(targets):
    cards = {}
    for chunk, target in targets:
        fields = cloze_fields(chunk, target)
        if fields is None or fields in cards:
            continue
        source_id, front, back = fields
        cards[fields], _ = Flashcard.objects.get_or_create(source_id=source_id, front=front, back=back)
        if len(cards) == CARDS_PER_GENERATION:
            break
    if not cards:
        raise ValidationError("No flashcards could be made from the available source text.")
    return list(cards.values())
