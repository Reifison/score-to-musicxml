/** Source-only HOMR drift recorded in reader-accuracy.json, measure 7. */
export const carinhosoM7RhythmDrift = {
  xml: `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list><part id="P1"><measure number="7"><attributes><divisions>4</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note><note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>16th</type></note><note><pitch><step>B</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type></note><note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>16th</type></note></measure></part></score-partwise>`,
  sourceEvents: [
    { onset: 0, duration: 1, voice: "1", staff: 1, kind: "note", step: "C", octave: 4, type: "quarter", dots: 0 },
    { onset: 1, duration: 0.25, voice: "1", staff: 1, kind: "note", step: "D", octave: 4, type: "16th", dots: 0 },
    { onset: 1.25, duration: 0.25, voice: "1", staff: 1, kind: "note", step: "B", octave: 4, type: "16th", dots: 0 },
    { onset: 1.5, duration: 0.25, voice: "1", staff: 1, kind: "note", step: "A", octave: 4, type: "16th", dots: 0 }
  ]
};
