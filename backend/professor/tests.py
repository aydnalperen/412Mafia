import json
from io import BytesIO
from unittest.mock import patch

from django.test import TestCase

from courses.models import Course
from exams.models import ExamQuestion, OralSession, OralTurn, QuestionSourceLink
from knowledge.models import QuestionTopicLink, Topic, TopicSourceLink
from materials.models import Material, SourceChunk

from .models import ProfessorFeedback


class ProfessorDashboardTests(TestCase):
    def setUp(self):
        self.course = Course.objects.create(name="Database Systems")
        self.other = Course.objects.create(name="Other Course")

        self.slides = Material.objects.create(
            course=self.course, kind=Material.Kind.SLIDES, status=Material.Status.READY, file="materials/slides.pdf"
        )
        self.exam = Material.objects.create(
            course=self.course, kind=Material.Kind.EXAM, status=Material.Status.READY, file="materials/exam.pdf"
        )
        self.chunk = SourceChunk.objects.create(
            material=self.slides,
            text="Two-phase locking prevents dirty reads and ensures conflict serializability.",
            sequence=0,
            page_number=4,
        )
        self.topic = Topic.objects.create(
            course=self.course,
            name="Conflict serializability",
            normalized_name="conflict serializability",
            description="Locking protocols for serializability.",
        )
        TopicSourceLink.objects.create(topic=self.topic, chunk=self.chunk)
        self.q1 = ExamQuestion.objects.create(
            course=self.course,
            material=self.exam,
            question_number="1",
            text="Explain why two-phase locking ensures conflict serializability.",
            page_number=1,
        )
        self.q2 = ExamQuestion.objects.create(
            course=self.course,
            material=self.exam,
            question_number="2",
            text="Compare B+ tree split rules with hash indexing.",
            page_number=2,
        )
        QuestionTopicLink.objects.create(question=self.q1, topic=self.topic)
        QuestionSourceLink.objects.create(
            question=self.q1, chunk=self.chunk, score=0.9, reason="Shared locking concept", method="keyword-idf"
        )
        self.other_topic = Topic.objects.create(
            course=self.other, name="Foreign Topic", normalized_name="foreign topic", description="Other"
        )

    def test_dashboard_computes_deterministic_coverage_and_oral_weaknesses(self):
        session = OralSession.objects.create(
            course=self.course,
            question=self.q1,
            status="completed",
            current_question="",
            report={
                "strengths": ["Identified locking phase"],
                "missing_concepts": ["Conflict serializability proof"],
                "source_chunk_ids": [self.chunk.pk],
                "revision_chunk_ids": [self.chunk.pk],
            },
        )
        session.sources.add(self.chunk)
        OralTurn.objects.create(
            session=session,
            turn_index=0,
            question=self.q1.text,
            answer="Locks hold until commit.",
            feedback={
                "accuracy": 3,
                "completeness": 2,
                "correct_points": ["Identified locking phase"],
                "missing_points": ["Conflict serializability proof"],
                "source_chunk_ids": [self.chunk.pk],
            },
        )

        res = self.client.get(f"/api/courses/{self.course.pk}/professor/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["summary"]["questions_total"], 2)
        self.assertEqual(data["summary"]["questions_with_sources"], 1)
        self.assertEqual(data["summary"]["questions_uncovered"], 1)
        self.assertEqual(data["summary"]["avg_accuracy"], 3.0)
        self.assertEqual(data["topic_alignment"][0]["alignment_status"], "exam_heavy_gap")
        self.assertEqual(data["recurring_weaknesses"][0]["concept"], "Conflict serializability proof")

    def test_feedback_crud_enforces_same_course_targets(self):
        bad = self.client.post(
            f"/api/courses/{self.course.pk}/professor/feedback/",
            data={
                "title": "Cross-course target",
                "comment": "Should fail because topic belongs to another course.",
                "topic_id": self.other_topic.pk,
            },
            content_type="application/json",
        )
        self.assertEqual(bad.status_code, 400)

        created = self.client.post(
            f"/api/courses/{self.course.pk}/professor/feedback/",
            data={
                "author_name": "Prof. Rossi",
                "category": "rubric_note",
                "title": "Emphasize strict 2PL growing vs shrinking phases",
                "comment": "Students often forget cascading abort behavior under non-strict 2PL.",
                "question_id": self.q1.pk,
                "is_pinned": True,
            },
            content_type="application/json",
        )
        self.assertEqual(created.status_code, 201)
        fid = created.json()["id"]
        self.assertEqual(ProfessorFeedback.objects.count(), 1)

        patched = self.client.patch(
            f"/api/courses/{self.course.pk}/professor/feedback/{fid}/",
            data={"is_pinned": False},
            content_type="application/json",
        )
        self.assertEqual(patched.status_code, 200)
        self.assertFalse(patched.json()["is_pinned"])

        deleted = self.client.delete(f"/api/courses/{self.course.pk}/professor/feedback/{fid}/")
        self.assertEqual(deleted.status_code, 204)
        self.assertEqual(ProfessorFeedback.objects.count(), 0)

    def test_insights_rejects_fabricated_question_or_topic_ids(self):
        bad_payload = BytesIO(
            json.dumps(
                {
                    "choices": [
                        {
                            "message": {
                                "content": json.dumps(
                                    {
                                        "executive_summary": "Question 2 needs slide support.",
                                        "teaching_priorities": [
                                            {
                                                "title": "Add B+ tree examples",
                                                "rationale": "Question 2 lacks linked material.",
                                                "cited_topic_ids": [999999],
                                                "cited_question_ids": [self.q2.pk],
                                            }
                                        ],
                                    }
                                )
                            }
                        }
                    ]
                }
            ).encode()
        )
        with (
            patch("professor.service.openrouter_config", return_value=("k", "m", "https://example.test/chat")),
            patch("professor.service.request.urlopen", return_value=bad_payload),
        ):
            res = self.client.post(f"/api/courses/{self.course.pk}/professor/insights/")
        self.assertEqual(res.status_code, 502)

    def test_manual_question_oral_history_and_material_delete_endpoints(self):
        created_q = self.client.post(
            f"/api/courses/{self.course.pk}/questions/",
            data={"question_number": "3b", "text": "Explain write-ahead logging recovery checkpoints.", "page_number": 4},
            content_type="application/json",
        )
        self.assertEqual(created_q.status_code, 201)
        self.assertEqual(created_q.json()["question_number"], "3b")

        session = OralSession.objects.create(course=self.course, question=self.q1, status="active", current_question=self.q1.text)
        oral_list = self.client.get(f"/api/courses/{self.course.pk}/oral/")
        self.assertEqual(oral_list.status_code, 200)
        self.assertEqual(oral_list.json()[0]["id"], session.pk)

        deleted_mat = self.client.delete(f"/api/courses/{self.course.pk}/materials/{self.slides.pk}/")
        self.assertEqual(deleted_mat.status_code, 204)
        self.assertFalse(Material.objects.filter(pk=self.slides.pk).exists())
