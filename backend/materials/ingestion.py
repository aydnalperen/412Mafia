"""Local-only, bounded extraction of untrusted course files."""

import hashlib
import logging
import re
from io import BytesIO
from pathlib import Path
from zipfile import BadZipFile, ZipFile

import fitz
from pptx import Presentation
from pptx.exc import PackageNotFoundError
from django.core.exceptions import ValidationError
from django.core.exceptions import SuspiciousFileOperation
from django.core.files.base import ContentFile
from django.db import transaction
from django.utils.text import get_valid_filename
from rest_framework.exceptions import ValidationError as APIValidationError

from .models import Material, SourceChunk
from .segments import TranscriptSegment, create_transcript_chunks

logger = logging.getLogger(__name__)
MAX_UPLOAD = 15 * 1024 * 1024
MAX_TEXT = 5 * 1024 * 1024
MAX_PAGES = 200
MAX_PACKAGE_BYTES = 50 * 1024 * 1024
MAX_PACKAGE_FILES = 2000
CHUNK_CHARS = 4000
EXTENSIONS = {
    Material.Kind.TRANSCRIPT: {".txt", ".md", ".srt", ".vtt"},
    Material.Kind.SLIDES: {".pdf", ".pptx"},
    Material.Kind.EXAM: {".pdf", ".txt", ".md"},
    Material.Kind.STUDY: {".pdf", ".txt", ".md"},
}
TIMESTAMP = re.compile(r"^(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})$")
CUE = re.compile(r"^(.+?)\s+-->\s+(.+?)(?:\s+.*)?$")


class ExtractionError(ValueError):
    pass


def text_chunks(text):
    """Split without merging pages or discarding text from long lines."""
    text = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not text:
        return []
    pieces = []
    for line in text.split("\n"):
        while len(line) > CHUNK_CHARS:
            pieces.append(line[:CHUNK_CHARS])
            line = line[CHUNK_CHARS:]
        pieces.append(line)
    chunks, current = [], ""
    for piece in pieces:
        if len(current) + len(piece) + 1 > CHUNK_CHARS and current.strip():
            chunks.append(current.strip())
            current = ""
        current = f"{current}\n{piece}" if current else piece
    if current.strip():
        chunks.append(current.strip())
    return chunks


def parse_time(value):
    match = TIMESTAMP.fullmatch(value)
    if not match:
        raise ExtractionError("Invalid subtitle timestamp.")
    hour, minute, second, millisecond = map(int, match.groups())
    if minute > 59 or second > 59:
        raise ExtractionError("Invalid subtitle timestamp.")
    return hour * 3600 + minute * 60 + second + millisecond / 1000


def subtitle_segments(text, extension):
    text = text.lstrip("\ufeff").replace("\r\n", "\n").replace("\r", "\n")
    if extension == ".vtt":
        if not text.startswith("WEBVTT") or (len(text) > 6 and text[6] not in " \t\n"):
            raise ExtractionError("Invalid WEBVTT header.")
        text = text.split("\n", 1)[1] if "\n" in text else ""
    segments = []
    for block in re.split(r"\n\s*\n", text):
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        if not lines or lines[0].startswith(("NOTE", "STYLE", "REGION")):
            continue
        cue_index = next((index for index, line in enumerate(lines) if "-->" in line), None)
        if cue_index is None:
            raise ExtractionError("Subtitle cue has no time range.")
        match = CUE.fullmatch(lines[cue_index])
        if not match or not lines[cue_index + 1:]:
            raise ExtractionError("Invalid or empty subtitle cue.")
        start, end = parse_time(match[1]), parse_time(match[2].split()[0])
        if end <= start:
            raise ExtractionError("Invalid subtitle time range.")
        segments.append(TranscriptSegment("\n".join(lines[cue_index + 1:]), start, end))
    if not segments:
        raise ExtractionError("No subtitle cues found.")
    return segments


def group_segments(segments):
    grouped = []
    previous_start = 0.0
    for segment in segments:
        if segment.start_seconds is not None and segment.start_seconds < previous_start:
            raise ExtractionError("Subtitle cues are out of order.")
        if segment.start_seconds is not None:
            previous_start = segment.start_seconds
        if grouped and grouped[-1].end_seconds is not None and segment.start_seconds is not None:
            previous = grouped[-1]
            if len(previous.text) + len(segment.text) + 1 <= CHUNK_CHARS and segment.start_seconds - previous.end_seconds <= 60:
                grouped[-1] = TranscriptSegment(previous.text + "\n" + segment.text, previous.start_seconds, max(previous.end_seconds, segment.end_seconds))
                continue
        grouped.append(segment)
    return grouped


