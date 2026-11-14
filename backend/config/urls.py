from django.urls import include, path
from rest_framework.routers import SimpleRouter

from courses.views import CourseViewSet
from materials.views import CourseMaterialsView

router = SimpleRouter()
router.register("courses", CourseViewSet, basename="course")

urlpatterns = [
    path("api/courses/<int:course_id>/materials/", CourseMaterialsView.as_view(), name="course-materials"),
    path("api/", include(router.urls)),
]
