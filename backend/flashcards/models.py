from django.db import models


class Flashcard(models.Model):
    class State(models.TextChoices):
        NEW = "new", "New"
        KNOWN = "known", "Known"
        REVIEW_AGAIN = "review_again", "Review Again"

    source = models.ForeignKey("materials.SourceChunk", on_delete=models.CASCADE)
    front = models.CharField(max_length=300)
    back = models.CharField(max_length=120)
    review_state = models.CharField(max_length=12, choices=State.choices, default=State.NEW)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["source", "front", "back"], name="unique_sourced_flashcard"),
        ]
