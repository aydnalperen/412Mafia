from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from courses.models import Course

from .models import ExamQuestion, OralSession
from .oral import answer_session, session_data, start


class OralSessionListView(APIView):
    def get(self, request, course_id):
        course = get_object_or_404(Course, pk=course_id)
        sessions = (
            OralSession.objects.filter(course=course)
            .select_related("question")
            .prefetch_related("turns")
            .order_by("-started_at", "-id")[:20]
        )
        items = []
        for s in sessions:
            turns = list(s.turns.all())
            acc = [t.feedback.get("accuracy") for t in turns if isinstance(t.feedback, dict) and type(t.feedback.get("accuracy")) is int]
            comp = [t.feedback.get("completeness") for t in turns if isinstance(t.feedback, dict) and type(t.feedback.get("completeness")) is int]
            items.append({
                "id": s.pk,
                "course_id": s.course_id,
                "question_id": s.question_id,
                "question_number": s.question.question_number,
                "question_text": s.question.text,
                "status": s.status,
                "turns_count": len(turns),
                "avg_accuracy": round(sum(acc) / len(acc), 2) if acc else None,
                "avg_completeness": round(sum(comp) / len(comp), 2) if comp else None,
                "missing_concepts": (s.report or {}).get("missing_concepts", []) if isinstance(s.report, dict) else [],
                "started_at": s.started_at.isoformat(),
            })
        return Response(items)


class OralStartView(APIView):
    def post(self, request, course_id):
        course = get_object_or_404(Course, pk=course_id)
        question_id = request.data.get("question_id") if isinstance(request.data, dict) else None
        if type(question_id) is not int:
            raise ValidationError("Select a question_id from this course.")
        question = get_object_or_404(ExamQuestion.objects.select_related("material"), pk=question_id, course=course)
        return Response(start(course, question), status=201)


class OralSessionView(APIView):
    def get(self, request, session_id):
        return Response(session_data(get_object_or_404(OralSession, pk=session_id)))


class OralAnswerView(APIView):
    def post(self, request, session_id):
        get_object_or_404(OralSession, pk=session_id)
        if not isinstance(request.data, dict):
            raise ValidationError("Expected answer and expected_turn.")
        return Response(answer_session(session_id, request.data.get("answer"), request.data.get("expected_turn")))


class OralReportView(APIView):
    def get(self, request, session_id):
        session = get_object_or_404(OralSession, pk=session_id)
        if session.status != "completed":
            raise ValidationError("Finish the session before requesting a report.")
        return Response(session_data(session)["report"])
