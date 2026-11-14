from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from courses.models import Course

from .ingestion import ingest_upload
from .models import Material
from .serializers import MaterialSerializer, UploadSerializer


class CourseMaterialsView(APIView):
    parser_classes = [MultiPartParser]

    def get(self, request, course_id):
        course = get_object_or_404(Course, pk=course_id)
        materials = Material.objects.filter(course=course).order_by("-created_at", "-id")
        return Response(MaterialSerializer(materials, many=True).data)

    def post(self, request, course_id):
        course = get_object_or_404(Course, pk=course_id)
        serializer = UploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        material, created = ingest_upload(course, serializer.validated_data["kind"], serializer.validated_data["file"])
        if material.kind == Material.Kind.EXAM and material.status == Material.Status.READY:
            from exams.service import extract_questions
            extract_questions(material)
        return Response(MaterialSerializer(material).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
