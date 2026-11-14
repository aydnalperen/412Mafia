from django.core.exceptions import ValidationError
from django.test import TestCase

from courses.models import Course
from materials.models import Material, SourceChunk
from .models import ExamQuestion, QuestionSourceLink


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
