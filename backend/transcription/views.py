from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from courses.models import Course
from materials.models import Material, SourceChunk

from .models import TranscriptionJob
from .serializers import TranscriptionJobSerializer
from .service import submit_recording


class RecordingsView(APIView):
    parser_classes = [MultiPartParser]

    def get(self, request, course_id):
        course = get_object_or_404(Course, pk=course_id)
        jobs = TranscriptionJob.objects.filter(course=course).order_by("-created_at", "-id")
        return Response(TranscriptionJobSerializer(jobs, many=True).data)

    def post(self, request, course_id):
        course = get_object_or_404(Course, pk=course_id)
        uploaded = request.FILES.get("file")
        if uploaded is None:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"file": "Select an MP4 or MP3 recording."})
        job, created = submit_recording(course, uploaded)
        return Response(TranscriptionJobSerializer(job).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class JobView(APIView):
    def get(self, request, job_id):
        return Response(TranscriptionJobSerializer(get_object_or_404(TranscriptionJob, pk=job_id)).data)


class TranscriptView(APIView):
    def get(self, request, material_id):
        material = get_object_or_404(Material, pk=material_id, kind=Material.Kind.TRANSCRIPT, status=Material.Status.READY)
        return Response(list(SourceChunk.objects.filter(material=material).order_by("sequence").values(
            "id", "sequence", "text", "start_seconds", "end_seconds"
        )))
