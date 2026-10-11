from __future__ import annotations

import importlib.util
import hashlib
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock


READER_PATH = Path(__file__).resolve().parents[1] / "source-visual-homr-reader.py"
SPEC = importlib.util.spec_from_file_location("source_visual_homr_reader", READER_PATH)
assert SPEC is not None and SPEC.loader is not None
reader = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = reader
SPEC.loader.exec_module(reader)


def score(measures: str, *, part_id: str = "P1", second_part: str = "") -> bytes:
    part_list = f'<part-list><score-part id="{part_id}"><part-name>Voice</part-name></score-part>'
    parts = f'<part id="{part_id}">{measures}</part>'
    if second_part:
        part_list += '<score-part id="P2"><part-name>Second</part-name></score-part>'
        parts += f'<part id="P2">{second_part}</part>'
    part_list += "</part-list>"
    return (f'<?xml version="1.0"?><score-partwise>{part_list}{parts}</score-partwise>').encode()


class SourceVisualHomrReaderTests(unittest.TestCase):
    def test_emits_quarter_units_pitches_chords_rests_and_cursor_positions(self) -> None:
        xml = score('''
          <measure number="1">
            <attributes><divisions>4</divisions><staves>1</staves></attributes>
            <note><pitch><step>C</step><alter>1</alter><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type></note>
            <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type></note>
            <note><rest/><duration>4</duration><voice>1</voice><type>quarter</type></note>
            <backup><duration>4</duration></backup>
            <forward><duration>2</duration></forward>
            <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>
          </measure>''')

        measures = reader.parse_musicxml(xml)

        self.assertEqual(len(measures), 1)
        measure = measures[0]
        self.assertEqual(measure["partIndex"], 0)
        self.assertEqual(measure["measureIndex"], 0)
        self.assertTrue(measure["contextOnly"])
        self.assertEqual(measure["rectangle"], {"left": 0, "top": 0, "width": 1, "height": 1})
        self.assertEqual([event["onset"] for event in measure["events"]], [0, 0, 0.5, 1])
        self.assertEqual([event["duration"] for event in measure["events"]], [0.5, 0.5, 1, 1])
        self.assertEqual(measure["events"][0]["alter"], 1)
        self.assertTrue(measure["events"][1]["chord"])
        self.assertEqual(measure["events"][2]["kind"], "rest")
        self.assertEqual(measure["events"][3]["step"], "G")

    def test_accepts_harmless_external_doctype_without_fetching_it(self) -> None:
        xml = b'''<!DOCTYPE score-partwise SYSTEM "https://example.invalid/musicxml.dtd">
        <score-partwise><part-list><score-part id="P1"/></part-list><part id="P1">
        <measure number="1"><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note></measure>
        </part></score-partwise>'''

        self.assertEqual(len(reader.parse_musicxml(xml)), 1)

    def test_rejects_entity_declarations(self) -> None:
        xml = b'''<!DOCTYPE score-partwise [<!ENTITY pitch "C">]>
        <score-partwise><part-list><score-part id="P1"/></part-list><part id="P1"/></score-partwise>'''
        with self.assertRaises(reader.UnsupportedMusicXml):
            reader.parse_musicxml(xml)

    def test_rejects_multiple_parts_and_staves(self) -> None:
        first = '<measure number="1"><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note></measure>'
        with self.assertRaises(reader.UnsupportedMusicXml):
            reader.parse_musicxml(score(first, second_part=first))

        multistaff = score('<measure number="1"><attributes><staves>2</staves></attributes>' + first + '</measure>')
        with self.assertRaises(reader.UnsupportedMusicXml):
            reader.parse_musicxml(multistaff)

    def test_rejects_invalid_or_ambiguous_event_data(self) -> None:
        malformed = score('<measure number="1"><note><pitch><step>H</step><octave>4</octave></pitch><duration>1</duration></note></measure>')
        with self.assertRaises(reader.UnsupportedMusicXml):
            reader.parse_musicxml(malformed)

        entity = score('<measure number="1"><note><unpitched/><duration>1</duration></note></measure>')
        with self.assertRaises(reader.UnsupportedMusicXml):
            reader.parse_musicxml(entity)

        empty = score('<measure number="1"><attributes><divisions>0</divisions></attributes></measure>')
        with self.assertRaises(reader.UnsupportedMusicXml):
            reader.parse_musicxml(empty)

        chord_after_rest = score('''<measure number="1">
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>
          <note><rest/><duration>1</duration></note>
          <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration></note>
        </measure>''')
        with self.assertRaises(reader.UnsupportedMusicXml):
            reader.parse_musicxml(chord_after_rest)

    def test_requires_bounded_partwise_document(self) -> None:
        with self.assertRaises(reader.UnsupportedMusicXml):
            reader.parse_musicxml(b'<score-timewise/>')
        with self.assertRaises(reader.UnsupportedMusicXml):
            reader.parse_musicxml(b'<score-partwise><!---->')
        with self.assertRaises(reader.UnsupportedMusicXml):
            reader.parse_musicxml(b"x" * (reader.MAX_MUSICXML_BYTES + 1))

    def test_empty_measure_has_bounded_structured_diagnostic(self) -> None:
        xml = score('<measure number="1"/>')

        with self.assertRaises(reader.EmptyMeasureMusicXml) as raised:
            reader.parse_musicxml(xml)

        self.assertEqual(reader._unsupported_musicxml_diagnostic(raised.exception), {
            "code": "HOMR_EMPTY_MEASURE",
            "message": (
                "O HOMR produziu ao menos um compasso sem eventos musicais legíveis; "
                "a cobertura da página não foi confirmada."
            ),
        })
        self.assertNotIn("measure number", str(reader._unsupported_musicxml_diagnostic(raised.exception)))

    def test_other_unsupported_structure_uses_the_generic_protocol_code(self) -> None:
        error = reader.UnsupportedMusicXml("/private/path and parser internals")

        self.assertEqual(reader._unsupported_musicxml_diagnostic(error), {
            "code": "HOMR_UNSUPPORTED_STRUCTURE",
            "message": (
                "O MusicXML produzido pelo HOMR contém uma estrutura que o leitor "
                "visual não pode associar com segurança."
            ),
        })

    def test_run_request_reports_empty_measure_without_claiming_coverage(self) -> None:
        image_bytes = b"stable-source-image"

        def process_image(image_path: str, _config: object, _arguments: object) -> None:
            Path(image_path).with_suffix(".musicxml").write_bytes(score('<measure number="1"/>'))

        fake_homr = SimpleNamespace(
            detect_title=None,
            ProcessingConfig=lambda **kwargs: kwargs,
            XmlGeneratorArguments=lambda *args: args,
            process_image=process_image,
        )
        with tempfile.TemporaryDirectory() as directory:
            image_path = Path(directory) / "source.png"
            request_path = Path(directory) / "request.json"
            image_path.write_bytes(image_bytes)
            request_path.write_text(json.dumps({
                "version": 1,
                "page": 1,
                "imagePath": str(image_path),
                "imageSHA256": hashlib.sha256(image_bytes).hexdigest(),
            }))
            with mock.patch.object(reader, "_verify_image", return_value=("PNG", 1, 1)), \
                    mock.patch.object(reader, "_check_runtime_and_models", return_value=fake_homr):
                response = reader.run_request(request_path)

        self.assertFalse(response["coverageComplete"])
        self.assertEqual(response["measures"], [])
        self.assertEqual(response["diagnostics"], [{
            "code": "HOMR_EMPTY_MEASURE",
            "message": (
                "O HOMR produziu ao menos um compasso sem eventos musicais legíveis; "
                "a cobertura da página não foi confirmada."
            ),
        }])


if __name__ == "__main__":
    unittest.main()
