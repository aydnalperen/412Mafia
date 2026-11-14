from django.urls import include, path
from rest_framework.routers import SimpleRouter

from courses.views import CourseViewSet
from materials.views import CourseMaterialsView
from transcription.views import JobView, RecordingsView, TranscriptView

router = SimpleRouter()
router.register("courses", CourseViewSet, basename="course")

urlpatterns = [
    path("api/courses/<int:course_id>/materials/", CourseMaterialsView.as_view(), name="course-materials"),
    path("api/courses/<int:course_id>/recordings/", RecordingsView.as_view(), name="course-recordings"),
    path("api/transcription-jobs/<int:job_id>/", JobView.as_view(), name="transcription-job"),
    path("api/materials/<int:material_id>/transcript/", TranscriptView.as_view(), name="material-transcript"),
    path("api/", include(router.urls)),
]
