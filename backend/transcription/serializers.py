from rest_framework import serializers

from .models import TranscriptionJob


class TranscriptionJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = TranscriptionJob
        fields = ("id", "status", "error", "progress", "source_material_id", "output_material_id", "created_at")
