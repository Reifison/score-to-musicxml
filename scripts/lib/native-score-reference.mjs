import { parseStringPromise } from 'xml2js';

const MAX_XML_BYTES = 32 * 1024 * 1024;

function list(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value) {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return text(value[0]);
  if (typeof value === 'object') return value._ === undefined ? null : String(value._).trim() || null;
  return String(value).trim() || null;
}

function number(value) {
  const parsed = Number(text(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSafeXml(xml) {
  if (typeof xml !== 'string') throw new TypeError('XML deve ser texto');
  if (Buffer.byteLength(xml, 'utf8') > MAX_XML_BYTES) throw new Error('XML excede 32 MiB');
  const doctypes = xml.match(/<!DOCTYPE[^>]*>/gi) ?? [];
  if (doctypes.some(doctype => doctype.includes('['))) throw new Error('Subset interno de DOCTYPE não é aceito');
  return xml.replace(/<!DOCTYPE[^>]*>/gi, '');
}

async function parseXml(xml) {
  const safeXml = normalizeSafeXml(xml);
  return parseStringPromise(safeXml, { explicitArray: true, explicitRoot: true, trim: true, strict: true });
}

function musicXmlTranspositions(attributes) {
  return list(attributes).flatMap((attribute, index) => list(attribute.transpose).map(transpose => ({
    attributesIndex: index,
    diatonic: number(transpose.diatonic),
    chromatic: number(transpose.chromatic),
    octaveChange: number(transpose['octave-change']),
    double: text(transpose.double),
  })));
}

function musicXmlTunings(attributes) {
  return list(attributes).flatMap((attribute, attributesIndex) => list(attribute['staff-details']).flatMap(details =>
    list(details['staff-tuning']).map(tuning => ({
      attributesIndex,
      staff: number(details.$?.number) ?? 1,
      line: number(tuning.$?.line),
      step: text(tuning['tuning-step']),
      alter: number(tuning['tuning-alter']) ?? 0,
      octave: number(tuning['tuning-octave']),
    }))));
}

function inspectMusicXml(document) {
  const score = document['score-partwise'];
  if (!score) throw new Error('Raiz MusicXML não suportada; esperado score-partwise');

  const partDefinitions = new Map(list(score['part-list']?.[0]?.['score-part']).map(part => [
    part.$?.id ?? null,
    { name: text(part['part-name']), abbreviation: text(part['part-abbreviation']) },
  ]));
  const parts = list(score.part).map(part => {
    const id = part.$?.id ?? null;
    const measures = list(part.measure);
    const attributes = measures.flatMap(measure => list(measure.attributes));
    const staves = Math.max(1, ...attributes.map(attribute => number(attribute.staves) ?? 1));
    return {
      id,
      name: partDefinitions.get(id)?.name ?? null,
      abbreviation: partDefinitions.get(id)?.abbreviation ?? null,
      measureCount: measures.length,
      firstMeasure: measures[0] ? { number: text(measures[0].$?.number), implicit: text(measures[0].$?.implicit) } : null,
      lastMeasure: measures.length ? { number: text(measures.at(-1).$?.number), implicit: text(measures.at(-1).$?.implicit) } : null,
      staffCount: staves,
      transpositions: musicXmlTranspositions(attributes),
      tunings: musicXmlTunings(attributes),
    };
  });

  const creators = list(score.identification?.[0]?.creator).map(creator => ({
    type: creator.$?.type ?? null,
    name: text(creator),
  }));
  const title = text(score['movement-title']) ?? text(score.work?.[0]?.['work-title']);
  return {
    format: 'musicxml',
    title,
    creators,
    partCount: parts.length,
    staffCount: parts.reduce((sum, part) => sum + part.staffCount, 0),
    measureCounts: parts.map(({ id, measureCount }) => ({ partId: id, count: measureCount })),
    parts,
    eventExtraction: 'not performed',
  };
}

function museScoreTunings(instrument) {
  return list(instrument.StringData).flatMap(stringData => list(stringData.string).map((pitch, index) => ({
    stringIndexInSourceOrder: index + 1,
    midiPitchRaw: number(pitch),
  })));
}

function inspectMuseScoreXml(document) {
  const museScore = document.museScore;
  const score = list(museScore?.Score)[0];
  if (!score) throw new Error('Raiz MuseScore XML não suportada; esperado museScore/Score');

  const metaTags = new Map(list(score.metaTag ?? museScore?.metaTag).map(tag => [
    tag.$?.name ?? '', text(tag),
  ]));
  const staves = list(score.Staff);
  let sequentialStaffIndex = 0;
  const parts = list(score.Part).map((part, index) => {
    const instrument = list(part.Instrument)[0] ?? {};
    const tuning = museScoreTunings(instrument);
    const explicitTranspose = ['transposeDiatonic', 'transposeChromatic', 'transposeOctave'].flatMap(key =>
      list(instrument[key]).map(value => ({ field: key, value: number(value) })));
    return {
      index: index + 1,
      name: text(part.trackName) ?? text(instrument.longName),
      longName: text(instrument.longName),
      shortName: text(instrument.shortName),
      instrumentId: text(instrument.instrumentId),
      clefTag: text(instrument.clef),
      staffIds: list(part.Staff).map(staff => {
        const id = staff.$?.id ?? staves[sequentialStaffIndex]?.$?.id ?? String(sequentialStaffIndex + 1);
        sequentialStaffIndex += 1;
        return id;
      }),
      explicitTranspose,
      tuningMidiPitchesInSourceOrder: tuning.length ? tuning.map(item => item.midiPitchRaw) : null,
      tuningDetails: tuning.length ? tuning : [],
    };
  });
  const staffPartNames = new Map();
  for (const part of parts) for (const staffId of part.staffIds) {
    if (!staffPartNames.has(staffId)) staffPartNames.set(staffId, []);
    staffPartNames.get(staffId).push(part.name);
  }
  const measuresPerStaff = staves.map((staff, index) => ({
    staffId: staff.$?.id ?? String(index + 1),
    partNames: staffPartNames.get(staff.$?.id ?? String(index + 1)) ?? [],
    count: list(staff.Measure).length,
    firstMeasureAttributes: list(staff.Measure)[0]?.$ ?? {},
    firstMeasureHasIrregularMarker: list(staff.Measure)[0] ? list(list(staff.Measure)[0].irregular).length > 0 : false,
    lastMeasureAttributes: list(staff.Measure).at(-1)?.$ ?? {},
    lastMeasureHasIrregularMarker: list(staff.Measure).at(-1) ? list(list(staff.Measure).at(-1).irregular).length > 0 : false,
  }));

  return {
    format: 'musescore-xml',
    title: metaTags.get('movementTitle') ?? metaTags.get('workTitle') ?? null,
    composer: metaTags.get('composer') ?? null,
    arranger: metaTags.get('arranger') ?? null,
    programVersion: text(museScore?.programVersion),
    partCount: parts.length,
    staffCount: staves.length,
    measureCounts: measuresPerStaff,
    parts,
    eventExtraction: 'not performed',
  };
}

/** Read only score-level metadata. This intentionally does not interpret note events. */
export async function inspectNativeScoreXml(xml) {
  const document = await parseXml(xml);
  if (document['score-partwise']) return inspectMusicXml(document);
  if (document.museScore) return inspectMuseScoreXml(document);
  throw new Error('Formato XML de partitura não reconhecido');
}
