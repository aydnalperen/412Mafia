from django.db import models


class ProfessorFeedback(models.Model):
    class Category(models.TextChoices):
        RUBRIC_NOTE = "rubric_note", "Rubric & grading note"
        EMPHASIS = "emphasis", "Exam emphasis"
        CLARIFICATION = "clarification", "Concept clarification"
        COVERAGE_GAP = "coverage_gap", "Coverage gap"

    course = models.ForeignKey(
        "courses.Course",
        on_delete=models.CASCADE,
        related_name="professor_feedback",
    )
    topic = models.ForeignKey(
        "knowledge.Topic",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="professor_feedback",
    )
    question = models.ForeignKey(
        "exams.ExamQuestion",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="professor_feedback",
    )
    author_name = models.CharField(max_length=80, default="Course Instructor")
    category = models.CharField(
        max_length=24,
        choices=Category.choices,
        default=Category.RUBRIC_NOTE,
    )
    title = models.CharField(max_length=160)
    comment = models.TextField(max_length=2000)
    is_pinned = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-is_pinned", "-created_at", "-id"]
