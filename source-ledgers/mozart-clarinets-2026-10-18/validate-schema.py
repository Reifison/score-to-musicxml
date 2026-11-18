"""Offline MusicXML 4.0 schema validation; never load a source DTD or network entity."""
import argparse
import json
from pathlib import Path

from lxml import etree


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--report")
    args = ap.parse_args()
    parser = etree.XMLParser(no_network=True, resolve_entities=False, load_dtd=False)
    schema_path = Path(__file__).parent / "schema" / "musicxml.xsd"
    schema = etree.XMLSchema(etree.parse(str(schema_path), parser))
    reports = []
    for filename in args.files:
        source = Path(filename).resolve()
        tree = etree.parse(str(source), parser)
        valid = schema.validate(tree)
        reports.append({
            "file": str(source), "schema": "MusicXML 4.0 W3C",
            "valid": valid,
            "errors": [{"line": e.line, "message": e.message} for e in schema.error_log],
        })
    result = {"valid": all(r["valid"] for r in reports), "files": reports}
    payload = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.report:
        Path(args.report).write_text(payload, encoding="utf-8")
    print(payload)
    raise SystemExit(0 if result["valid"] else 1)


if __name__ == "__main__":
    main()
