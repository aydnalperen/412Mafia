from pathlib import Path

from rest_framework import serializers

from .models import Material


class MaterialSerializer(serializers.ModelSerializer):
    file_name = serializers.SerializerMethodField()

    class Meta:
        model = Material
        fields = ("id", "kind", "file_name", "status", "error", "created_at")

    def get_file_name(self, material):
        return Path(material.file.name).name


class UploadSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=Material.Kind.choices)
    file = serializers.FileField(allow_empty_file=False)
