import json
import tempfile
from io import BytesIO
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from courses.models import Course
from materials.models import Material, SourceChunk
from .models import ExamQuestion, QuestionSourceLink
from .service import sources_for


class CitationBoundaryTests(TestCase):
    def test_cannot_link_another_courses_chunk(self):
        first = Course.objects.create(name="First")
        second = Course.objects.create(name="Second")
        exam = Material.objects.create(course=first, kind=Material.Kind.EXAM, file="materials/exam.pdf")
        transcript = Material.objects.create(course=second, kind=Material.Kind.TRANSCRIPT, file="materials/notes.txt")
        question = ExamQuestion.objects.create(course=first, material=exam, text="What is aliasing?")
        chunk = SourceChunk.objects.create(material=transcript, text="Aliasing", sequence=0)
        with self.assertRaises(ValidationError):
            QuestionSourceLink.objects.create(question=question, chunk=chunk, score=0.7, reason="term overlap", method="keyword")
        self.assertFalse(QuestionSourceLink.objects.exists())


class QuestionEvidenceTests(TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        storage = override_settings(MEDIA_ROOT=directory.name)
        storage.enable()
        self.addCleanup(storage.disable)
        self.course = Course.objects.create(name="Signals")

    def test_exam_upload_extracts_literal_numbered_questions_and_reuses_them(self):
        upload = lambda: self.client.post(f"/api/courses/{self.course.pk}/materials/", {
            "kind": "exam", "file": SimpleUploadedFile("past-exam.txt", b"1. Explain aliasing in sampling\nusing a signal.\n2) Define Fourier transform\n"),
        })
        self.assertEqual(upload().status_code, 201)
        self.assertEqual(upload().status_code, 200)
        response = self.client.get(f"/api/courses/{self.course.pk}/questions/")
        self.assertEqual([row["text"] for row in response.json()],
                         ["Explain aliasing in sampling\nusing a signal.", "Define Fourier transform"])
        self.assertEqual([row["question_number"] for row in response.json()], ["1", "2"])
        self.assertTrue(all(row["page_number"] is None for row in response.json()))
        self.assertEqual(ExamQuestion.objects.count(), 2)

    def test_pdf_question_keeps_true_page_and_source_is_scoped_to_course(self):
        import fitz

        pdf = fitz.open()
        pdf.new_page().insert_text((72, 72), "Lecture notes only on this page")
        pdf.new_page().insert_text((72, 72), "1. Explain aliasing in sampled signals?")
        response = self.client.post(f"/api/courses/{self.course.pk}/materials/", {
            "kind": "exam", "file": SimpleUploadedFile("exam.pdf", pdf.tobytes()),
        })
        self.assertEqual(response.status_code, 201)
        question = self.client.get(f"/api/courses/{self.course.pk}/questions/").json()[0]
        self.assertEqual(question["page_number"], 2)
        self.assertEqual(question["text"], "Explain aliasing in sampled signals?")
        same = Material.objects.create(course=self.course, kind=Material.Kind.TRANSCRIPT,
                                       status=Material.Status.READY, file="materials/lecture.txt")
        chunk = SourceChunk.objects.create(material=same, text="Aliasing in sampled signals occurs above Nyquist.",
                                           start_seconds=18, end_seconds=26, sequence=0)
        other = Course.objects.create(name="Other")
        foreign = Material.objects.create(course=other, kind=Material.Kind.SLIDES,
                                          status=Material.Status.READY, file="materials/foreign.pdf")
        SourceChunk.objects.create(material=foreign, text="Aliasing in sampled signals", sequence=0, page_number=9)
        sources = self.client.get(f"/api/questions/{question['id']}/sources/").json()
        self.assertEqual(len(sources), 1)
        self.assertEqual(sources[0]["chunk_id"], chunk.pk)
        self.assertEqual((sources[0]["start_seconds"], sources[0]["end_seconds"]), (18, 26))
        self.assertEqual(sources[0]["material_title"], "lecture.txt")
        self.assertEqual(self.client.get(f"/api/questions/{question['id']}/sources/").json(), sources)
        self.assertEqual(QuestionSourceLink.objects.count(), 1)

    def test_lettered_exam_sections_stop_at_solutions_not_numbered_answer_steps(self):
        import fitz

        pdf = fitz.open()
        pdf.new_page().insert_text((72, 72), "A. Concurrency control (10 points)\nExplain two phase locking.\nSolution.\n1. This is an answer step.")
        pdf.new_page().insert_text((72, 72), "B. Ranking (12 points)\nExplain the ranking algorithm.\nSolution.\n2. Another answer step.")
        response = self.client.post(f"/api/courses/{self.course.pk}/materials/", {
            "kind": "exam", "file": SimpleUploadedFile("lettered.pdf", pdf.tobytes()),
        })
        self.assertEqual(response.status_code, 201)
        questions = self.client.get(f"/api/courses/{self.course.pk}/questions/").json()
        self.assertEqual([row["question_number"] for row in questions], ["A", "B"])
        self.assertEqual([row["page_number"] for row in questions], [1, 2])
        self.assertEqual([row["text"] for row in questions], [
            "Concurrency control (10 points)\nExplain two phase locking.",
            "Ranking (12 points)\nExplain the ranking algorithm.",
        ])

    def test_no_numbered_questions_or_unrelated_sources_are_not_invented(self):
        self.client.post(f"/api/courses/{self.course.pk}/materials/", {
            "kind": "exam", "file": SimpleUploadedFile("unstructured.txt", b"Exam instructions with no numbered question."),
        })
        self.assertEqual(self.client.get(f"/api/courses/{self.course.pk}/questions/").json(), [])
        exam = Material.objects.filter(course=self.course, kind=Material.Kind.EXAM).first()
        question = ExamQuestion.objects.create(course=self.course, material=exam, text="Describe stellar nucleosynthesis")
        transcript = Material.objects.create(course=self.course, kind=Material.Kind.TRANSCRIPT,
                                             status=Material.Status.READY, file="materials/lecture.txt")
        SourceChunk.objects.create(material=transcript, text="Aliasing and sampling theorem", sequence=0)
        self.assertEqual(sources_for(question), [])
        self.assertEqual(QuestionSourceLink.objects.count(), 0)
        self.assertEqual(self.client.get("/api/questions/999999/sources/").status_code, 404)

    def test_openrouter_reranks_only_real_same_course_candidates(self):
        exam = Material.objects.create(course=self.course, kind=Material.Kind.EXAM, file="materials/exam.txt")
        question = ExamQuestion.objects.create(course=self.course, material=exam, text="Explain aliasing in sampling")
        transcript = Material.objects.create(course=self.course, kind=Material.Kind.TRANSCRIPT,
                                             status=Material.Status.READY, file="materials/lecture.txt")
        chunk = SourceChunk.objects.create(material=transcript, sequence=0,
                                           text="Aliasing in sampling produces false frequencies")
        other = Course.objects.create(name="Other")
        foreign = Material.objects.create(course=other, kind=Material.Kind.TRANSCRIPT,
                                          status=Material.Status.READY, file="materials/other.txt")
        alien = SourceChunk.objects.create(material=foreign, sequence=0, text=chunk.text)

        def reply(matches):
            return BytesIO(json.dumps({"choices": [{"message": {"content": json.dumps({"matches": matches})}}]}).encode())

        path = f"/api/questions/{question.pk}/sources/"
        with patch.dict("os.environ", {"OPENROUTER_API_KEY": "test-key", "OPENROUTER_FAST_MODEL": "test/model"}):
            with patch("exams.service.request.urlopen", return_value=reply([
                {"chunk_id": chunk.pk, "score": 0.85, "reason": "Explains aliasing in sampling"}])) as call:
                result = self.client.get(path).json()
                self.assertEqual(result[0]["method"], "openrouter")
                self.assertEqual(result[0]["chunk_id"], chunk.pk)
                self.assertEqual(result[0]["score"], 0.85)
                payload = json.loads(call.call_args.args[0].data)
                self.assertEqual(payload["model"], "test/model")
                self.assertNotIn(str(alien.pk), payload["messages"][1]["content"])
            self.assertEqual(QuestionSourceLink.objects.get().method, "openrouter")
            with patch("exams.service.request.urlopen", return_value=reply([
                {"chunk_id": alien.pk, "score": 0.95, "reason": "Wrong course"}])):
                fallback = self.client.get(path).json()
                self.assertEqual(fallback[0]["method"], "keyword-idf")
                self.assertEqual(QuestionSourceLink.objects.get().method, "keyword-idf")
            with patch("exams.service.request.urlopen", return_value=reply([])):
                self.assertEqual(self.client.get(path).json(), [])
                self.assertFalse(QuestionSourceLink.objects.exists())
