from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from courses.models import Course

from .extraction import topic_supports_text
from .models import QuestionTopicLink, TopicSourceLink
from .service import (
    InputsChanged,
    ProviderError,
    exam_questions,
    generate,
    openrouter_config,
    serialize_source,
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
    sources = (
        TopicSourceLink.objects.filter(chunk__in=source_chunks(course.pk))
        .select_related("chunk__material__source_material")
        .order_by("-score", "chunk_id")
    )
    questions = (
        QuestionTopicLink.objects.filter(question__in=exam_questions(course.pk))
        .select_related("question")
        .prefetch_related("question__source_links")
        .order_by("question_id")
    )
    topics = course.topics.order_by("normalized_name").prefetch_related(
        Prefetch("source_links", queryset=sources),
        Prefetch("question_links", queryset=questions),
    )
    result = []
    for topic in topics:
        keywords = topic.keywords or []
        valid_source_links = [
            link
            for link in topic.source_links.all()
            if topic_supports_text(topic.name, keywords, link.chunk.text)
        ]
        if not valid_source_links:
            continue
        valid_chunk_ids = {link.chunk_id for link in valid_source_links}
        excerpts = [
            serialize_source(link.chunk, score=link.score, reason=link.reason)
            for link in valid_source_links
        ]
        linked_q_ids = []
        for link in topic.question_links.all():
            if topic_supports_text(topic.name, keywords, link.question.text):
                linked_q_ids.append(link.question_id)
                continue
            if any(qsl.chunk_id in valid_chunk_ids for qsl in link.question.source_links.all()):
                linked_q_ids.append(link.question_id)

        result.append({
            "id": topic.pk,
            "name": topic.name,
            "description": topic.description,
            "keywords": keywords,
            "question_ids": sorted(set(linked_q_ids)),
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
