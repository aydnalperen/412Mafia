import tempfile
from io import BytesIO
from unittest.mock import patch

import fitz
from pptx import Presentation
from pptx.util import Inches
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.test.utils import override_settings

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


class UploadTests(TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        settings = override_settings(MEDIA_ROOT=self.directory.name)
        settings.enable()
        self.addCleanup(settings.disable)
        self.course = Course.objects.create(name="Signals")
        self.url = f"/api/courses/{self.course.pk}/materials/"

    def upload(self, filename, contents, kind):
        return self.client.post(self.url, {"kind": kind, "file": SimpleUploadedFile(filename, contents)})

    @staticmethod
    def pdf(*pages):
        document = fitz.open()
        for text in pages:
            page = document.new_page()
            if text:
                page.insert_text((50, 50), text)
        result = document.tobytes()
        document.close()
        return result

    @staticmethod
    def pptx(*pages):
        presentation = Presentation()
        for content in pages:
            slide = presentation.slides.add_slide(presentation.slide_layouts[6])
            if content:
                textbox = slide.shapes.add_textbox(Inches(1), Inches(1), Inches(5), Inches(2))
                textbox.text = content
        output = BytesIO()
        presentation.save(output)
        return output.getvalue()

    def test_pdf_pages_and_duplicate_are_preserved(self):
        contents = self.pdf("First slide about sampling and frequency", "Second slide about aliasing and filters")
        response = self.upload("../../slides.pdf", contents, "slides")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["status"], "ready")
        self.assertEqual(response.json()["file_name"], "slides.pdf")
        material = Material.objects.get(pk=response.json()["id"])
        self.assertEqual(list(material.chunks.values_list("page_number", flat=True)), [1, 2])
        duplicate = self.upload("slides.pdf", contents, "slides")
        self.assertEqual(duplicate.status_code, 200)
        self.assertEqual(duplicate.json()["id"], material.pk)
        self.assertEqual(Material.objects.count(), 1)

    def test_powerpoint_slide_numbers_follow_actual_slide_order(self):
        response = self.upload("lecture.pptx", self.pptx("Sampling theorem", "", "Aliasing and filters"), "slides")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["status"], "ready")
        chunks = Material.objects.get(pk=response.json()["id"]).chunks.all()
        self.assertEqual([chunk.page_number for chunk in chunks], [1, 3])
        self.assertEqual(chunks[1].metadata["source_unit"], "slide")
        self.assertIn("Aliasing", chunks[1].text)

    def test_invalid_and_image_only_powerpoint_fail_safely(self):
        invalid = self.upload("broken.pptx", b"not a powerpoint", "slides")
        self.assertEqual(invalid.json()["status"], "failed")
        self.assertFalse(Material.objects.get(pk=invalid.json()["id"]).chunks.exists())
        blank = self.upload("blank.pptx", self.pptx(""), "slides")
        self.assertEqual(blank.json()["status"], "failed")
        self.assertIn("OCR", blank.json()["error"])
        self.assertEqual(self.upload("old.ppt", b"old format", "slides").status_code, 400)

    def test_powerpoint_package_size_guard(self):
        with patch("materials.ingestion.MAX_PACKAGE_BYTES", 100):
            response = self.upload("large.pptx", self.pptx("Hello"), "slides")
        self.assertEqual(response.json()["status"], "failed")
        self.assertIn("too large", response.json()["error"])

    def test_srt_and_vtt_keep_real_time_ranges(self):
        for extension, header, arrow in [
            ("srt", "", "00:00:01,250 --> 00:00:02,500"),
            ("vtt", "WEBVTT\n\n", "00:00:01.250 --> 00:00:02.500"),
        ]:
            contents = (header + arrow + "\nFirst cue\n\n00:02:00" + ("," if extension == "srt" else ".") +
                        "000 --> 00:02:01" + ("," if extension == "srt" else ".") + "000\nLater cue\n").encode()
            result = self.upload(f"lecture.{extension}", contents, "transcript")
            self.assertEqual(result.status_code, 201)
            material = Material.objects.get(pk=result.json()["id"])
            self.assertEqual(material.status, "ready")
            self.assertEqual(list(material.chunks.values_list("start_seconds", "end_seconds")), [(1.25, 2.5), (120, 121)])

    def test_out_of_order_subtitles_fail_without_chunks(self):
        result = self.upload("wrong.srt", (
            b"00:00:09,000 --> 00:00:10,000\nLater\n\n"
            b"00:00:01,000 --> 00:00:02,000\nEarlier\n"
        ), "transcript")
        self.assertEqual(result.json()["status"], "failed")
        self.assertFalse(Material.objects.get(pk=result.json()["id"]).chunks.exists())

    def test_adjacent_subtitle_cues_combine_with_true_bounds(self):
        result = self.upload("lecture.vtt", (
            b"WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nFirst\n\n"
            b"00:00:02.000 --> 00:00:03.500\nSecond\n"
        ), "transcript")
        chunks = Material.objects.get(pk=result.json()["id"]).chunks.all()
        self.assertEqual(chunks.count(), 1)
        self.assertEqual((chunks[0].start_seconds, chunks[0].end_seconds), (1.0, 3.5))
        self.assertIn("Second", chunks[0].text)

    def test_text_and_exam_files_are_chunked_without_invented_pages(self):
        response = self.upload("exam.txt", b"1. What is aliasing?\n2. Explain sampling theorem.", "exam")
        self.assertEqual(response.json()["status"], "ready")
        chunk = Material.objects.get(pk=response.json()["id"]).chunks.first()
        self.assertIn("1. What", chunk.text)
        self.assertIsNone(chunk.page_number)

    def test_empty_scanned_pdf_fails_without_chunks(self):
        scanned = self.pdf("")
        result = self.upload("scan.pdf", scanned, "slides")
        self.assertEqual(result.json()["status"], "failed")
        self.assertIn("OCR", result.json()["error"])
        self.assertFalse(Material.objects.get(pk=result.json()["id"]).chunks.exists())
        retried = self.upload("scan.pdf", scanned, "slides")
        self.assertEqual(retried.status_code, 200)
        self.assertEqual(retried.json()["id"], result.json()["id"])
        self.assertEqual(Material.objects.count(), 1)

    def test_rejects_wrong_type_oversize_and_binary(self):
        invalid = self.upload("code.exe", b"text", "transcript")
        self.assertEqual(invalid.status_code, 400)
        self.assertIsInstance(invalid.json()["error"]["message"], str)
        self.assertEqual(self.upload("notpdf.pdf", b"not a PDF", "slides").json()["status"], "failed")
        self.assertEqual(self.upload("binary.txt", b"hello\x00world", "transcript").json()["status"], "failed")
        self.assertEqual(self.upload("large.txt", b"x" * (15 * 1024 * 1024 + 1), "transcript").status_code, 400)

    def test_materials_are_scoped_to_course(self):
        self.upload("notes.txt", b"lecture text", "transcript")
        other = Course.objects.create(name="Other")
        self.assertEqual(self.client.get(f"/api/courses/{other.pk}/materials/").json(), [])
        self.assertEqual(len(self.client.get(self.url).json()), 1)
