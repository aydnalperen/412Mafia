from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from ai.budget import budget_summary
from courses.models import Course
from exams.models import ExamQuestion
from knowledge.models import Topic

from .models import ProfessorFeedback
from .service import (
    course_coverage_report,
    generate_teaching_briefing,
    link_course_question_sources,
    serialize_feedback,
)


class FeedbackCreateSerializer(serializers.Serializer):
    author_name = serializers.CharField(max_length=80, required=False, allow_blank=True, default="Course Instructor")
    category = serializers.ChoiceField(
        choices=ProfessorFeedback.Category.choices,
        default=ProfessorFeedback.Category.RUBRIC_NOTE,
    )
    title = serializers.CharField(max_length=160)
    comment = serializers.CharField(max_length=2000)
    topic_id = serializers.IntegerField(required=False, allow_null=True, default=None)
    question_id = serializers.IntegerField(required=False, allow_null=True, default=None)
    is_pinned = serializers.BooleanField(required=False, default=False)

    def validate_title(self, value):
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise serializers.ValidationError("Title must contain at least 2 characters.")
        return cleaned

    def validate_comment(self, value):
        cleaned = value.strip()
        if len(cleaned) < 4:
            raise serializers.ValidationError("Feedback comment must contain at least 4 characters.")
        return cleaned


class FeedbackUpdateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=160, required=False)
    comment = serializers.CharField(max_length=2000, required=False)
    category = serializers.ChoiceField(choices=ProfessorFeedback.Category.choices, required=False)
    is_pinned = serializers.BooleanField(required=False)

    def validate_title(self, value):
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise serializers.ValidationError("Title must contain at least 2 characters.")
        return cleaned

    def validate_comment(self, value):
        cleaned = value.strip()
        if len(cleaned) < 4:
            raise serializers.ValidationError("Feedback comment must contain at least 4 characters.")
        return cleaned


class ProfessorDashboardView(APIView):
    def get(self, request, course_id):
        course = get_object_or_404(Course, pk=course_id)
        return Response(course_coverage_report(course))


class ProfessorFeedbackListCreateView(APIView):
    def get(self, request, course_id):
        course = get_object_or_404(Course, pk=course_id)
        items = (
            ProfessorFeedback.objects.filter(course=course)
            .select_related("topic", "question")
            .order_by("-is_pinned", "-created_at", "-id")
        )
        return Response([serialize_feedback(item) for item in items])

    def post(self, request, course_id):
        course = get_object_or_404(Course, pk=course_id)
        serializer = FeedbackCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        topic = None
        if data["topic_id"] is not None:
            topic = Topic.objects.filter(pk=data["topic_id"], course=course).first()
            if topic is None:
                raise serializers.ValidationError({"topic_id": "Selected topic does not belong to this course."})

        question = None
        if data["question_id"] is not None:
            question = ExamQuestion.objects.filter(pk=data["question_id"], course=course).first()
            if question is None:
                raise serializers.ValidationError({"question_id": "Selected question does not belong to this course."})

        author_name = (data.get("author_name") or "").strip() or "Course Instructor"
        item = ProfessorFeedback.objects.create(
            course=course,
            topic=topic,
            question=question,
            author_name=author_name,
            category=data["category"],
            title=data["title"],
            comment=data["comment"],
            is_pinned=data["is_pinned"],
        )
        item = ProfessorFeedback.objects.select_related("topic", "question").get(pk=item.pk)
        return Response(serialize_feedback(item), status=status.HTTP_201_CREATED)


class ProfessorFeedbackDetailView(APIView):
    def patch(self, request, course_id, feedback_id):
        course = get_object_or_404(Course, pk=course_id)
        item = get_object_or_404(
            ProfessorFeedback.objects.select_related("topic", "question"),
            pk=feedback_id,
            course=course,
        )
        serializer = FeedbackUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updates = []
        for field in ("title", "comment", "category", "is_pinned"):
            if field in serializer.validated_data:
                setattr(item, field, serializer.validated_data[field])
                updates.append(field)
        if updates:
            updates.append("updated_at")
            item.save(update_fields=updates)
        return Response(serialize_feedback(item))

    def delete(self, request, course_id, feedback_id):
        course = get_object_or_404(Course, pk=course_id)
        item = get_object_or_404(ProfessorFeedback, pk=feedback_id, course=course)
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProfessorInsightsView(APIView):
    def post(self, request, course_id):
        course = get_object_or_404(Course, pk=course_id)
        return Response(generate_teaching_briefing(course))


class ProfessorLinkQuestionsView(APIView):
    def post(self, request, course_id):
        course = get_object_or_404(Course, pk=course_id)
        mode = "local"
        if isinstance(request.data, dict) and "mode" in request.data:
            mode = request.data["mode"]
            if mode not in ("local", "openrouter"):
                raise serializers.ValidationError({"mode": "Mode must be local or openrouter."})
        return Response(link_course_question_sources(course, mode=mode))


class CoursePipelineView(APIView):
    def get(self, request, course_id):
        course = get_object_or_404(Course, pk=course_id)
        report = course_coverage_report(course)
        return Response({"pipeline": report["pipeline"], "ai_budget": budget_summary(course.pk)})
