from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("courses", "0001_initial"),
        ("exams", "0002_oralsession_oralturn"),
        ("knowledge", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="ProfessorFeedback",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("author_name", models.CharField(default="Course Instructor", max_length=80)),
                (
                    "category",
                    models.CharField(
                        choices=[
                            ("rubric_note", "Rubric & grading note"),
                            ("emphasis", "Exam emphasis"),
                            ("clarification", "Concept clarification"),
                            ("coverage_gap", "Coverage gap"),
                        ],
                        default="rubric_note",
                        max_length=24,
                    ),
                ),
                ("title", models.CharField(max_length=160)),
                ("comment", models.TextField(max_length=2000)),
                ("is_pinned", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "course",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="professor_feedback",
                        to="courses.course",
                    ),
                ),
                (
                    "question",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="professor_feedback",
                        to="exams.examquestion",
                    ),
                ),
                (
                    "topic",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="professor_feedback",
                        to="knowledge.topic",
                    ),
                ),
            ],
            options={
                "ordering": ["-is_pinned", "-created_at", "-id"],
            },
        ),
    ]
