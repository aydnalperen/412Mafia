import io
import json
import os
from urllib.error import URLError
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.test import TestCase

from courses.models import Course
from exams.models import ExamQuestion, QuestionSourceLink
from materials.models import Material, SourceChunk

from .models import QuestionTopicLink, Topic, TopicSourceLink


PROVIDER_ENV = {"OPENROUTER_API_KEY": "fake", "OPENROUTER_FAST_MODEL": "fake/model",
                "OPENROUTER_BASE_URL": "https://openrouter.ai/api/v1"}


class KnowledgeTests(TestCase):
    def setUp(self):
        self.course = Course.objects.create(name="Signals")
        self.url = f"/api/courses/{self.course.pk}/knowledge/"
        self.generate_url = f"{self.url}generate/"
        self.recording = self.material(self.course, Material.Kind.RECORDING, "lecture.mp3")
        self.transcript = self.material(
            self.course, Material.Kind.TRANSCRIPT, "derived.txt", source_material=self.recording,
        )
        self.chunk = SourceChunk.objects.create(
            material=self.transcript, sequence=0, text="Sampling theorem explains aliasing.",
            start_seconds=3.0, end_seconds=8.0,
        )
        slides = self.material(self.course, Material.Kind.SLIDES, "slides.pptx")
        self.slide = SourceChunk.objects.create(
            material=slides, sequence=0, text="Sampling theorem. Bandwidth.", page_number=4,
            metadata={"source_unit": "slide"},
        )
        exam = self.material(self.course, Material.Kind.EXAM, "exam.txt")
        self.question = ExamQuestion.objects.create(course=self.course, material=exam, text="Explain the sampling theorem.")
        self.other = Course.objects.create(name="Other")
        other_exam = self.material(self.other, Material.Kind.EXAM, "other.txt")
        self.foreign_question = ExamQuestion.objects.create(
            course=self.other, material=other_exam, text=self.question.text,
        )
        self.foreign_chunk = SourceChunk.objects.create(
            material=self.material(self.other, Material.Kind.STUDY, "foreign.txt"),
            sequence=0, text=self.chunk.text,
        )

    def material(self, course, kind, filename, **kwargs):
        return Material.objects.create(
            course=course, kind=kind, status=Material.Status.READY, file=f"materials/{filename}", **kwargs,
        )

    def post(self, data=None):
        return self.client.post(self.generate_url, data or {}, content_type="application/json")

    def provider_reply(self, rows):
        return io.BytesIO(json.dumps({
            "choices": [{"message": {"content": json.dumps({"topics": rows})}}],
        }).encode())

    @patch.dict(os.environ, PROVIDER_ENV)
    @patch("knowledge.service.request.urlopen")
    def test_local_generation_idempotent_and_get_read_only(self, urlopen):
        self.assertEqual(self.client.get(self.url).json(), {"openrouter_available": True, "topics": []})
        link = QuestionSourceLink.objects.create(
            question=self.question, chunk=self.chunk, score=1, reason="evidence", method="keyword-idf",
        )
        first = self.post()
        self.assertEqual(first.status_code, 200)
        topic, = first.json()["topics"]
        self.assertEqual(topic["name"], "Sampling theorem")
        self.assertEqual(topic["question_ids"], [self.question.pk])
        audio, slide = topic["sources"]
        self.assertEqual((audio["chunk_id"], audio["file_name"], audio["text"], audio["start_seconds"]),
                         (self.chunk.pk, "lecture.mp3", self.chunk.text, 3.0))
        self.assertIsNone(audio["page_number"])
        self.assertEqual((slide["page_number"], slide["is_slide"]), (4, True))
        self.assertIsNone(slide["start_seconds"])
        self.assertEqual(self.post().json(), first.json())
        with patch("knowledge.views.generate", side_effect=AssertionError("GET generated graph")):
            self.assertEqual(self.client.get(self.url).json(), first.json())
        self.assertEqual((Topic.objects.count(), TopicSourceLink.objects.count(), QuestionTopicLink.objects.count()),
                         (1, 2, 1))
        self.assertEqual(QuestionSourceLink.objects.get(), link)
        urlopen.assert_not_called()

    def test_model_constraints(self):
        topic = Topic.objects.create(course=self.course, name="Sampling theorem")
        for create in (
            lambda: Topic.objects.create(course=self.course, name="ＳＡＭＰＬＩＮＧ   theorem"),
            lambda: TopicSourceLink.objects.create(topic=topic, chunk=self.foreign_chunk),
            lambda: QuestionTopicLink.objects.create(topic=topic, question=self.foreign_question),
        ):
            with self.assertRaises(ValidationError):
                create()

    @patch.dict(os.environ, PROVIDER_ENV)
    @patch("knowledge.service.request.urlopen")
    def test_provider_errors_preserve_graph(self, urlopen):
        saved = self.post().json()
        valid = {"candidate_id": 1, "chunk_ids": [self.chunk.pk], "question_ids": [self.question.pk]}
        for rows in (
            [valid, valid],
            [{**valid, "chunk_ids": [self.foreign_chunk.pk]}],
            [{**valid, "chunk_ids": [99999]}],
            [{**valid, "question_ids": [self.foreign_question.pk]}],
            [{**valid, "question_ids": [99999]}],
            [{**valid, "question_ids": []}],
            [{**valid, "chunk_ids": "invalid"}],
        ):
            with self.subTest(rows=rows):
                urlopen.return_value = self.provider_reply(rows)
                self.assertEqual(self.post({"mode": "openrouter"}).status_code, 502)
                self.assertEqual(self.client.get(self.url).json(), saved)
        urlopen.return_value = io.BytesIO(b"malformed JSON")
        self.assertEqual(self.post({"mode": "openrouter"}).status_code, 502)
        urlopen.side_effect = URLError("network unavailable")
        self.assertEqual(self.post({"mode": "openrouter"}).status_code, 502)
        self.assertEqual(self.client.get(self.url).json(), saved)

    @patch.dict(os.environ, PROVIDER_ENV)
    @patch("knowledge.service.request.urlopen")
    def test_provider_selects_only_grounded_subset(self, urlopen):
        initial = self.post().json()["topics"][0]
        urlopen.return_value = self.provider_reply([
            {"candidate_id": 1, "chunk_ids": [self.slide.pk], "question_ids": [self.question.pk]},
        ])
        result = self.post({"mode": "openrouter"})
        self.assertEqual(result.status_code, 200)
        topic, = result.json()["topics"]
        self.assertEqual(topic["id"], initial["id"])
        self.assertEqual([source["chunk_id"] for source in topic["sources"]], [self.slide.pk])
        urlopen.assert_called_once()

    def test_sources_removed_or_replaced(self):
        self.post()
        self.slide.material.delete()
        self.assertEqual(TopicSourceLink.objects.count(), 1)
        SourceChunk.objects.filter(pk=self.chunk.pk).update(text="Unrelated weather forecast")
        self.assertEqual(self.client.get(self.url).json()["topics"], [])
        self.chunk.delete()
        SourceChunk.objects.create(material=self.transcript, sequence=0, text="New and unrelated material")
        self.assertEqual(self.post().json()["topics"], [])
        self.assertFalse(Topic.objects.exists())
        self.assertFalse(QuestionTopicLink.objects.exists())

    @patch.dict(os.environ, PROVIDER_ENV)
    @patch("knowledge.service.request.urlopen")
    def test_inputs_changed_during_provider_request(self, urlopen):
        saved = self.post().json()

        def change_input(*args, **kwargs):
            SourceChunk.objects.filter(pk=self.chunk.pk).update(text="Sampling theorem. Revised transcript.")
            return self.provider_reply([])

        urlopen.side_effect = change_input
        self.assertEqual(self.post({"mode": "openrouter"}).status_code, 409)
        self.assertEqual(Topic.objects.get().pk, saved["topics"][0]["id"])
        self.assertEqual(TopicSourceLink.objects.count(), 2)

    def test_canonically_equivalent_source_phrases(self):
        SourceChunk.objects.filter(pk=self.chunk.pk).update(text="R\u00e9seau neuronal.")
        SourceChunk.objects.filter(pk=self.slide.pk).update(text="Re\u0301seau neuronal.")
        topic, = self.post().json()["topics"]
        self.assertEqual(topic["name"], "R\u00e9seau neuronal")
        self.assertEqual(len(topic["sources"]), 2)

    @patch.dict(os.environ, {"OPENROUTER_API_KEY": ""})
    def test_empty_course_and_invalid_requests(self):
        empty = Course.objects.create(name="Empty")
        self.assertEqual(self.client.post(f"/api/courses/{empty.pk}/knowledge/generate/").json()["topics"], [])
        self.assertEqual(self.post({"mode": "openrouter"}).status_code, 400)
        self.assertEqual(self.post({"mode": "unexpected"}).status_code, 400)
        self.assertEqual(self.post({"chunk_ids": [self.foreign_chunk.pk]}).status_code, 400)
        self.assertEqual(self.client.get("/api/courses/99999/knowledge/").status_code, 404)
        self.assertEqual(self.client.post(self.generate_url, REMOTE_ADDR="192.0.2.1").status_code, 403)
        self.assertEqual(self.client.post(self.generate_url, HTTP_ORIGIN="https://example.com").status_code, 403)
