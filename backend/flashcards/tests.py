from django.test import TestCase

from courses.models import Course
from exams.models import ExamQuestion, OralSession, OralTurn
from knowledge.models import Topic, TopicSourceLink
from materials.models import Material, SourceChunk

from .models import Flashcard


class FlashcardTests(TestCase):
    def setUp(self):
        self.course = Course.objects.create(name="Signals")
        self.other_course = Course.objects.create(name="Other")
        material = Material.objects.create(course=self.course, kind=Material.Kind.TRANSCRIPT,
                                           status=Material.Status.READY, file="materials/lecture.vtt")
        self.chunk = SourceChunk.objects.create(material=material, sequence=0, start_seconds=20, end_seconds=30,
                                                text="The Nyquist limit is half the sampling rate in this example.")
        self.topic = Topic.objects.create(course=self.course, name="sampling rate")
        TopicSourceLink.objects.create(topic=self.topic, chunk=self.chunk)
        self.path = f"/api/courses/{self.course.pk}/flashcards/"

    def generate(self, data, course=None):
        path = f"/api/courses/{(course or self.course).pk}/flashcards/generate/"
        return self.client.post(path, data, content_type="application/json")

    def test_topic_card_is_sourced_and_repeat_generation_keeps_rating(self):
        origin = {"topic_id": self.topic.pk}
        response = self.generate(origin)
        self.assertEqual(response.status_code, 200, response.content)
        card, = response.json()
        self.assertEqual(card["back"], "sampling rate")
        self.assertIn("[…]", card["front"])
        self.assertNotIn("sampling rate", card["front"])
        self.assertEqual(card["source"]["chunk_id"], self.chunk.pk)
        self.assertEqual(card["source"]["start_seconds"], 20)
        self.assertIsNone(card["source"]["page_number"])
        self.assertEqual(card["review_state"], "new")
        path = f"{self.path}{card['id']}/"
        self.assertEqual(self.client.patch(path, {"review_state": "invalid"},
                                          content_type="application/json").status_code, 400)
        for state in ("review_again", "known"):
            self.assertEqual(self.client.patch(path, {"review_state": state},
                                              content_type="application/json").status_code, 200)
            self.assertEqual(self.client.get(self.path).json()[0]["review_state"], state)
        self.assertEqual(self.generate(origin).json()[0]["review_state"], "known")
        self.assertEqual(Flashcard.objects.count(), 1)
        self.assertEqual(self.generate(origin, self.other_course).status_code, 404)
        self.assertEqual(self.client.patch(f"/api/courses/{self.other_course.pk}/flashcards/{card['id']}/",
                                           {"review_state": "review_again"}, content_type="application/json").status_code, 404)
        self.chunk.delete()
        self.assertEqual(self.client.get(self.path).json(), [])

    def test_completed_oral_exam_only_uses_verified_matching_citations(self):
        exam = Material.objects.create(course=self.course, kind=Material.Kind.EXAM, file="materials/exam.txt")
        question = ExamQuestion.objects.create(course=self.course, material=exam, text="Explain sampling.")
        session = OralSession.objects.create(course=self.course, question=question, status="completed")
        session.sources.add(self.chunk)
        foreign_material = Material.objects.create(course=self.other_course, kind=Material.Kind.TRANSCRIPT,
                                                   status=Material.Status.READY, file="materials/other.vtt")
        foreign_chunk = SourceChunk.objects.create(material=foreign_material, sequence=0, text=self.chunk.text)
        session.sources.add(foreign_chunk)
        turn = OralTurn.objects.create(session=session, turn_index=0, question=question.text, answer="Unsure",
                                       feedback={"missing_points": ["Explain the Nyquist limit"],
                                                 "source_chunk_ids": [self.chunk.pk, foreign_chunk.pk]})
        origin = {"oral_session_id": session.pk}
        self.assertEqual(self.generate(origin, self.other_course).status_code, 404)
        self.assertEqual(self.generate(origin).status_code, 400)
        turn.feedback["source_chunk_ids"] = [self.chunk.pk]
        turn.save(update_fields=["feedback"])
        response = self.generate(origin)
        self.assertEqual(response.status_code, 200, response.content)
        card, = response.json()
        self.assertEqual(card["back"], "Nyquist limit")
        self.assertEqual(card["source"]["chunk_id"], self.chunk.pk)
        turn.feedback["missing_points"] = ["Fourier"]
        turn.save(update_fields=["feedback"])
        self.assertEqual(self.generate(origin).status_code, 400)
        self.assertEqual(Flashcard.objects.count(), 1)
        session.status = "active"
        session.save(update_fields=["status"])
        self.assertEqual(self.generate(origin).status_code, 404)
