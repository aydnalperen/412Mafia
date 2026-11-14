import json
import os
import tempfile
from decimal import Decimal
from pathlib import Path
from subprocess import CompletedProcess
from unittest.mock import MagicMock, patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from courses.models import Course
from materials.models import Material

from .models import AIUsageEvent, TranscriptionJob
from .service import TranscriptionError, normalize_response, probe_recording, transcribe_audio


class RecordingTests(TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        storage = override_settings(MEDIA_ROOT=directory.name)
        storage.enable()
        self.addCleanup(storage.disable)
        self.course = Course.objects.create(name="Signals")
        self.url = f"/api/courses/{self.course.pk}/recordings/"
        env = patch.dict(os.environ, {
            "OPENROUTER_API_KEY": "fake-test-key", "OPENROUTER_STT_MODEL": "openai/whisper-large-v3",
            "AI_BUDGET_USD": "8", "STT_ESTIMATED_USD_PER_SECOND": "0.00005",
        })
        env.start()
        self.addCleanup(env.stop)

    def upload(self, name="lecture.mp3", data=b"ID3test-audio"):
        return self.client.post(self.url, {"file": SimpleUploadedFile(name, data)})

    def test_upload_is_queued_and_idempotent_without_request_time_processing(self):
        first = self.upload()
        self.assertEqual(first.status_code, 201)
        self.assertEqual(first.json()["status"], "queued")
        self.assertIsNone(first.json()["output_material_id"])
        self.assertEqual(self.upload().status_code, 200)
        self.assertEqual(TranscriptionJob.objects.count(), 1)
        self.assertEqual(Material.objects.count(), 1)
        self.assertEqual(self.client.get(self.url).json()[0]["id"], first.json()["id"])

    def test_rejects_wrong_format_and_missing_credentials(self):
        self.assertEqual(self.upload("video.mp4", b"ID3audio").status_code, 400)
        self.assertEqual(self.upload("not-a-recording.txt").status_code, 400)
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": ""}):
            self.assertEqual(self.upload().status_code, 400)
        self.assertEqual(Material.objects.count(), 0)

    def test_probe_rejects_video_without_audio_and_long_recording(self):
        def metadata(streams, duration):
            return CompletedProcess([], 0, json.dumps({
                "format": {"duration": duration, "format_name": "mov,mp4,m4a,3gp,3g2,mj2"},
                "streams": streams,
            }), "")
        with patch("transcription.service.subprocess.run", return_value=metadata([{"codec_type": "video"}], "12")):
            with self.assertRaisesRegex(TranscriptionError, "no audio stream"):
                probe_recording(Path("/ignored.mp4"), ".mp4")
        with patch("transcription.service.subprocess.run", return_value=metadata([{"codec_type": "audio"}], "901")):
            with self.assertRaisesRegex(TranscriptionError, "duration"):
                probe_recording(Path("/ignored.mp4"), ".mp4")

    def test_real_provider_timestamps_are_shifted_but_missing_ones_never_invented(self):
        timed = normalize_response({"text": "Hello", "segments": [{"text": "Hello", "start": 1.2, "end": 2.3}]}, 180, 180)
        self.assertEqual((timed[0].start_seconds, timed[0].end_seconds), (181.2, 182.3))
        untimed = normalize_response({"text": "Hello"}, 180, 180)
        self.assertIsNone(untimed[0].start_seconds)
        with self.assertRaisesRegex(TranscriptionError, "timestamps"):
            normalize_response({"segments": [{"text": "Bad", "start": -1, "end": 2}]}, 180, 180)

    def test_openrouter_uses_audio_endpoint_and_requests_segment_timestamps(self):
        response = MagicMock()
        response.read.return_value = b'{"text":"Real transcription"}'
        response.__enter__.return_value = response
        with patch("transcription.service.urlopen", return_value=response) as call:
            self.assertEqual(transcribe_audio(b"audio")["text"], "Real transcription")
        request = call.call_args.args[0]
        self.assertEqual(request.full_url, "https://openrouter.ai/api/v1/audio/transcriptions")
        payload = json.loads(request.data)
        self.assertEqual(payload["model"], "openai/whisper-large-v3")
        self.assertEqual(payload["response_format"], "verbose_json")
        self.assertEqual(payload["timestamp_granularities"], ["segment"])
        self.assertEqual(payload["input_audio"]["format"], "mp3")

    @patch("transcription.service.transcribe_audio")
    @patch("transcription.service.extract_audio")
    @patch("transcription.service.probe_recording", return_value=4)
    def test_worker_indexes_derived_transcript_and_tracks_cost(self, probe, extract, transcribe):
        created = self.upload()
        job_id = created.json()["id"]
        extract.side_effect = lambda path, destination, offset, seconds: destination.write_bytes(b"mp3")
        transcribe.return_value = {
            "text": "Aliasing and sampling theorem", "segments": [
                {"text": "Aliasing and sampling theorem", "start": 1, "end": 3},
            ], "usage": {"cost": 0.0001},
        }
        from django.core.management import call_command
        call_command("run_transcription_worker", "--once")
        job = TranscriptionJob.objects.get(pk=job_id)
        self.assertEqual(job.status, "ready")
        self.assertEqual(job.output_material.source_material_id, job.source_material_id)
        self.assertEqual(job.output_material.chunks.count(), 1)
        self.assertEqual(job.output_material.chunks.first().start_seconds, 1)
        self.assertEqual(AIUsageEvent.objects.get(job=job).estimated_cost_usd, Decimal("0.000100"))
        preview = self.client.get(f"/api/materials/{job.output_material_id}/transcript/")
        self.assertEqual(preview.json()[0]["text"], "Aliasing and sampling theorem")

    @patch("transcription.service.transcribe_audio")
    @patch("transcription.service.extract_audio")
    @patch("transcription.service.probe_recording", return_value=185)
    def test_multiple_audio_pieces_keep_absolute_timestamps(self, probe, extract, transcribe):
        job_id = self.upload().json()["id"]
        extract.side_effect = lambda path, destination, offset, seconds: destination.write_bytes(b"mp3")
        transcribe.side_effect = [
            {"segments": [{"text": "First part", "start": 179, "end": 180}]},
            {"segments": [{"text": "Second part", "start": 1, "end": 2}]},
        ]
        from django.core.management import call_command
        call_command("run_transcription_worker", "--once")
        job = TranscriptionJob.objects.get(pk=job_id)
        self.assertEqual(job.status, "ready")
        self.assertEqual(list(job.output_material.chunks.values_list("start_seconds", "end_seconds")), [(179, 182)])
        self.assertIn("Second part", job.output_material.chunks.first().text)
        self.assertEqual(AIUsageEvent.objects.filter(job=job).count(), 2)

    @patch("transcription.service.transcribe_audio", side_effect=TranscriptionError("OpenRouter timed out"))
    @patch("transcription.service.extract_audio")
    @patch("transcription.service.probe_recording", return_value=4)
    def test_failure_is_visible_and_retry_reuses_job(self, probe, extract, transcribe):
        first = self.upload().json()
        extract.side_effect = lambda path, destination, offset, seconds: destination.write_bytes(b"mp3")
        from django.core.management import call_command
        call_command("run_transcription_worker", "--once")
        self.assertEqual(self.client.get(f"/api/transcription-jobs/{first['id']}/").json()["status"], "failed")
        self.assertEqual(AIUsageEvent.objects.count(), 1)
        retry = self.upload()
        self.assertEqual(retry.json()["id"], first["id"])
        self.assertEqual(retry.json()["status"], "queued")
        self.assertEqual(Material.objects.count(), 1)

    @patch("transcription.service.probe_recording", return_value=60)
    def test_budget_exhaustion_prevents_ai_call(self, probe):
        first = self.upload().json()
        with patch.dict(os.environ, {"AI_BUDGET_USD": "0.00001"}):
            from django.core.management import call_command
            call_command("run_transcription_worker", "--once")
        self.assertIn("budget", self.client.get(f"/api/transcription-jobs/{first['id']}/").json()["error"])
        self.assertEqual(AIUsageEvent.objects.count(), 0)

    def test_operator_can_mark_interrupted_job_failed_without_rebilling(self):
        first = self.upload().json()
        job = TranscriptionJob.objects.get(pk=first["id"])
        job.status = TranscriptionJob.Status.TRANSCRIBING
        job.save(update_fields=["status"])
        from django.core.management import call_command
        call_command("run_transcription_worker", "--recover", "--once")
        job.refresh_from_db()
        self.assertEqual(job.status, "failed")
        self.assertIn("interrupted", job.error)
        self.assertEqual(AIUsageEvent.objects.count(), 0)
