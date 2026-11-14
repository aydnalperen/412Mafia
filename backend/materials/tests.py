from django.core.exceptions import ValidationError
from django.test import TestCase

from courses.models import Course
from .models import Material
from .segments import TranscriptSegment, create_transcript_chunks


class TranscriptSegmentTests(TestCase):
    def setUp(self):
        self.material = Material.objects.create(
            course=Course.objects.create(name="Signals"), kind=Material.Kind.TRANSCRIPT,
            file="materials/example.srt",
        )

    def test_preserves_real_offsets_and_untimed_segments(self):
        chunks = create_transcript_chunks(self.material, [
            TranscriptSegment("First cue", 1.25, 2.5),
            TranscriptSegment("Second cue", 2.5, 3.0),
        ])
        self.assertEqual([(c.start_seconds, c.end_seconds) for c in chunks], [(1.25, 2.5), (2.5, 3.0)])
        self.material.refresh_from_db()
        self.assertEqual(self.material.status, Material.Status.READY)

    def test_rejects_bad_timestamps_without_partial_chunks(self):
        with self.assertRaises(ValidationError):
            create_transcript_chunks(self.material, [
                TranscriptSegment("First cue", 3, 4), TranscriptSegment("Wrong", 2, 5),
            ])
        self.assertFalse(self.material.chunks.exists())

    def test_rejects_unavailable_end_timestamp(self):
        with self.assertRaises(ValidationError):
            create_transcript_chunks(self.material, [TranscriptSegment("Cue", 1, None)])
