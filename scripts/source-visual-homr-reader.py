#!/usr/bin/env python3
"""Source-first adapter for the locally installed, pinned HOMR reader.

The request contains only a page image and its digest. This process never
receives MusicXML from the conversion pipeline and never downloads model files.
"""

from __future__ import annotations

import contextlib
import hashlib
import importlib.metadata
import io
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
from fractions import Fraction
from typing import Any
import xml.etree.ElementTree as ET


MAX_REQUEST_BYTES = 64 * 1024
MAX_IMAGE_BYTES = 32 * 1024 * 1024
MAX_IMAGE_PIXELS = 50_000_000
MAX_MUSICXML_BYTES = 8 * 1024 * 1024
MAX_PARTS = 64
MAX_MEASURES = 200
MAX_EVENTS_PER_MEASURE = 512
MAX_TOTAL_EVENTS = 12_000
EXPECTED_HOMR_VERSION = "0.7.0"
EXPECTED_MODEL_FILES = {
    "segnet_308-3296ccd40960f90ca6ab9c035cca945675d30a0f.onnx",
    "encoder_pytorch_model_396-f6feedb42ff90087d898b0941a55d040fa6b2903.onnx",
    "decoder_pytorch_model_396-f6feedb42ff90087d898b0941a55d040fa6b2903.onnx",
}
NOTE_TYPES = {
    "maxima", "long", "breve", "whole", "half", "quarter", "eighth",
    "16th", "32nd", "64th", "128th", "256th", "512th", "1024th",
}


class ReaderError(Exception):
    """A request, runtime, or safety precondition failed."""


class UnsupportedMusicXml(Exception):
    """The generated notation has a structure this adapter cannot compare."""

    diagnostic_code = "HOMR_UNSUPPORTED_STRUCTURE"
    diagnostic_message = (
        "O MusicXML produzido pelo HOMR contém uma estrutura que o leitor "
        "visual não pode associar com segurança."
    )


class EmptyMeasureMusicXml(UnsupportedMusicXml):
    """HOMR emitted a measure without any readable musical event."""

    diagnostic_code = "HOMR_EMPTY_MEASURE"
    diagnostic_message = (
        "O HOMR produziu ao menos um compasso sem eventos musicais legíveis; "
        "a cobertura da página não foi confirmada."
    )


def _unsupported_musicxml_diagnostic(error: UnsupportedMusicXml) -> dict[str, str]:
    """Return a bounded protocol diagnostic without leaking paths or parser data."""
    return {
        "code": error.diagnostic_code,
        "message": error.diagnostic_message,
    }


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _children(node: ET.Element, name: str) -> list[ET.Element]:
    return [child for child in list(node) if _local_name(child.tag) == name]


def _single_child(node: ET.Element, name: str, *, required: bool = False) -> ET.Element | None:
    found = _children(node, name)
    if len(found) > 1 or (required and len(found) != 1):
        raise UnsupportedMusicXml("MusicXML has a missing or repeated semantic field")
    return found[0] if found else None


def _text(node: ET.Element | None, name: str, *, required: bool = False) -> str | None:
    child = _single_child(node, name, required=required) if node is not None else None
    if child is None:
        return None
    value = (child.text or "").strip()
    if required and not value:
        raise UnsupportedMusicXml("MusicXML has an empty semantic field")
    return value or None


def _positive_integer(value: str | None, label: str, *, allow_zero: bool = False) -> int:
    if value is None or not re.fullmatch(r"[0-9]{1,9}", value):
        raise UnsupportedMusicXml("MusicXML has an invalid " + label)
    parsed = int(value)
    if parsed < (0 if allow_zero else 1):
        raise UnsupportedMusicXml("MusicXML has an invalid " + label)
    return parsed


def _quarter_units(raw_duration: str | None, divisions: int, *, grace: bool) -> Fraction:
    if raw_duration is None and grace:
        return Fraction(0)
    ticks = _positive_integer(raw_duration, "duration", allow_zero=grace)
    duration = Fraction(ticks, divisions)
    if duration > 10_000:
        raise UnsupportedMusicXml("MusicXML duration is outside supported bounds")
    return duration


