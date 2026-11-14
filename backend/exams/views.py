from pathlib import Path

from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from courses.models import Course
from materials.models import Material

from .models import ExamQuestion
from .service import saved_sources_for, sources_for


class ManualQuestionSerializer(serializers.Serializer):
    question_number = serializers.CharField(max_length=50, required=False, allow_blank=True)
    text = serializers.CharField(max_length=4000)
    page_number = serializers.IntegerField(min_value=1, required=False, allow_null=True, default=None)

    def validate_text(self, value):
        cleaned = value.strip()
        if len(cleaned) < 8:
            raise serializers.ValidationError("Question text must contain at least 8 characters.")
        return cleaned


def _serialize_question(question):
    return {
        "id": question.pk,
        "question_number": question.question_number,
        "text": question.text,
        "page_number": question.page_number,
        "material_id": question.material_id,
        "material_title": Path(question.material.file.name).name,
    }


class QuestionsView(APIView):
    def get(self, request, course_id):
        get_object_or_404(Course, pk=course_id)
        questions = ExamQuestion.objects.filter(course_id=course_id).select_related("material").order_by("material_id", "id")
        return Response([_serialize_question(question) for question in questions])

    def post(self, request, course_id):
        course = get_object_or_404(Course, pk=course_id)
        serializer = ManualQuestionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        exam_material, _ = Material.objects.get_or_create(
            course=course,
            kind=Material.Kind.EXAM,
            file="materials/manual-questions.txt",
            defaults={"status": Material.Status.READY},
        )
        if exam_material.status != Material.Status.READY:
            exam_material.status = Material.Status.READY
            exam_material.save(update_fields=["status"])
        number = (data.get("question_number") or "").strip()
        if not number:
            number = str(ExamQuestion.objects.filter(course=course).count() + 1)
        question = ExamQuestion.objects.create(
            course=course,
            material=exam_material,
            question_number=number,
            text=data["text"],
            page_number=data["page_number"],
        )
        return Response(_serialize_question(question), status=status.HTTP_201_CREATED)


class QuestionSourcesView(APIView):
    def get(self, request, question_id):
        question = get_object_or_404(ExamQuestion, pk=question_id)
        return Response(saved_sources_for(question))

    def post(self, request, question_id):
        question = get_object_or_404(ExamQuestion, pk=question_id)
        return Response(sources_for(question))
