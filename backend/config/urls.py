from django.urls import include, path
from rest_framework.routers import SimpleRouter

from courses.views import CourseViewSet
from exams.views import QuestionsView, QuestionSourcesView
from exams.oral_views import OralAnswerView, OralReportView, OralSessionListView, OralSessionView, OralStartView
from flashcards.views import FlashcardReviewView, FlashcardsView, GenerateFlashcardsView
from knowledge.views import GenerateKnowledgeView, KnowledgeView
from materials.views import CourseMaterialsView, MaterialDetailView
from professor.views import (
    CoursePipelineView,
    ProfessorDashboardView,
    ProfessorFeedbackDetailView,
    ProfessorFeedbackListCreateView,
    ProfessorInsightsView,
    ProfessorLinkQuestionsView,
)
from transcription.views import JobView, RecordingsView, TranscriptView

router = SimpleRouter()
router.register("courses", CourseViewSet, basename="course")

urlpatterns = [
    path("api/courses/<int:course_id>/flashcards/", FlashcardsView.as_view(), name="course-flashcards"),
    path("api/courses/<int:course_id>/flashcards/generate/", GenerateFlashcardsView.as_view(), name="generate-flashcards"),
    path("api/courses/<int:course_id>/flashcards/<int:card_id>/", FlashcardReviewView.as_view(), name="review-flashcard"),
    path("api/courses/<int:course_id>/oral/", OralSessionListView.as_view(), name="oral-list"),
    path("api/courses/<int:course_id>/oral/start/", OralStartView.as_view(), name="oral-start"),
    path("api/oral/<int:session_id>/", OralSessionView.as_view(), name="oral-session"),
    path("api/oral/<int:session_id>/answer/", OralAnswerView.as_view(), name="oral-answer"),
    path("api/oral/<int:session_id>/report/", OralReportView.as_view(), name="oral-report"),
    path("api/courses/<int:course_id>/knowledge/", KnowledgeView.as_view(), name="course-knowledge"),
    path("api/courses/<int:course_id>/knowledge/generate/", GenerateKnowledgeView.as_view(), name="generate-knowledge"),
    path("api/courses/<int:course_id>/questions/", QuestionsView.as_view(), name="course-questions"),
    path("api/questions/<int:question_id>/sources/", QuestionSourcesView.as_view(), name="question-sources"),
    path("api/courses/<int:course_id>/materials/", CourseMaterialsView.as_view(), name="course-materials"),
    path("api/courses/<int:course_id>/materials/<int:material_id>/", MaterialDetailView.as_view(), name="course-material-detail"),
    path("api/courses/<int:course_id>/recordings/", RecordingsView.as_view(), name="course-recordings"),
    path("api/courses/<int:course_id>/professor/", ProfessorDashboardView.as_view(), name="professor-dashboard"),
    path("api/courses/<int:course_id>/professor/link-questions/", ProfessorLinkQuestionsView.as_view(), name="professor-link-questions"),
    path("api/courses/<int:course_id>/professor/feedback/", ProfessorFeedbackListCreateView.as_view(), name="professor-feedback"),
    path("api/courses/<int:course_id>/professor/feedback/<int:feedback_id>/", ProfessorFeedbackDetailView.as_view(), name="professor-feedback-detail"),
    path("api/courses/<int:course_id>/professor/insights/", ProfessorInsightsView.as_view(), name="professor-insights"),
    path("api/courses/<int:course_id>/pipeline/", CoursePipelineView.as_view(), name="course-pipeline"),
    path("api/transcription-jobs/<int:job_id>/", JobView.as_view(), name="transcription-job"),
    path("api/materials/<int:material_id>/transcript/", TranscriptView.as_view(), name="material-transcript"),
    path("api/", include(router.urls)),
]