def _number(value: Fraction) -> int | float:
    result = float(value)
    if not (0 <= result <= 10_000):
        raise UnsupportedMusicXml("MusicXML position is outside supported bounds")
    return int(result) if value.denominator == 1 else result


def parse_musicxml(xml_bytes: bytes) -> list[dict[str, Any]]:
    """Read supported HOMR partwise XML into source events.

    This intentionally supports only a single part on one staff. Measure boxes
    are unavailable from pinned HOMR 0.7, so the caller supplies full-page
    context rectangles instead of estimating measure positions.
    """
    if not xml_bytes or len(xml_bytes) > MAX_MUSICXML_BYTES:
        raise UnsupportedMusicXml("MusicXML is empty or too large")
    upper = xml_bytes.upper()
    # HOMR's generated files may have a harmless external MusicXML DOCTYPE.
    # ElementTree does not fetch external subsets; entity declarations are
    # rejected because they can expand into unexpected content.
    if b"<!ENTITY" in upper:
        raise UnsupportedMusicXml("MusicXML entity declarations are not permitted")
    try:
        root = ET.fromstring(xml_bytes)
    except (ET.ParseError, ValueError) as error:
        raise UnsupportedMusicXml("MusicXML is malformed") from error
    if _local_name(root.tag) != "score-partwise":
        raise UnsupportedMusicXml("Only partwise MusicXML is supported")

    parts = _children(root, "part")
    if not parts or len(parts) > MAX_PARTS:
        raise UnsupportedMusicXml("MusicXML part count is outside supported bounds")
    if len(parts) != 1:
        raise UnsupportedMusicXml("Multiple parts are not supported by this reader adapter")
    part = parts[0]
    part_id = part.get("id")
    part_list = _single_child(root, "part-list", required=True)
    listed_parts = _children(part_list, "score-part")
    if len(listed_parts) != 1 or not part_id or listed_parts[0].get("id") != part_id:
        raise UnsupportedMusicXml("MusicXML part order cannot be established safely")

    measure_nodes = _children(part, "measure")
    if not measure_nodes or len(measure_nodes) > MAX_MEASURES:
        raise UnsupportedMusicXml("MusicXML measure count is outside supported bounds")

    supported_part_tags = {
        "measure", "group", "direction", "sound", "harmony", "figured-bass",
        "transpose", "midi-instrument", "midi-device",
    }
    if any(_local_name(child.tag) not in supported_part_tags for child in list(part)):
        raise UnsupportedMusicXml("MusicXML part contains unsupported structure")

    divisions = 1
    output: list[dict[str, Any]] = []
    total_events = 0
    for measure_index, measure in enumerate(measure_nodes):
        cursor = Fraction(0)
        last_base_note: dict[tuple[str, int], tuple[Fraction, Fraction]] = {}
        events: list[dict[str, Any]] = []
        for child in list(measure):
            tag = _local_name(child.tag)
            if tag == "attributes":
                division_text = _text(child, "divisions")
                if division_text is not None:
                    divisions = _positive_integer(division_text, "divisions")
                staves_text = _text(child, "staves")
                if staves_text is not None and _positive_integer(staves_text, "staff count") != 1:
                    raise UnsupportedMusicXml("Multiple staves are not supported by this reader adapter")
                continue
            if tag in {"print", "barline", "direction", "sound", "harmony", "figured-bass", "grouping"}:
                continue
            if tag in {"backup", "forward"}:
                duration = _quarter_units(_text(child, "duration", required=True), divisions, grace=False)
                if duration <= 0:
                    raise UnsupportedMusicXml("MusicXML cursor movement is not positive")
                cursor = cursor - duration if tag == "backup" else cursor + duration
                if cursor < 0:
                    raise UnsupportedMusicXml("MusicXML backup moves before the measure")
                last_base_note.clear()
                continue
            if tag != "note":
                raise UnsupportedMusicXml("MusicXML measure contains unsupported structure")
            if len(events) >= MAX_EVENTS_PER_MEASURE or total_events >= MAX_TOTAL_EVENTS:
                raise UnsupportedMusicXml("MusicXML event count is outside supported bounds")

            grace = _single_child(child, "grace") is not None
            chord = _single_child(child, "chord") is not None
            if grace and chord:
                raise UnsupportedMusicXml("Grace-note chord groups are unsupported")
            rest_element = _single_child(child, "rest")
            pitch = _single_child(child, "pitch")
            unpitched = _single_child(child, "unpitched")
            if unpitched is not None or (rest_element is not None and pitch is not None):
                raise UnsupportedMusicXml("Unpitched or ambiguous MusicXML note is unsupported")
            if (rest_element is None) == (pitch is None):
                raise UnsupportedMusicXml("MusicXML note must have exactly one pitch or rest")
            if grace and rest_element is not None:
                raise UnsupportedMusicXml("Grace rests are unsupported")

            voice = _text(child, "voice") or "1"
            staff_raw = _text(child, "staff") or "1"
            staff = _positive_integer(staff_raw, "staff number")
            if len(voice) > 32 or staff > 64 or staff != 1:
                raise UnsupportedMusicXml("MusicXML voice or staff is outside supported bounds")
            key = (voice, staff)

            duration = _quarter_units(_text(child, "duration"), divisions, grace=grace)
            if not grace and duration <= 0:
                raise UnsupportedMusicXml("A nongrace MusicXML note has no duration")
            if chord:
                previous = last_base_note.get(key)
                if previous is None:
                    raise UnsupportedMusicXml("MusicXML chord has no preceding base note")
                onset = previous[0]
            else:
                onset = cursor
            if onset > 10_000:
                raise UnsupportedMusicXml("MusicXML onset is outside supported bounds")

            note_type = _text(child, "type")
            if note_type is not None and (len(note_type) > 32 or note_type not in NOTE_TYPES):
                raise UnsupportedMusicXml("MusicXML note type is unsupported")
            dots = len(_children(child, "dot"))
            if dots > 4:
                raise UnsupportedMusicXml("MusicXML has too many augmentation dots")
            event: dict[str, Any] = {
                "onset": _number(onset),
                "duration": _number(duration),
                "voice": voice,
                "staff": staff,
                "kind": "rest" if rest_element is not None else "note",
                "dots": dots,
            }
            if chord:
                event["chord"] = True
            if grace:
                event["grace"] = True
            if note_type is not None:
                event["type"] = note_type
            if pitch is not None:
                step = _text(pitch, "step", required=True)
                if step not in {"A", "B", "C", "D", "E", "F", "G"}:
                    raise UnsupportedMusicXml("MusicXML pitch step is invalid")
                alter_text = _text(pitch, "alter")
                try:
                    alter_fraction = Fraction(alter_text) if alter_text is not None else Fraction(0)
                except (ValueError, ZeroDivisionError) as error:
                    raise UnsupportedMusicXml("MusicXML pitch alteration is invalid") from error
                if alter_fraction.denominator != 1 or alter_fraction < -2 or alter_fraction > 2:
                    raise UnsupportedMusicXml("Microtonal or extreme pitch alteration is unsupported")
                octave = _positive_integer(_text(pitch, "octave", required=True), "octave", allow_zero=True)
                if octave > 9:
                    raise UnsupportedMusicXml("MusicXML octave is outside supported bounds")
                event.update({"step": step, "alter": int(alter_fraction), "octave": octave})

            events.append(event)
            total_events += 1
            if not chord and not grace:
                if pitch is not None:
                    last_base_note[key] = (onset, duration)
                else:
                    last_base_note.pop(key, None)
                cursor += duration

        if not events:
            raise EmptyMeasureMusicXml("A MusicXML measure has no readable events")
        output.append({
            "partIndex": 0,
            "measureIndex": measure_index,
            "rectangle": {"left": 0, "top": 0, "width": 1, "height": 1},
            "contextOnly": True,
            "readable": True,
            "events": events,
        })
    return output


