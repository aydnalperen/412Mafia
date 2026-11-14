"""Bounded recording -> audio -> Whisper -> existing transcript chunks."""

import hashlib
import json
import logging
import math
import os
import subprocess
import tempfile
import uuid
from decimal import Decimal, InvalidOperation
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.core.files.base import ContentFile
from django.core.exceptions import SuspiciousFileOperation
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from django.utils.text import get_valid_filename
from rest_framework.exceptions import ValidationError

from materials.ingestion import group_segments, text_chunks
from materials.models import Material
from materials.segments import TranscriptSegment, create_transcript_chunks

from .models import AIUsageEvent, TranscriptionJob

logger = logging.getLogger(__name__)
SEGMENT_SECONDS = 180
WHISPER_MODEL = "whisper-1"


class TranscriptionError(Exception):
    pass


def rate():
    return Decimal(os.environ.get("STT_ESTIMATED_USD_PER_SECOND", "0.00005"))


def budget_allows(seconds):
    # shortcut: only one demo worker should run; add atomic budget reservations before parallel workers.
    spent = AIUsageEvent.objects.aggregate(total=Sum("estimated_cost_usd"))["total"] or Decimal("0")
    return spent + Decimal(str(seconds)) * rate() <= Decimal(os.environ.get("AI_BUDGET_USD", "8"))


def submit_recording(course, uploaded):
    try:
        name = get_valid_filename(Path(uploaded.name.replace("\\", "/")).name)
    except SuspiciousFileOperation as exc:
        raise ValidationError({"file": "Invalid filename."}) from exc
    extension = Path(name).suffix.lower()
    if not name or len(name) > 120 or extension not in (".mp4", ".mp3"):
        raise ValidationError({"file": "Upload an MP4 video or MP3 audio file."})
    limit = int(os.environ.get("MAX_MEDIA_UPLOAD_MB", "50")) * 1024 * 1024
    if uploaded.size > limit:
        raise ValidationError({"file": "Recording exceeds the configured upload size limit."})
    data = uploaded.read(limit + 1)
    if not data or len(data) > limit:
        raise ValidationError({"file": "Recording is empty or exceeds the configured upload size limit."})
    if extension == ".mp4":
        valid = len(data) >= 12 and data[4:8] == b"ftyp"
    else:
        valid = data.startswith(b"ID3") or (len(data) >= 2 and data[0] == 0xff and data[1] & 0xe0 == 0xe0)
    if not valid:
        raise ValidationError({"file": "Recording content does not match its MP4/MP3 extension."})
    if not os.environ.get("OPENAI_API_KEY"):
        raise ValidationError({"file": "Configure OPENAI_API_KEY on the backend before uploading recordings."})
    digest = hashlib.sha256(data).hexdigest()
    source = Material.objects.filter(course=course, kind=Material.Kind.RECORDING, file_hash=digest).first()
    if source is None:
        source = Material.objects.create(course=course, kind=Material.Kind.RECORDING, file=ContentFile(data, name=name), file_hash=digest)
    model = WHISPER_MODEL
    job, created = TranscriptionJob.objects.get_or_create(course=course, source_material=source, model=model)
    if not created and job.status == TranscriptionJob.Status.FAILED:
        job.status, job.error, job.progress, job.completed_at = TranscriptionJob.Status.QUEUED, "", 0, None
        job.save(update_fields=["status", "error", "progress", "completed_at"])
    return job, created


