from django.urls import include, path
from rest_framework.routers import SimpleRouter

from courses.views import CourseViewSet

router = SimpleRouter()
router.register("courses", CourseViewSet, basename="course")

urlpatterns = [path("api/", include(router.urls))]