def powerpoint_chunks(material, data):
    try:
        with ZipFile(BytesIO(data)) as package:
            entries = package.infolist()
            if (len(entries) > MAX_PACKAGE_FILES or
                    sum(entry.file_size for entry in entries) > MAX_PACKAGE_BYTES or
                    any(entry.flag_bits & 1 for entry in entries)):
                raise ExtractionError("PowerPoint package is encrypted or too large to process.")
            names = package.namelist()
            if "[Content_Types].xml" not in names or "ppt/presentation.xml" not in names:
                raise ExtractionError("File is not a PowerPoint presentation.")
        presentation = Presentation(BytesIO(data))
        if len(presentation.slides) > MAX_PAGES:
            raise ExtractionError("PowerPoint presentation has too many slides.")
        chunks = []
        size = 0
        for number, slide in enumerate(presentation.slides, start=1):
            lines = []
            for shape in slide.shapes:
                if shape.has_text_frame and shape.text.strip():
                    lines.append(shape.text.strip())
                if shape.has_table:
                    lines.extend(cell.text.strip() for row in shape.table.rows for cell in row.cells if cell.text.strip())
            slide_text = "\n".join(lines)
            size += len(slide_text)
            if size > MAX_TEXT:
                raise ExtractionError("PowerPoint contains too much extracted text.")
            for text in text_chunks(slide_text):
                chunks.append(SourceChunk(material=material, text=text, sequence=len(chunks), page_number=number, metadata={"source_unit": "slide"}))
    except ExtractionError:
        raise
    except (BadZipFile, PackageNotFoundError, KeyError, ValueError) as exc:
        raise ExtractionError("PowerPoint file is corrupt or unsupported.") from exc
    if not chunks:
        raise ExtractionError("No selectable text found in PowerPoint; images need OCR.")
    return chunks


def extract(material, data, extension):
    if extension == ".pptx":
        return powerpoint_chunks(material, data)
    if extension == ".pdf":
        if not data.startswith(b"%PDF-"):
            raise ExtractionError("File is not a PDF document.")
        try:
            with fitz.open(stream=data, filetype="pdf") as document:
                if document.is_encrypted or document.page_count > MAX_PAGES:
                    raise ExtractionError("Encrypted or oversized PDF is unsupported.")
                pages = []
                size = 0
                for index, page in enumerate(document):
                    text = page.get_text(sort=True)
                    size += len(text)
                    if size > MAX_TEXT:
                        raise ExtractionError("PDF contains too much extracted text.")
                    pages.extend(SourceChunk(material=material, text=chunk, sequence=len(pages), page_number=index + 1) for chunk in text_chunks(text))
        except (fitz.FileDataError, fitz.EmptyFileError) as exc:
            raise ExtractionError("PDF is corrupt or unsupported.") from exc
        if sum(len(chunk.text.strip()) for chunk in pages) < 20:
            raise ExtractionError("No usable text found in PDF; scanned documents need OCR.")
        return pages
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ExtractionError("Text must be valid UTF-8.") from exc
    if any(ord(char) < 32 and char not in "\n\r\t" for char in text):
        raise ExtractionError("File contains binary/control data instead of text.")
    if extension in (".srt", ".vtt"):
        return group_segments(subtitle_segments(text, extension))
    if text.lstrip().startswith("%PDF-"):
        raise ExtractionError("File content does not match its extension.")
    return text_chunks(text)


def ingest_upload(course, kind, uploaded):
    if kind not in EXTENSIONS:
        raise APIValidationError({"kind": "Unsupported material kind."})
    try:
        filename = get_valid_filename(Path(uploaded.name.replace("\\", "/")).name)
    except SuspiciousFileOperation as exc:
        raise APIValidationError({"file": "Invalid filename."}) from exc
    extension = Path(filename).suffix.lower()
    if not filename or len(filename) > 120 or extension not in EXTENSIONS[kind]:
        raise APIValidationError({"file": "Filename or extension is not allowed for this material kind."})
    if uploaded.size > MAX_UPLOAD:
        raise APIValidationError({"file": "File exceeds the 15 MB upload limit."})
    data = uploaded.read(MAX_UPLOAD + 1)
    if not data or len(data) > MAX_UPLOAD:
        raise APIValidationError({"file": "File is empty or exceeds the 15 MB upload limit."})
    digest = hashlib.sha256(data).hexdigest()
    existing = Material.objects.filter(course=course, kind=kind, file_hash=digest).first()
    if existing and existing.status != Material.Status.FAILED:
        return existing, False
    material = existing or Material.objects.create(course=course, kind=kind, file=ContentFile(data, name=filename), file_hash=digest)
    material.status = Material.Status.PROCESSING
    material.error = ""
    material.save(update_fields=["status", "error"])
    try:
        extracted = extract(material, data, extension)
        with transaction.atomic():
            if kind == Material.Kind.TRANSCRIPT:
                segments = extracted if extension in (".srt", ".vtt") else [TranscriptSegment(chunk) for chunk in extracted]
                create_transcript_chunks(material, segments)
            else:
                if not extracted:
                    raise ExtractionError("File has no extractable text.")
                SourceChunk.objects.bulk_create([
                    chunk if extension in (".pdf", ".pptx") else SourceChunk(material=material, sequence=index, text=chunk)
                    for index, chunk in enumerate(extracted)
                ])
                material.status = Material.Status.READY
                material.save(update_fields=["status"])
    except (ExtractionError, ValidationError) as exc:
        material.status = Material.Status.FAILED
        material.error = str(exc)
        material.save(update_fields=["status", "error"])
    except Exception:
        logger.exception("Material extraction failed (material id %s)", material.pk)
        material.status = Material.Status.FAILED
        material.error = "Unable to process this file."
        material.save(update_fields=["status", "error"])
    return material, existing is None
