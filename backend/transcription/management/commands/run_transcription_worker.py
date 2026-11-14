import time

from django.core.management.base import BaseCommand
from django.utils import timezone

from materials.models import Material
from transcription.models import TranscriptionJob
from transcription.service import process_job


class Command(BaseCommand):
    help = "Process queued recording transcriptions outside HTTP requests (run one worker for the local demo)."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true", help="Process one queued job, then stop")
        parser.add_argument("--recover", action="store_true", help="Mark interrupted jobs failed (only when all other workers are stopped)")

    def handle(self, *args, **options):
        if options["recover"]:
            # shortcut: recovery is operator-driven; use heartbeats before running multiple workers.
            interrupted = TranscriptionJob.objects.filter(status__in=[
                TranscriptionJob.Status.EXTRACTING, TranscriptionJob.Status.TRANSCRIBING,
                TranscriptionJob.Status.INDEXING,
            ])
            for job in interrupted:
                job.status, job.error, job.completed_at = (
                    TranscriptionJob.Status.FAILED,
                    "Worker was interrupted. Upload the recording again to retry (may incur another charge).",
                    timezone.now(),
                )
                job.save(update_fields=["status", "error", "completed_at"])
                source = job.source_material
                source.status, source.error = Material.Status.FAILED, job.error
                source.save(update_fields=["status", "error"])
            if options["once"]:
                return
        while True:
            job = TranscriptionJob.objects.filter(status=TranscriptionJob.Status.QUEUED).order_by("created_at").first()
            if job:
                process_job(job)
                self.stdout.write(f"Transcription job {job.pk}: {job.status}")
            if options["once"]:
                return
            if not job:
                time.sleep(2)
