import unicodedata

from django.core.exceptions import ValidationError
from django.db import models


def normalize_name(name):
    return " ".join(unicodedata.normalize("NFKC", name).casefold().split())


class Topic(models.Model):
    course = models.ForeignKey("courses.Course", on_delete=models.CASCADE, related_name="topics")
    name = models.CharField(max_length=120)
    normalized_name = models.CharField(max_length=360, editable=False)
    description = models.TextField(blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["course", "normalized_name"], name="unique_course_topic_name")
        ]

    def clean(self):
        self.normalized_name = normalize_name(self.name)
        if not self.normalized_name:
            raise ValidationError({"name": "Topic name must contain text."})

    def save(self, *args, **kwargs):
        self.full_clean()
        if kwargs.get("update_fields") is not None and "name" in kwargs["update_fields"]:
            kwargs["update_fields"] = {*kwargs["update_fields"], "normalized_name"}
        return super().save(*args, **kwargs)


class TopicSourceLink(models.Model):
    topic = models.ForeignKey(Topic, on_delete=models.CASCADE, related_name="source_links")
    chunk = models.ForeignKey("materials.SourceChunk", on_delete=models.CASCADE)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["topic", "chunk"], name="unique_topic_chunk")]

    def clean(self):
        if self.topic_id and self.chunk_id and self.topic.course_id != self.chunk.material.course_id:
            raise ValidationError("Topic and source must belong to the same course.")

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)


class QuestionTopicLink(models.Model):
    question = models.ForeignKey("exams.ExamQuestion", on_delete=models.CASCADE)
    topic = models.ForeignKey(Topic, on_delete=models.CASCADE, related_name="question_links")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["question", "topic"], name="unique_question_topic")]

    def clean(self):
        if self.question_id and self.topic_id and self.question.course_id != self.topic.course_id:
            raise ValidationError("Question and topic must belong to the same course.")

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)
