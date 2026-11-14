from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from courses.models import Course
from exams.models import OralSession
from knowledge.models import Topic

from .models import Flashcard
from .service import card_data, course_cards, generate_cards, oral_targets, topic_targets


class FlashcardsView(APIView):
    def get(self, request, course_id):
        get_object_or_404(Course, pk=course_id)
        return Response([card_data(card) for card in course_cards(course_id)])


class GenerateFlashcardsView(APIView):
    def post(self, request, course_id):
        data = request.data
        if not isinstance(data, dict) or set(data) not in ({"topic_id"}, {"oral_session_id"}):
            raise ValidationError("Select a topic or a completed oral exam.")
        field, value = next(iter(data.items()))
        if type(value) is not int or not 0 < value <= 2**63 - 1:
            raise ValidationError("Select a valid topic or oral exam.")
        if field == "topic_id":
            topic = get_object_or_404(Topic, pk=value, course_id=course_id)
            targets = topic_targets(topic)
        else:
            session = get_object_or_404(OralSession, pk=value, course_id=course_id, status="completed")
            targets = oral_targets(session)
        return Response([card_data(card) for card in generate_cards(targets)])


class FlashcardReviewView(APIView):
    def patch(self, request, course_id, card_id):
        if not isinstance(request.data, dict) or set(request.data) != {"review_state"}:
            raise ValidationError("Send a review_state.")
        state = request.data["review_state"]
        if state not in (Flashcard.State.KNOWN, Flashcard.State.REVIEW_AGAIN):
            raise ValidationError("Review state must be Known or Review Again.")
        cards = course_cards(course_id).filter(pk=card_id)
        cards.update(review_state=state)
        card = get_object_or_404(cards)
        return Response(card_data(card))
