import json
from io import BytesIO
from unittest.mock import patch

from django.test import TestCase

from courses.models import Course
from materials.models import Material, SourceChunk

from .models import ExamQuestion, OralSession, OralTurn, QuestionSourceLink


class OralExamTests(TestCase):
    def setUp(self):
        self.course = Course.objects.create(name="Signals")
        exam = Material.objects.create(course=self.course, kind=Material.Kind.EXAM,
                                       status=Material.Status.READY, file="materials/exam.txt")
        self.question = ExamQuestion.objects.create(course=self.course, material=exam,
                                                    text="Explain sampling and aliasing")
        transcript = Material.objects.create(course=self.course, kind=Material.Kind.TRANSCRIPT,
                                             status=Material.Status.READY, file="materials/lecture.txt")
        self.chunk = SourceChunk.objects.create(material=transcript, text="Aliasing occurs below Nyquist sampling rate.",
                                                sequence=0, start_seconds=20, end_seconds=30)
        self.path = f"/api/courses/{self.course.pk}/oral/start/"
        self.config = patch("exams.oral.openrouter_config", return_value=("test-key", "test/model", "https://example.test/chat"))
        self.config.start()
        self.addCleanup(self.config.stop)

    def link(self):
        QuestionSourceLink.objects.create(question=self.question, chunk=self.chunk, score=0.9,
                                          method="keyword-idf", reason="Shared terms")

    def start_session(self):
        return self.client.post(self.path, data={"question_id": self.question.pk}, content_type="application/json")

    def provider(self, ids=None, action="follow_up"):
        data = {"feedback": {"accuracy": 3, "completeness": 2, "correct_points": ["Sampling rate"],
                             "missing_points": ["Nyquist limit"], "source_chunk_ids": ids if ids is not None else [self.chunk.pk]},
                "next_action": action, "next_question": "What is the Nyquist limit?"}
        return BytesIO(json.dumps({"choices": [{"message": {"content": json.dumps(data)}}]}).encode())

    def test_requires_real_same_course_saved_evidence_and_backend_provider(self):
        self.assertEqual(self.start_session().status_code, 400)
        self.assertFalse(OralSession.objects.exists())
        self.link()
        other = Course.objects.create(name="Other")
        self.assertEqual(self.client.post(f"/api/courses/{other.pk}/oral/start/",
                                          data={"question_id": self.question.pk}, content_type="application/json").status_code, 404)
        with patch("exams.oral.openrouter_config", return_value=None):
            self.assertEqual(self.start_session().status_code, 400)
        self.assertFalse(OralSession.objects.exists())

    def test_persisted_turns_follow_ups_report_and_no_paid_reads(self):
        self.link()
        response = self.start_session()
        self.assertEqual(response.status_code, 201)
        session = response.json()
        self.assertEqual(session["current_question"], self.question.text)
        path = f"/api/oral/{session['id']}/"
        with patch("exams.oral.request.urlopen", side_effect=[self.provider(), self.provider(), self.provider()]) as call:
            for turn in range(3):
                response = self.client.post(path + "answer/", data={"answer": "Sampling occurs at a rate",
                                                                      "expected_turn": turn}, content_type="application/json")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(len(response.json()["turns"]), turn + 1)
                self.assertEqual(self.client.get(path).json(), response.json())
                self.assertEqual(self.client.post(path + "answer/", data={"answer": "duplicate",
                                                                        "expected_turn": turn}, content_type="application/json").status_code, 400)
            self.assertEqual(call.call_count, 3)
        self.assertEqual(OralTurn.objects.count(), 3)
        self.assertEqual(response.json()["status"], "completed")
        report = self.client.get(path + "report/").json()
        self.assertEqual(report["missing_concepts"], ["Nyquist limit"])
        self.assertEqual(report["revision_sources"][0]["chunk_id"], self.chunk.pk)
        self.assertEqual(report["revision_sources"][0]["start_seconds"], 20)
        self.chunk.delete()
        self.assertEqual(self.client.get(path + "report/").json()["revision_sources"], [])
        self.assertEqual(self.client.get(path + "report/").json()["missing_concepts"], [])

    def test_invalid_citation_and_provider_error_do_not_save_answer(self):
        self.link()
        session_id = self.start_session().json()["id"]
        path = f"/api/oral/{session_id}/answer/"
        with patch("exams.oral.request.urlopen", return_value=self.provider(ids=[999999])):
            self.assertEqual(self.client.post(path, data={"answer": "Nyquist", "expected_turn": 0},
                                              content_type="application/json").status_code, 502)
        with patch("exams.oral.request.urlopen", side_effect=OSError("offline")):
            self.assertEqual(self.client.post(path, data={"answer": "Nyquist", "expected_turn": 0},
                                              content_type="application/json").status_code, 502)
        self.assertFalse(OralTurn.objects.exists())
        self.assertEqual(self.client.get(f"/api/oral/{session_id}/").json()["status"], "active")
        self.assertEqual(self.client.get(f"/api/oral/{session_id}/report/").status_code, 400)

    def test_empty_citations_strip_ungrounded_bullets_and_long_points_truncate(self):
        self.link()
        session_id = self.start_session().json()["id"]
        path = f"/api/oral/{session_id}/answer/"
        with patch("exams.oral.request.urlopen", return_value=self.provider(ids=[])):
            res = self.client.post(path, data={"answer": "I dont know", "expected_turn": 0},
                                   content_type="application/json")
        self.assertEqual(res.status_code, 200)
        turn = res.json()["turns"][0]
        self.assertEqual(turn["feedback"]["correct_points"], [])
        self.assertEqual(turn["feedback"]["missing_points"], [])
        long_point = "A " * 130 + "end"
        long_payload = BytesIO(json.dumps({"choices": [{"message": {"content": json.dumps({
            "feedback": {"accuracy": 2, "completeness": 2, "correct_points": [long_point],
                         "missing_points": [], "source_chunk_ids": [self.chunk.pk]},
            "next_action": "follow_up", "next_question": "Next?",
        })}}]}).encode())
        with patch("exams.oral.request.urlopen", return_value=long_payload):
            res = self.client.post(path, data={"answer": "Sampling rate", "expected_turn": 1},
                                   content_type="application/json")
        self.assertEqual(res.status_code, 200)
        self.assertLessEqual(len(res.json()["turns"][1]["feedback"]["correct_points"][0]), 220)

    def test_deleted_evidence_is_not_cited(self):
        self.link()
        session_id = self.start_session().json()["id"]
        self.chunk.delete()
        path = f"/api/oral/{session_id}/"
        self.assertEqual(self.client.get(path).json()["turns"], [])
        self.assertEqual(self.client.post(path + "answer/", data={"answer": "something", "expected_turn": 0},
                                          content_type="application/json").status_code, 400)
