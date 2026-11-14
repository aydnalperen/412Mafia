"""Extract literal numbered exam questions and match only real same-course evidence."""

import math
import re
from collections import Counter
from pathlib import Path

from django.db import transaction

from materials.models import Material, SourceChunk

from .models import ExamQuestion, QuestionSourceLink

QUESTION = re.compile(r"^\s*(?:(?:Soru|Question|Q)\s*)?(\d{1,3})[.):\s-]+(\S.*)$", re.IGNORECASE)
SECTION = re.compile(r"^\s*([A-Z])[.)]\s+(.+\(\d+\s+points?\b.*\))\s*$", re.IGNORECASE)
SOLUTION = re.compile(r"^\s*(?:Solutions?|Answers?)\s*[.:]?\s*$", re.IGNORECASE)
WORDS = re.compile(r"[^\W_]+", re.UNICODE)
STOP = set("a an and are as at be by can do does for from how in is of on or the to what when where which why with "
           "all also any but could each have has if into its may more must not one only other our over per "
           "please point points should such than that their them there these this those through use used using well will would you your "
           "ve veya bir bu şu için ile nasıl nedir hangi olarak olur olan da de mi mı mu mü".split())


def tokens(text):
    return {word[:-1] if len(word) > 4 and word.endswith("s") and not word.endswith("ss") else word
            for word in WORDS.findall(text.casefold()) if len(word) >= 3 and word not in STOP and not word.isdigit()}


def extract_questions(material):
    if material.kind != Material.Kind.EXAM or material.status != Material.Status.READY:
        return
    if material.questions.exists():
        return
    chunks = list(material.chunks.order_by("sequence"))
    sections = any(SECTION.match(line) for chunk in chunks for line in chunk.text.splitlines())
    current = None
    found = []
    for chunk in chunks:
        for line in chunk.text.splitlines():
            match = SECTION.match(line) if sections else QUESTION.match(line)
            if match:
                if current:
                    found.append(current)
                current = ExamQuestion(course=material.course, material=material,
                                       question_number=match[1], text=match[2], page_number=chunk.page_number)
            elif current and SOLUTION.match(line):
                found.append(current)
                current = None
            elif current and line.strip():
                current.text += "\n" + line.strip()
    if current:
        found.append(current)
    with transaction.atomic():
        if not material.questions.exists():
            ExamQuestion.objects.bulk_create(found)


def sources_for(question):
    query = tokens(question.text)
    heading = tokens(question.text.splitlines()[0]) if question.question_number.isalpha() else set()
    candidates = list(SourceChunk.objects.filter(
        material__course_id=question.course_id, material__status=Material.Status.READY,
        material__kind__in=[Material.Kind.TRANSCRIPT, Material.Kind.SLIDES, Material.Kind.STUDY],
    ).select_related("material"))
    documents = [(chunk, tokens(chunk.text)) for chunk in candidates]
    frequency = Counter(word for _, words in documents for word in words)
    ranked = []
    if len(query) >= 2:
        for chunk, words in documents:
            overlap = query & words
            if len(overlap) < (3 if heading else 2) or (heading and not heading & words):
                continue
            score = round(sum(math.log((len(documents) + 1) / (frequency[word] + 1)) + 1 for word in overlap)
                          / math.sqrt(len(words) or 1), 4)
            if score < 0.8:
                continue
            ranked.append((score, chunk, ", ".join(sorted(overlap)[:5])))
    ranked.sort(key=lambda item: (-item[0], item[1].pk))
    best = ranked[:5]
    ids = [chunk.pk for _, chunk, _ in best]
    with transaction.atomic():
        QuestionSourceLink.objects.filter(question=question).exclude(chunk_id__in=ids).delete()
        existing = {link.chunk_id: link for link in QuestionSourceLink.objects.filter(question=question)}
        for score, chunk, reason in best:
            link = existing.get(chunk.pk)
            if link is None:
                QuestionSourceLink.objects.create(question=question, chunk=chunk, score=score,
                                                  reason=f"Shared terms: {reason}", method="keyword-idf")
            elif link.score != score or link.reason != f"Shared terms: {reason}":
                link.score, link.reason = score, f"Shared terms: {reason}"
                link.save(update_fields=["score", "reason"])
    return [{"chunk_id": chunk.pk, "text": chunk.text, "material_title": Path(chunk.material.file.name).name,
             "material_kind": chunk.material.kind, "page_number": chunk.page_number,
             "start_seconds": chunk.start_seconds, "end_seconds": chunk.end_seconds,
             "score": score, "reason": f"Shared terms: {reason}", "method": "keyword-idf"}
            for score, chunk, reason in best]