def probe_recording(path, extension):
    try:
        result = subprocess.run(
            [os.environ.get("FFPROBE_BIN", "ffprobe"), "-v", "error", "-show_entries",
             "format=duration,format_name:stream=codec_type", "-of", "json", str(path)],
            check=True, capture_output=True, text=True, timeout=30,
        )
        metadata = json.loads(result.stdout)
        container = metadata.get("format", {}).get("format_name", "").split(",")
        if (extension == ".mp3" and "mp3" not in container) or (extension == ".mp4" and "mp4" not in container):
            raise TranscriptionError("Recording container does not match its extension.")
        if not any(stream.get("codec_type") == "audio" for stream in metadata.get("streams", [])):
            raise TranscriptionError("Recording has no audio stream.")
        duration = float(metadata["format"]["duration"])
        if not math.isfinite(duration) or duration <= 0 or duration > int(os.environ.get("MAX_MEDIA_DURATION_MINUTES", "15")) * 60:
            raise TranscriptionError("Recording duration is invalid or exceeds the configured limit.")
        return duration
    except (OSError, subprocess.TimeoutExpired, subprocess.CalledProcessError, ValueError, KeyError, TypeError) as exc:
        raise TranscriptionError("Could not probe recording; check FFprobe and the media file.") from exc


def extract_audio(path, destination, offset, seconds):
    try:
        subprocess.run(
            [os.environ.get("FFMPEG_BIN", "ffmpeg"), "-nostdin", "-v", "error",
             "-ss", str(offset), "-t", str(seconds), "-i", str(path),
             "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", "-y", str(destination)],
            check=True, capture_output=True, timeout=120,
        )
        if not destination.is_file() or destination.stat().st_size == 0:
            raise TranscriptionError("Audio extraction produced no sound data.")
    except (OSError, subprocess.TimeoutExpired, subprocess.CalledProcessError) as exc:
        raise TranscriptionError("Audio extraction failed; check FFmpeg and the recording.") from exc


def normalize_response(payload, offset, seconds):
    if not isinstance(payload, dict):
        raise TranscriptionError("Invalid transcription response.")
    segments = payload.get("segments")
    if segments:
        if not isinstance(segments, list):
            raise TranscriptionError("Invalid transcription segments.")
        result = []
        previous_start = 0
        for item in segments:
            if not isinstance(item, dict) or not isinstance(item.get("text"), str) or not item["text"].strip():
                raise TranscriptionError("Invalid transcription segments.")
            start, end = item.get("start"), item.get("end")
            if (isinstance(start, bool) or isinstance(end, bool) or
                    not isinstance(start, (int, float)) or not isinstance(end, (int, float)) or
                    not math.isfinite(start) or not math.isfinite(end) or
                    start < previous_start or start < 0 or end <= start):
                raise TranscriptionError("Invalid provider timestamps; transcript not indexed.")
            # Whisper can report a segment ending past the extracted audio: keep its text, not a false citation time.
            if start >= seconds or end > seconds:
                result.append(TranscriptSegment(item["text"].strip()))
            else:
                result.append(TranscriptSegment(item["text"].strip(), offset + start, offset + end))
            previous_start = start
        return result
    text = payload.get("text")
    if not isinstance(text, str) or not text.strip():
        raise TranscriptionError("Provider returned an empty transcript.")
    # Provider returned no segments: keep timings unavailable, never infer from audio offsets.
    return [TranscriptSegment(piece) for piece in text_chunks(text)]


def transcribe_audio(audio):
    boundary = uuid.uuid4().hex
    data = b"".join(
        b"--" + boundary.encode() + b"\r\nContent-Disposition: form-data; name=\"" + name +
        b"\"\r\n\r\n" + value + b"\r\n"
        for name, value in ((b"model", WHISPER_MODEL.encode()), (b"response_format", b"verbose_json"),
                            (b"timestamp_granularities[]", b"segment"))
    ) + (b"--" + boundary.encode() + b"\r\nContent-Disposition: form-data; name=\"file\"; "
         b"filename=\"segment.mp3\"\r\nContent-Type: audio/mpeg\r\n\r\n" + audio +
         b"\r\n--" + boundary.encode() + b"--\r\n")
    request = Request("https://api.openai.com/v1/audio/transcriptions", data=data, headers={
        "Authorization": "Bearer " + os.environ["OPENAI_API_KEY"],
        "Content-Type": "multipart/form-data; boundary=" + boundary,
    })
    try:
        with urlopen(request, timeout=75) as response:
            body = response.read(1024 * 1024 + 1)
            if len(body) > 1024 * 1024:
                raise TranscriptionError("OpenAI transcription response is too large.")
            return json.loads(body)
    except HTTPError as exc:
        raise TranscriptionError(f"OpenAI transcription failed (HTTP {exc.code}); check API key, billing, and Whisper access.") from exc
    except (URLError, TimeoutError, OSError, ValueError) as exc:
        raise TranscriptionError("OpenAI transcription timed out or returned invalid JSON.") from exc


