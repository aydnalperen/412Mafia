from django.core.exceptions import ValidationError
from django.db import models


class ExamQuestion(models.Model):
    course = models.ForeignKey("courses.Course", on_delete=models.CASCADE, related_name="questions")
    material = models.ForeignKey("materials.Material", on_delete=models.CASCADE, related_name="questions")
    question_number = models.CharField(max_length=50, blank=True)
    text = models.TextField()
    page_number = models.PositiveIntegerField(null=True, blank=True)

    def clean(self):
        if self.material_id and self.course_id != self.material.course_id:
            raise ValidationError("Question and source material must belong to the same course.")
        if self.material_id and self.material.kind != self.material.Kind.EXAM:
            raise ValidationError("Questions must refer to an exam material.")

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)


class QuestionSourceLink(models.Model):
    question = models.ForeignKey(ExamQuestion, on_delete=models.CASCADE, related_name="source_links")
    chunk = models.ForeignKey("materials.SourceChunk", on_delete=models.CASCADE, related_name="question_links")
    score = models.FloatField()
    reason = models.TextField()
    method = models.CharField(max_length=40)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["question", "chunk"], name="unique_question_chunk")]

    def clean(self):
        if self.question_id and self.chunk_id and self.question.course_id != self.chunk.material.course_id:
            raise ValidationError("Cited chunk must belong to the question's course.")

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)


class OralSession(models.Model):
    course = models.ForeignKey("courses.Course", on_delete=models.CASCADE)
    question = models.ForeignKey(ExamQuestion, on_delete=models.CASCADE)
    sources = models.ManyToManyField("materials.SourceChunk")
    status = models.CharField(max_length=12, default="active")
    current_question = models.TextField(blank=True)
    report = models.JSONField(null=True, blank=True)
    started_at = models.DateTimeField(auto_now_add=True)

    def clean(self):
        if self.question_id and self.course_id != self.question.course_id:
            raise ValidationError("Oral question must belong to the course.")

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)


class OralTurn(models.Model):
    session = models.ForeignKey(OralSession, on_delete=models.CASCADE, related_name="turns")
    turn_index = models.PositiveSmallIntegerField()
    question = models.TextField()
    answer = models.TextField()
    feedback = models.JSONField()

    class Meta:
        constraints = [models.UniqueConstraint(fields=["session", "turn_index"], name="unique_oral_turn")]
