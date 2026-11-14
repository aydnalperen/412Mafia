"""Shared timed/untimed transcript input for manual files and future STT jobs."""

from dataclasses import dataclass
from math import isfinite

from django.core.exceptions import ValidationError
from django.db import transaction

from .models import Material, SourceChunk


@dataclass(frozen=True)
class TranscriptSegment:
    text: str
    start_seconds: float | None = None
    end_seconds: float | None = None


@transaction.atomic
def create_transcript_chunks(material: Material, segments: list[TranscriptSegment]) -> list[SourceChunk]:
    if material.kind != Material.Kind.TRANSCRIPT or material.pk is None or material.chunks.exists():
        raise ValidationError("Expected a saved, unprocessed transcript material.")
    if not segments:
        raise ValidationError("Transcript must contain at least one segment.")
    chunks = []
    previous_start = 0.0
    for index, segment in enumerate(segments):
        if not segment.text.strip():
            raise ValidationError("Transcript segments cannot be empty.")
        start, end = segment.start_seconds, segment.end_seconds
        if (start is None) != (end is None):
            raise ValidationError("Both timestamps must be provided together.")
        if start is not None:
            if not (isfinite(start) and isfinite(end)) or start < previous_start or end <= start:
                raise ValidationError("Invalid or out-of-order transcript timestamps.")
            previous_start = start
        chunks.append(SourceChunk(material=material, sequence=index, text=segment.text.strip(), start_seconds=start, end_seconds=end))
    created = SourceChunk.objects.bulk_create(chunks)
    material.status = Material.Status.READY
    material.error = ""
    material.save(update_fields=["status", "error"])
    return created