def process_job(job):
    # Atomically claim this job so two accidentally started workers cannot bill it twice.
    if not TranscriptionJob.objects.filter(pk=job.pk, status=TranscriptionJob.Status.QUEUED).update(
        status=TranscriptionJob.Status.EXTRACTING, progress=5
    ):
        return
    job.status, job.progress = TranscriptionJob.Status.EXTRACTING, 5
    source = job.source_material
    try:
        source.status = Material.Status.PROCESSING
        source.error = ""
        source.save(update_fields=["status", "error"])
        duration = probe_recording(source.file.path, Path(source.file.name).suffix.lower())
        job.duration_seconds = duration
        job.save(update_fields=["duration_seconds"])
        if not budget_allows(duration):
            raise TranscriptionError("AI budget exhausted; no transcription was requested.")
        all_segments = []
        count = math.ceil(duration / SEGMENT_SECONDS)
        with tempfile.TemporaryDirectory() as temporary:
            for index in range(count):
                offset = index * SEGMENT_SECONDS
                length = min(SEGMENT_SECONDS, duration - offset)
                output = Path(temporary) / f"part-{index}.mp3"
                extract_audio(source.file.path, output, offset, length)
                job.status, job.progress = TranscriptionJob.Status.TRANSCRIBING, 10 + int(75 * index / count)
                job.save(update_fields=["status", "progress"])
                if not budget_allows(length):
                    raise TranscriptionError("AI budget exhausted before the next audio segment.")
                payload = None
                try:
                    payload = transcribe_audio(output.read_bytes())
                    segments = normalize_response(payload, offset, length)
                finally:
                    # A timed-out request may have been billed upstream; reserve estimated spend.
                    raw = payload.get("usage", {}).get("cost") if isinstance(payload, dict) and isinstance(payload.get("usage"), dict) else None
                    try:
                        cost = Decimal(str(raw)) if raw is not None else Decimal(str(length)) * rate()
                        if not cost.is_finite() or cost < 0:
                            raise InvalidOperation()
                    except (InvalidOperation, ValueError):
                        cost = Decimal(str(length)) * rate()
                    AIUsageEvent.objects.create(job=job, model=job.model, audio_seconds=length, estimated_cost_usd=cost)
                all_segments.extend(segments)
        job.status, job.progress = TranscriptionJob.Status.INDEXING, 90
        job.save(update_fields=["status", "progress"])
        with transaction.atomic():
            content = "\n".join(segment.text for segment in all_segments)
            derived = Material.objects.create(
                course=job.course, kind=Material.Kind.TRANSCRIPT, source_material=source,
                file=ContentFile(content.encode("utf-8"), name=f"recording-{source.pk}-transcript.txt"),
                status=Material.Status.PROCESSING,
            )
            create_transcript_chunks(derived, group_segments(all_segments))
            job.output_material = derived
            job.status, job.progress, job.completed_at = TranscriptionJob.Status.READY, 100, timezone.now()
            job.save(update_fields=["output_material", "status", "progress", "completed_at"])
            source.status = Material.Status.READY
            source.save(update_fields=["status"])
    except Exception as exc:
        if not isinstance(exc, TranscriptionError):
            logger.exception("Unexpected transcription failure (job id %s)", job.pk)
        job.output_material = None
        job.status, job.error, job.completed_at = TranscriptionJob.Status.FAILED, str(exc) if isinstance(exc, TranscriptionError) else "Transcription failed unexpectedly.", timezone.now()
        job.save(update_fields=["status", "error", "completed_at"])
        source.status = Material.Status.FAILED
        source.error = job.error
        source.save(update_fields=["status", "error"])
