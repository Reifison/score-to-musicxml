# Clarinetto II in La/A — checkpoint

## Scope and status

- Source: `tmp/pdfs/mozart-clarinets-2026-10-18/Mozart-Pariser-Sinfonie-Clarinets-original.pdf`, pages 6–10.
- The five page renders were inspected visually for movement boundaries, printed system-start labels, cue notation, and final barlines. This was not a note-by-note transcription pass.
- High-resolution crops of page 6, system 1, left and right halves were inspected. No note events were consolidated or certified from those crops; do not treat this checkpoint as a completed transcription.
- No MusicXML was created. In particular, no unknown measures were filled with rests.

## Source facts observed

- Part label: Clarinetto II in La/A. Written key signature: one flat (F major). The integration contract specifies `<transpose><diatonic>-2</diatonic><chromatic>-3</chromatic></transpose>`.
- Movement I is marked Allegro assai with common time, represented as 4/4 for the project.
- At the end of page 8 the score prints `II — Andante: tacet`; there are no separately numbered Clarinetto II measures for that movement.
- Movement III is marked Allegro with cut time, represented as 2/2 for the project.
- Small cue notes labeled for Violin I, Flute I, and Oboe I/II appear above the clarinet staff. They are cues, not Clarinetto II events; preserve them only as visible cues if the final representation supports that. Clarinet rests continue underneath.
- The PDF has no extractable text layer; measure numbers and notes must be read from the page images.

## Printed system starts and provisional coverage map

These are page/system navigation labels, not a completed count validation. Endpoints are inferred from the next printed start label and the visible final barline.

| Movement | Page | Printed system starts | Provisional range |
|---|---:|---|---|
| I | 6 | 1, 10, 19, 26, 36, 42, 50, 58, 70, 77 | 1–89 |
| I | 7 | 90, 96, 102, 110, 118, 127, 138, 147, 155, 162, 170, 179, 187 | 90–193 |
| I | 8 | 194, 201, 211, 221, 231, 237, 248, 255, 266, 272, 280, 288 | 194–295 |
| III | 9 | opening system begins at movement start; then 8, 20, 27, 36, 43, 58, 67, 81, 89, 101, 110 | 1–118 |
| III | 10 | 119, 138, 147, 154, 170, 178, 186, 197, 214, 228, 236 | 119–244 |

## Review coverage and remaining work

- Visual navigation review: pages 6–10, including the I/II boundary and III start/end.
- Close crop review: page 6, system 1, both halves. The visible note shapes were inspected, but exact measure-to-event assignment and pitches were not reconciled into a verified ledger.
- Not done: note, rhythm, accidental, tie/slur, dynamic, and cue transcription for any complete range; independent event and measure-count validation; MusicXML generation.
- Suggested next step: once a human-approved, licensed OMR candidate is available, compare it against each listed page/system from the source renders, correct it, then emit one part with IDs `I-1`…`I-295` and `III-1`…`III-244`, with the II tacet as text only. If no candidate becomes available, start manual transcription with page 6, system 1 and mark each verified system explicitly.

## Derived crops retained

All crops are under this directory in `crops/`. The page 6, system 1 left/right crops are the only crops actually inspected closely. The early malformed crop command also created duplicate files whose names contain a space and the crop's y-offset (for example, `p06-s02 949-left.png`); these were not inspected and are not part of the reviewed coverage.
