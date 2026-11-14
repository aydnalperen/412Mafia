from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from courses.models import Course

from .models import QuestionTopicLink, TopicSourceLink, normalize_name
from .service import (
    InputsChanged, ProviderError, exam_questions, generate, openrouter_config, phrases, serialize_source,
    source_chunks,
)


class KnowledgeProviderError(APIException):
    status_code = 502
    default_code = "knowledge_provider_error"


class KnowledgeConflict(APIException):
    status_code = 409
    default_code = "knowledge_inputs_changed"
    default_detail = "Course materials changed during generation. Generate topics again."


def graph_response(course, config):
    sources = TopicSourceLink.objects.filter(chunk__in=source_chunks(course.pk)).select_related(
        "chunk__material__source_material",
    ).order_by("chunk_id")
    questions = QuestionTopicLink.objects.filter(question__in=exam_questions(course.pk)).select_related(
        "question",
    ).order_by("question_id")
    topics = course.topics.order_by("normalized_name").prefetch_related(
        Prefetch("source_links", queryset=sources), Prefetch("question_links", queryset=questions),
    )
    result = []
    for topic in topics:
        key = topic.normalized_name
        excerpts = [
            serialize_source(link.chunk) for link in topic.source_links.all()
            if any(phrase == key for phrase, _ in phrases(link.chunk.text))
        ]
        if excerpts:
            result.append({
                "id": topic.pk,
                "name": topic.name,
                "description": topic.description,
                "question_ids": [
                    link.question_id for link in topic.question_links.all()
                    if any(phrase == key for phrase, _ in phrases(link.question.text))
                ],
                "sources": excerpts,
            })
    return Response({"openrouter_available": config is not None, "topics": result})


class KnowledgeView(APIView):
    def get(self, request, course_id):
        return graph_response(get_object_or_404(Course, pk=course_id), openrouter_config())


class GenerateKnowledgeView(APIView):
    def post(self, request, course_id):
        course = get_object_or_404(Course, pk=course_id)
        if not isinstance(request.data, dict) or request.data.keys() - {"mode"}:
            raise ValidationError("Expected an object with an optional mode.")
        mode = request.data.get("mode", "local")
        if mode not in ("local", "openrouter"):
            raise ValidationError("Mode must be local or openrouter.")
        config = openrouter_config()
        if mode == "openrouter" and config is None:
            raise ValidationError("OpenRouter is not configured.")
        try:
            generate(course, config if mode == "openrouter" else None)
        except ProviderError as exc:
            raise KnowledgeProviderError(str(exc)) from exc
        except InputsChanged as exc:
            raise KnowledgeConflict() from exc
        return graph_response(course, config)
