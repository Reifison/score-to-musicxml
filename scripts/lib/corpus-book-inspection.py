"""Read bounded, generated Audiveris containers; never extract archive paths."""
import json
import pathlib
import sys
import zipfile
import xml.etree.ElementTree as ET

folder = pathlib.Path(sys.argv[1])
books = []
compressed_exports = []
for file in sorted(folder.rglob('*')):
    if not file.is_file() or file.is_symlink():
        continue
    if file.suffix.lower() == '.omr':
        try:
            if file.stat().st_size > 128 * 1024 * 1024:
                raise ValueError('native book above bounded inspection limit')
            with zipfile.ZipFile(file) as archive:
                entry = archive.getinfo('book.xml')
                if entry.file_size > 16 * 1024 * 1024:
                    raise ValueError('book.xml above bounded inspection limit')
                with archive.open(entry) as stream:
                    payload = stream.read(16 * 1024 * 1024 + 1)
                if len(payload) > 16 * 1024 * 1024:
                    raise ValueError('book.xml exceeded bounded read')
                root = ET.fromstring(payload)
                sheets = []
                for sheet in root.findall('sheet'):
                    steps = (sheet.findtext('steps') or '').split()
                    sheets.append({
                        'page': int(sheet.get('number', '0')),
                        'invalid': sheet.get('invalid') == 'true',
                        'steps': steps,
                        'reachedPageStep': 'PAGE' in steps,
                        'pageRefs': [dict(p.attrib) for p in sheet.findall('page')],
                        'recognizedStaffConfigurations': [dict(c.attrib) for c in sheet.findall('.//staff-configuration')],
                    })
                movements = [{
                    'pages': [dict(p.attrib) for p in score.findall('page')],
                    'parts': [dict(p.attrib) for p in score.findall('logical-part')]
                } for score in root.findall('score')]
                books.append({'file': str(file), 'engineVersion': root.get('software-version'), 'sheets': sheets, 'movements': movements})
        except Exception as error:
            books.append({'file': str(file), 'inspectionError': type(error).__name__ + ': ' + str(error)})
    elif file.suffix.lower() == '.mxl':
        try:
            if file.stat().st_size > 128 * 1024 * 1024:
                raise ValueError('compressed export above bounded inspection limit')
            with zipfile.ZipFile(file) as archive:
                container = archive.getinfo('META-INF/container.xml')
                if container.file_size > 1024 * 1024:
                    raise ValueError('container.xml above limit')
                with archive.open(container) as stream:
                    payload = stream.read(1024 * 1024 + 1)
                if len(payload) > 1024 * 1024:
                    raise ValueError('container.xml exceeded bounded read')
                root = ET.fromstring(payload)
                candidates = [node.get('full-path') for node in root.iter() if node.tag.split('}')[-1] == 'rootfile']
                for candidate in candidates:
                    if not candidate or pathlib.PurePosixPath(candidate).is_absolute() or '..' in pathlib.PurePosixPath(candidate).parts:
                        raise ValueError('unsafe MusicXML archive root')
                    entry = archive.getinfo(candidate)
                    if entry.file_size > 32 * 1024 * 1024:
                        raise ValueError('MusicXML archive root above limit')
                    with archive.open(entry) as stream:
                        payload = stream.read(32 * 1024 * 1024 + 1)
                    if len(payload) > 32 * 1024 * 1024:
                        raise ValueError('MusicXML archive root exceeded bounded read')
                    xml = payload.decode('utf-8-sig')
                    target = file.with_suffix('.unpacked.musicxml')
                    if target.exists() and target.read_text(encoding='utf-8') != xml:
                        raise ValueError('immutable unpacked export conflict')
                    if not target.exists():
                        with target.open('x', encoding='utf-8') as output:
                            output.write(xml)
                        target.chmod(0o600)
                    compressed_exports.append({'file': str(file), 'unpackedPath': str(target)})
        except Exception as error:
            compressed_exports.append({'file': str(file), 'inspectionError': type(error).__name__ + ': ' + str(error)})
print(json.dumps({'books': books, 'compressedExports': compressed_exports}, ensure_ascii=False))
