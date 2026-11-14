from pathlib import Path

from django.shortcuts import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from courses.models import Course

from .models import ExamQuestion
from .service import sources_for


class QuestionsView(APIView):
    def get(self, request, course_id):
        get_object_or_404(Course, pk=course_id)
        questions = ExamQuestion.objects.filter(course_id=course_id).select_related("material").order_by("material_id", "id")
        return Response([{"id": question.pk, "question_number": question.question_number,
                          "text": question.text, "page_number": question.page_number,
                          "material_id": question.material_id, "material_title": Path(question.material.file.name).name}
                         for question in questions])


class QuestionSourcesView(APIView):
    def get(self, request, question_id):
        question = get_object_or_404(ExamQuestion, pk=question_id)
        return Response(sources_for(question))
