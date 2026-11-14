from rest_framework import mixins, viewsets

from .models import Course
from .serializers import CourseSerializer


class CourseViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = Course.objects.all().order_by("-created_at", "-id")
    serializer_class = CourseSerializer