def _read_regular_file(path: Path, max_bytes: int) -> bytes:
    try:
        flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
        descriptor = os.open(str(path), flags)
    except OSError as error:
        raise ReaderError("A required local file could not be opened safely") from error
    try:
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_size < 0 or metadata.st_size > max_bytes:
            raise ReaderError("A local file is not regular or exceeds its size limit")
        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = os.read(descriptor, min(1024 * 1024, max_bytes + 1 - total))
            if not chunk:
                break
            chunks.append(chunk)
            total += len(chunk)
            if total > max_bytes:
                raise ReaderError("A local file exceeds its size limit")
        return b"".join(chunks)
    finally:
        os.close(descriptor)


def _load_request(path: Path) -> dict[str, Any]:
    request_bytes = _read_regular_file(path, MAX_REQUEST_BYTES)
    try:
        request = json.loads(request_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ReaderError("The reader request is invalid JSON") from error
    if not isinstance(request, dict) or set(request) != {"version", "page", "imagePath", "imageSHA256"}:
        raise ReaderError("The reader request contains unsupported fields")
    if request.get("version") != 1 or isinstance(request.get("version"), bool):
        raise ReaderError("The reader protocol version is unsupported")
    page = request.get("page")
    if not isinstance(page, int) or isinstance(page, bool) or not 1 <= page <= 3:
        raise ReaderError("The requested page is outside supported bounds")
    image_path = request.get("imagePath")
    if not isinstance(image_path, str) or not os.path.isabs(image_path) or len(image_path) > 4096:
        raise ReaderError("The image path is invalid")
    image_sha = request.get("imageSHA256")
    if not isinstance(image_sha, str) or not re.fullmatch(r"[a-f0-9]{64}", image_sha):
        raise ReaderError("The image digest is invalid")
    return request


def _verify_image(data: bytes) -> tuple[str, int, int]:
    try:
        from PIL import Image

        with Image.open(io.BytesIO(data)) as image:
            image_format = image.format
            width, height = image.size
            image.verify()
    except Exception as error:
        raise ReaderError("The source image could not be decoded safely") from error
    if image_format not in {"PNG", "JPEG"} or width <= 0 or height <= 0 or width * height > MAX_IMAGE_PIXELS:
        raise ReaderError("The source image format or dimensions are unsupported")
    return image_format, width, height


def _check_runtime_and_models() -> Any:
    try:
        version = importlib.metadata.version("homr")
    except importlib.metadata.PackageNotFoundError as error:
        raise ReaderError("Pinned HOMR runtime is not installed") from error
    if version != EXPECTED_HOMR_VERSION:
        raise ReaderError("The installed HOMR version does not match the pinned reader")

    import homr.main as homr_main

    paths = {
        os.path.basename(homr_main.segnet_path_onnx),
        os.path.basename(homr_main.default_config.filepaths.encoder_path),
        os.path.basename(homr_main.default_config.filepaths.decoder_path),
    }
    if paths != EXPECTED_MODEL_FILES:
        raise ReaderError("The installed HOMR model set does not match the pinned reader")
    for model_path in (
        homr_main.segnet_path_onnx,
        homr_main.default_config.filepaths.encoder_path,
        homr_main.default_config.filepaths.decoder_path,
    ):
        try:
            model_stat = os.stat(model_path, follow_symlinks=False)
        except OSError as error:
            raise ReaderError("A pinned HOMR model file is unavailable") from error
        if not stat.S_ISREG(model_stat.st_mode) or model_stat.st_size < 1_000_000:
            raise ReaderError("A pinned HOMR model file is invalid or incomplete")
    return homr_main


def _no_title(*_args: Any, **_kwargs: Any) -> Any:
    from concurrent.futures import Future

    result = Future()
    result.set_result("")
    return result


def run_request(request_path: Path) -> dict[str, Any]:
    request = _load_request(request_path)
    image_path = Path(request["imagePath"])
    image_bytes = _read_regular_file(image_path, MAX_IMAGE_BYTES)
    digest = hashlib.sha256(image_bytes).hexdigest()
    if digest != request["imageSHA256"]:
        raise ReaderError("The source image digest does not match the request")
    diagnostics: list[dict[str, str]] = []
    try:
        with tempfile.TemporaryDirectory(prefix="source-visual-homr-") as temporary_directory:
            previous_cwd = os.getcwd()
            try:
                # HOMR/ONNX can leave runtime artifacts in the process CWD;
                # keep imports and inference inside the disposable stage.
                os.chdir(temporary_directory)
                image_format, _, _ = _verify_image(image_bytes)
                homr_main = _check_runtime_and_models()
                extension = ".png" if image_format == "PNG" else ".jpg"
                staged_image = Path(temporary_directory) / ("source" + extension)
                staged_image.write_bytes(image_bytes)
                homr_main.detect_title = _no_title
                config = homr_main.ProcessingConfig(
                    enable_debug=False,
                    enable_cache=False,
                    write_staff_positions=False,
                    read_staff_positions=False,
                    selected_staff=-1,
                    transformer_use_gpu=False,
                    segnet_use_gpu=False,
                    coreml_encoder=False,
                )
                xml_arguments = homr_main.XmlGeneratorArguments(False, None, None)
                homr_main.process_image(str(staged_image), config, xml_arguments)
                generated_xml_path = staged_image.with_suffix(".musicxml")
                if not generated_xml_path.is_file():
                    raise ReaderError("The local reader produced no MusicXML output")
                xml_bytes = _read_regular_file(generated_xml_path, MAX_MUSICXML_BYTES)
                try:
                    measures = parse_musicxml(xml_bytes)
                    coverage_complete = True
                except UnsupportedMusicXml as error:
                    print("Source visual reader: " + str(error), file=sys.stderr)
                    diagnostics.append(_unsupported_musicxml_diagnostic(error))
                    measures = []
                    coverage_complete = False
            finally:
                os.chdir(previous_cwd)
    finally:
        current_image_bytes = _read_regular_file(image_path, MAX_IMAGE_BYTES)
        current_digest = hashlib.sha256(current_image_bytes).hexdigest()
        if current_digest != digest:
            raise ReaderError("The source image changed during local reading")
    return {
        "version": 1,
        "page": request["page"],
        "inputImageSHA256": digest,
        "reader": {"name": "HOMR", "version": EXPECTED_HOMR_VERSION,
                   "model": "segnet-308/transformer-396-cpu"},
        "coverageComplete": coverage_complete,
        "diagnostics": diagnostics,
        "measures": measures,
    }


def _emit_json_only(request_path: Path) -> int:
    """Send third-party stdout to stderr and reserve stdout for one JSON line."""
    try:
        sys.stdout.flush()
        saved_stdout_fd = os.dup(1)
        os.dup2(2, 1)
    except OSError as error:
        print("Source visual reader: stdout could not be isolated", file=sys.stderr)
        return 2

    response: dict[str, Any] | None = None
    failure = 0
    try:
        with contextlib.redirect_stdout(sys.stderr):
            response = run_request(request_path)
    except Exception as error:  # Keep diagnostics out of the protocol stream.
        print("Source visual reader: " + str(error), file=sys.stderr)
        failure = 2
    finally:
        try:
            sys.stdout.flush()
            os.dup2(saved_stdout_fd, 1)
        finally:
            os.close(saved_stdout_fd)

    if response is not None:
        encoded = json.dumps(response, ensure_ascii=True, separators=(",", ":")).encode("utf-8") + b"\n"
        os.write(1, encoded)
    return failure


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: source-visual-homr-reader.py REQUEST.json", file=sys.stderr)
        return 2
    return _emit_json_only(Path(argv[1]))


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
