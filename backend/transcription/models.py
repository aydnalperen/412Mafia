from django.core.exceptions import ValidationError
from django.db import models


class TranscriptionJob(models.Model):
    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        EXTRACTING = "extracting_audio", "Extracting audio"
        TRANSCRIBING = "transcribing", "Transcribing"
        INDEXING = "indexing", "Indexing"
        READY = "ready", "Ready"
        FAILED = "failed", "Failed"

    course = models.ForeignKey("courses.Course", on_delete=models.CASCADE)
    source_material = models.ForeignKey("materials.Material", on_delete=models.PROTECT, related_name="transcription_jobs")
    output_material = models.ForeignKey("materials.Material", on_delete=models.PROTECT, null=True, blank=True, related_name="generated_by_jobs")
    model = models.CharField(max_length=120)
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.QUEUED)
    progress = models.PositiveSmallIntegerField(default=0)
    duration_seconds = models.FloatField(null=True, blank=True)
    error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["source_material", "model"], name="unique_recording_model_job")]

    def clean(self):
        if self.source_material_id and (self.source_material.course_id != self.course_id or self.source_material.kind != self.source_material.Kind.RECORDING):
            raise ValidationError("Job source must be a recording from the same course.")
        if self.output_material_id and (self.output_material.course_id != self.course_id or self.output_material.source_material_id != self.source_material_id):
            raise ValidationError("Derived transcript must belong to this recording and course.")

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)


class AIUsageEvent(models.Model):
    job = models.ForeignKey(TranscriptionJob, on_delete=models.CASCADE, related_name="usage_events")
    model = models.CharField(max_length=120)
    audio_seconds = models.FloatField()
    estimated_cost_usd = models.DecimalField(max_digits=12, decimal_places=6)
    created_at = models.DateTimeField(auto_now_add=True)
