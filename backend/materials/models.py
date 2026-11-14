from django.core.exceptions import ValidationError
from django.db import models


class Material(models.Model):
    class Kind(models.TextChoices):
        TRANSCRIPT = "transcript", "Transcript"
        SLIDES = "slides", "Slides"
        EXAM = "exam", "Past exam"
        STUDY = "study", "Study material"

    class Status(models.TextChoices):
        UPLOADED = "uploaded", "Uploaded"
        PROCESSING = "processing", "Processing"
        READY = "ready", "Ready"
        FAILED = "failed", "Failed"

    course = models.ForeignKey("courses.Course", on_delete=models.CASCADE, related_name="materials")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    file = models.FileField(upload_to="materials/", max_length=255)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.UPLOADED)
    error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    source_material = models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT, related_name="derived_materials")
    file_hash = models.CharField(max_length=64, blank=True, db_index=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["course", "kind", "file_hash"], condition=~models.Q(file_hash=""), name="unique_course_material_file")
        ]

    def clean(self):
        if self.source_material_id and self.source_material.course_id != self.course_id:
            raise ValidationError("Derived material must belong to the same course as its source.")

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)


class SourceChunk(models.Model):
    material = models.ForeignKey(Material, on_delete=models.CASCADE, related_name="chunks")
    text = models.TextField()
    sequence = models.PositiveIntegerField()
    page_number = models.PositiveIntegerField(null=True, blank=True)
    start_seconds = models.FloatField(null=True, blank=True)
    end_seconds = models.FloatField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["material", "sequence"], name="unique_chunk_sequence")]
        ordering = ["sequence"]

    def clean(self):
        if (self.start_seconds is None) != (self.end_seconds is None):
            raise ValidationError("Both timestamp boundaries must be supplied together.")
        if self.start_seconds is not None and (self.start_seconds < 0 or self.end_seconds <= self.start_seconds):
            raise ValidationError("Invalid timestamp range.")
