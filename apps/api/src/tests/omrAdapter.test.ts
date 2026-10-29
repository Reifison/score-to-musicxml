import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";
import { AudiverisOmrAdapter } from "../services/OmrAdapter.js";

const score = (p1Measures: string[], p2Measures: string[]) => `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1">
      <part-name>Guitar 1</part-name>
    </score-part>
    <score-part id="P2">
      <part-name>Guitar 2</part-name>
    </score-part>
  </part-list>
  <part id="P1">
${p1Measures.map((measure, index) => index === 0 ? measure.replace(/(<measure\b[^>]*>)/, "$1<attributes><clef><sign>G</sign></clef></attributes>") : measure).join("\n")}
  </part>
  <part id="P2">
${p2Measures.map((measure, index) => index === 0 ? measure.replace(/(<measure\b[^>]*>)/, "$1<attributes><clef><sign>G</sign></clef></attributes>") : measure).join("\n")}
  </part>
</score-partwise>`;

const partBody = (musicXml: string, partId: string) => {
  const match = musicXml.match(new RegExp(`<part id="${partId}">([\\s\\S]*?)</part>`));
  return match?.[1] ?? "";
};

describe("AudiverisOmrAdapter", () => {
  it("não prefere uma leitura que omitiu baixo ou grace apenas porque tem menos diagnósticos", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      convert(inputPath: string, filename: string, outputDir: string): Promise<{ musicXml: string; evidence?: Array<{ selected: boolean; reason: string }> }>;
      resolveAudiverisBin(): Promise<string>;
      preprocessInput(): Promise<{ pages: Array<{ attempts: Array<{ paths: string[]; description: string }> }>; warnings: string[] }>;
      convertPage(pagePath: string): Promise<{ musicXml: string; warnings: string[] }>;
    };
    const wrap = (extra: string) => `<score-partwise><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>1</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>${extra}</measure></part></score-partwise>`;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-omitted-voice-"));
    try {
      adapter.resolveAudiverisBin = async () => "/tmp/Audiveris";
      adapter.preprocessInput = async () => ({ pages: [{ attempts: [{ paths: ["/tmp/raw.png"], description: "raw" }, { paths: ["/tmp/alt.png"], description: "alt" }] }], warnings: [] });
      for (const extra of ['<note><chord/><pitch><step>E</step><octave>3</octave></pitch><duration>1</duration><type>half</type></note>', '<note><grace/><pitch><step>D</step><octave>5</octave></pitch><duration>1</duration><type>eighth</type></note>']) {
        adapter.convertPage = async (pagePath) => ({ musicXml: wrap(pagePath.includes("raw") ? extra : ""), warnings: [] });
        const result = await adapter.convert("/tmp/input.png", "score.png", dir);
        expect(result.musicXml).toContain(extra);
        expect(result.evidence?.map((item) => item.selected)).toEqual([true, false]);
        expect(result.evidence?.[0].reason).toContain("provisoriamente");
      }
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("permite alternativa que elimina violação rítmica sem remover vozes nem criar outra", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      convert(inputPath: string, originalFilename: string, outputDir: string): Promise<{ musicXml: string; validation?: { requiresReview: boolean; issues: Array<{ code: string }> }; evidence?: Array<{ candidate: number; selected: boolean; xml: string; sourceImagePath?: string }> }>;
      resolveAudiverisBin(): Promise<string>;
      preprocessInput(inputPath: string, outputDir: string): Promise<{ pages: Array<{ attempts: Array<{ paths: string[]; description: string }> }>; warnings: string[] }>;
      convertPage(pagePath: string): Promise<{ musicXml: string; warnings: string[] }>;
    };
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-validation-choice-"));
    const rawPath = path.join(dir, "raw.png");
    const cleanedPath = path.join(dir, "cleaned.png");
    const xml = (duration: number) => `<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>12</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>${duration}</duration></note></measure></part></score-partwise>`;
    try {
      await Promise.all([fs.writeFile(rawPath, "raw"), fs.writeFile(cleanedPath, "cleaned")]);
      adapter.resolveAudiverisBin = async () => "/tmp/Audiveris";
      adapter.preprocessInput = async () => ({ pages: [{ attempts: [{ paths: [rawPath], description: "raw" }, { paths: [cleanedPath], description: "cleaned" }] }], warnings: [] });
      adapter.convertPage = async (pagePath) => pagePath === rawPath
        ? { musicXml: xml(21), warnings: [] }
        : { musicXml: xml(24), warnings: ["Aviso informativo", "Outro aviso informativo"] };
      const result = await adapter.convert(rawPath, "score.png", dir);
      expect(result.musicXml).toContain("<duration>24</duration>");
      expect(result.validation?.issues.map((issue) => issue.code)).toContain("CANDIDATE_VALIDATION_DIVERGENCE");
      expect(result.validation?.requiresReview).toBe(true);
      expect(result.evidence).toMatchObject([
        { candidate: 1, selected: false, xml: xml(21), sourceImagePath: await fs.realpath(rawPath) },
        { candidate: 2, selected: true, xml: xml(24), sourceImagePath: await fs.realpath(cleanedPath) }
      ]);
      expect(result.evidence?.[1].reason).toContain("dominância estrutural temporal");
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("mantém a origem quando o reparo temporal acrescenta um pitch", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      convert(inputPath: string, originalFilename: string, outputDir: string): Promise<{ evidence?: Array<{ selected: boolean; reason: string }> }>;
      resolveAudiverisBin(): Promise<string>;
      preprocessInput(inputPath: string, outputDir: string): Promise<{ pages: Array<{ attempts: Array<{ paths: string[]; description: string }> }>; warnings: string[] }>;
      convertPage(pagePath: string): Promise<{ musicXml: string; warnings: string[] }>;
    };
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-extra-pitch-"));
    const originalPath = path.join(dir, "original.png");
    const alternativePath = path.join(dir, "alternative.png");
    const wrap = (body: string) => `<score-partwise><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>${body}</measure></part></score-partwise>`;
    const original = wrap('<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note>');
    const alternative = wrap('<note><pitch><step>C</step><octave>4</octave></pitch><duration>3</duration><voice>1</voice><type>half</type></note><note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>3</duration><voice>1</voice><type>half</type></note>');
    try {
      await Promise.all([fs.writeFile(originalPath, "original"), fs.writeFile(alternativePath, "alternative")]);
      adapter.resolveAudiverisBin = async () => "/tmp/Audiveris";
      adapter.preprocessInput = async () => ({ pages: [{ attempts: [{ paths: [originalPath], description: "original" }, { paths: [alternativePath], description: "alternative" }] }], warnings: [] });
      adapter.convertPage = async (pagePath) => ({ musicXml: pagePath === originalPath ? original : alternative, warnings: [] });
      const result = await adapter.convert(originalPath, "score.png", dir);
      expect(result.evidence?.map((item) => item.selected)).toEqual([true, false]);
      expect(result.evidence?.[0].reason).toContain("provisoriamente");
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("seleciona a alternativa Adelita que corrige o overrun pela cauda liberada", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      convert(inputPath: string, originalFilename: string, outputDir: string): Promise<{
        musicXml: string;
        validation?: { issues: Array<{ code: string; measure?: string }> };
        evidence?: Array<{ candidate: number; selected: boolean; reason: string }>;
      }>;
      resolveAudiverisBin(): Promise<string>;
      preprocessInput(): Promise<{ pages: Array<{ attempts: Array<{ paths: string[]; description: string }> }>; warnings: string[] }>;
      convertPage(pagePath: string): Promise<{ musicXml: string; warnings: string[] }>;
    };
    const fixtureDir = fileURLToPath(new URL("./fixtures/adelita/", import.meta.url));
    const candidateOne = await fs.readFile(path.join(fixtureDir, "candidate-1.musicxml"), "utf8");
    const candidateTwo = await fs.readFile(path.join(fixtureDir, "candidate-2.musicxml"), "utf8");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-adelita-dominance-"));
    const rawPath = path.join(dir, "candidate-1.png");
    const alternativePath = path.join(dir, "candidate-2.png");
    try {
      await Promise.all([fs.writeFile(rawPath, "candidate one"), fs.writeFile(alternativePath, "candidate two")]);
      adapter.resolveAudiverisBin = async () => "/tmp/Audiveris";
      adapter.preprocessInput = async () => ({ pages: [{ attempts: [
        { paths: [rawPath], description: "candidato 1" },
        { paths: [alternativePath], description: "candidato 2" }
      ] }], warnings: [] });
      adapter.convertPage = async (pagePath) => ({ musicXml: pagePath === rawPath ? candidateOne : candidateTwo, warnings: [] });

      const result = await adapter.convert(rawPath, "IMSLP44649-PMLP95949-Tarrega_-_Adelita.pdf", dir);

      expect(result.evidence?.find((item) => item.selected)?.candidate).toBe(2);
      expect(result.evidence?.find((item) => item.selected)?.reason).toContain("dominância estrutural temporal");
      expect(result.validation?.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "CANDIDATE_EVENT_DIVERGENCE", measure: "4" }),
        expect.objectContaining({ code: "CANDIDATE_VALIDATION_DIVERGENCE" })
      ]));
      expect(result.evidence?.map((item) => item.selected)).toEqual([false, true]);
      expect(result.evidence?.[1].reason).toContain("dominância estrutural temporal");
      expect(result.evidence?.[0].reason).toContain("outra leitura eliminou uma violação temporal comprovável");
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("mantém a origem quando o reparo de cauda altera contexto fora da voz reparada", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      convert(inputPath: string, originalFilename: string, outputDir: string): Promise<{ evidence?: Array<{ selected: boolean; reason: string }> }>;
      resolveAudiverisBin(): Promise<string>;
      preprocessInput(): Promise<{ pages: Array<{ attempts: Array<{ paths: string[]; description: string }> }>; warnings: string[] }>;
      convertPage(pagePath: string): Promise<{ musicXml: string; warnings: string[] }>;
    };
    const fixtureDir = fileURLToPath(new URL("./fixtures/adelita/", import.meta.url));
    const candidateOne = await fs.readFile(path.join(fixtureDir, "candidate-1.musicxml"), "utf8");
    const candidateTwo = await fs.readFile(path.join(fixtureDir, "candidate-2.musicxml"), "utf8");
    const measure4 = candidateTwo.match(/<measure number="4"[\s\S]*?<\/measure>/)?.[0];
    if (!measure4) throw new Error("Fixture Adelita sem compasso 4.");
    const voice2Note = measure4.match(/<note\b[^>]*>\s*<pitch>\s*<step>E<\/step>\s*<octave>3<\/octave>[\s\S]*?<\/note>/)?.[0];
    const preTailNote = measure4.match(/<note\b[^>]*>\s*<pitch>\s*<step>E<\/step>\s*<octave>5<\/octave>[\s\S]*?<\/note>/)?.[0];
    if (!voice2Note || !preTailNote) throw new Error("Fixture Adelita sem os eventos de teste esperados.");
    const shortenedVoice2 = voice2Note
      .replace("<duration>12</duration>", "<duration>8</duration>")
      .replace(/\s*<dot\/>/, "");
    const voice2Moved = candidateTwo.replace(measure4, measure4.replace(voice2Note,
      `${shortenedVoice2}<note><rest/><duration>4</duration><voice>2</voice><type>quarter</type></note>`));
    const preTailChanged = candidateTwo.replace(measure4, measure4.replace(preTailNote,
      preTailNote.replace("<type>eighth</type>", "<type>quarter</type>")));
    const cases = [
      ["voice2", voice2Moved],
      ["pre-tail", preTailChanged]
    ] as const;
    adapter.resolveAudiverisBin = async () => "/tmp/Audiveris";
    for (const [label, alternative] of cases) {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), `omr-overflow-${label}-`));
      const rawPath = path.join(dir, "candidate-1.png");
      const alternativePath = path.join(dir, "candidate-2.png");
      try {
        await Promise.all([fs.writeFile(rawPath, "candidate one"), fs.writeFile(alternativePath, "candidate two")]);
        adapter.preprocessInput = async () => ({ pages: [{ attempts: [
          { paths: [rawPath], description: "candidato 1" },
          { paths: [alternativePath], description: `candidato 2 ${label}` }
        ] }], warnings: [] });
        adapter.convertPage = async (pagePath) => ({ musicXml: pagePath === rawPath ? candidateOne : alternative, warnings: [] });
        const result = await adapter.convert(rawPath, "IMSLP44649-PMLP95949-Tarrega_-_Adelita.pdf", dir);
        expect(result.evidence?.map((item) => item.selected)).toEqual([true, false]);
        expect(result.evidence?.[0].reason).toContain("provisoriamente");
      } finally { await fs.rm(dir, { recursive: true, force: true }); }
    }
  });

  it("mantém a origem quando a cauda alternativa cria sobreposição entre notas", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      convert(inputPath: string, originalFilename: string, outputDir: string): Promise<{ evidence?: Array<{ selected: boolean; reason: string }> }>;
      resolveAudiverisBin(): Promise<string>;
      preprocessInput(): Promise<{ pages: Array<{ attempts: Array<{ paths: string[]; description: string }> }>; warnings: string[] }>;
      convertPage(pagePath: string): Promise<{ musicXml: string; warnings: string[] }>;
    };
    const fixtureDir = fileURLToPath(new URL("./fixtures/adelita/", import.meta.url));
    const candidateOne = await fs.readFile(path.join(fixtureDir, "candidate-1.musicxml"), "utf8");
    const candidateTwo = await fs.readFile(path.join(fixtureDir, "candidate-2.musicxml"), "utf8");
    const measure4 = candidateTwo.match(/<measure number="4"[\s\S]*?<\/measure>/)?.[0];
    const b5Note = measure4?.match(/<note\b[^>]*>\s*<pitch>\s*<step>B<\/step>\s*<octave>5<\/octave>[\s\S]*?<\/note>/)?.[0];
    if (!measure4 || !b5Note) throw new Error("Fixture Adelita sem a nota B5 do compasso 4.");
    const overlapNote = '<backup><duration>1</duration></backup><note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>16th</type></note>';
    const overlappingAlternative = candidateTwo.replace(measure4, measure4.replace(b5Note, `${overlapNote}${b5Note}`));
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-overflow-overlap-"));
    const rawPath = path.join(dir, "candidate-1.png");
    const alternativePath = path.join(dir, "candidate-2.png");
    try {
      await Promise.all([fs.writeFile(rawPath, "candidate one"), fs.writeFile(alternativePath, "candidate two")]);
      adapter.resolveAudiverisBin = async () => "/tmp/Audiveris";
      adapter.preprocessInput = async () => ({ pages: [{ attempts: [
        { paths: [rawPath], description: "candidato 1" },
        { paths: [alternativePath], description: "candidato 2 sobreposto" }
      ] }], warnings: [] });
      adapter.convertPage = async (pagePath) => ({ musicXml: pagePath === rawPath ? candidateOne : overlappingAlternative, warnings: [] });
      const result = await adapter.convert(rawPath, "IMSLP44649-PMLP95949-Tarrega_-_Adelita.pdf", dir);
      expect(result.evidence?.map((item) => item.selected)).toEqual([true, false]);
      expect(result.evidence?.[0].reason).toContain("provisoriamente");
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("mantém a origem quando a alternativa fecha o compasso apagando uma voz", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      convert(inputPath: string, originalFilename: string, outputDir: string): Promise<{ evidence?: Array<{ candidate: number; selected: boolean; reason: string }> }>;
      resolveAudiverisBin(): Promise<string>;
      preprocessInput(): Promise<{ pages: Array<{ attempts: Array<{ paths: string[]; description: string }> }>; warnings: string[] }>;
      convertPage(pagePath: string): Promise<{ musicXml: string; warnings: string[] }>;
    };
    const wrap = (notes: string) => `<score-partwise><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>${notes}</measure></part></score-partwise>`;
    const original = wrap('<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note><backup><duration>4</duration></backup><note><pitch><step>E</step><octave>3</octave></pitch><duration>3</duration><voice>2</voice><type>half</type></note>');
    const removedVoice = wrap('<note><pitch><step>E</step><octave>3</octave></pitch><duration>3</duration><voice>2</voice><type>half</type></note>');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-voice-drop-"));
    try {
      adapter.resolveAudiverisBin = async () => "/tmp/Audiveris";
      adapter.preprocessInput = async () => ({ pages: [{ attempts: [{ paths: ["/tmp/original.png"], description: "original" }, { paths: ["/tmp/alternative.png"], description: "alternative" }] }], warnings: [] });
      adapter.convertPage = async (pagePath) => ({ musicXml: pagePath.includes("original") ? original : removedVoice, warnings: [] });
      const result = await adapter.convert("/tmp/input.png", "score.png", dir);
      expect(result.evidence?.map((item) => item.selected)).toEqual([true, false]);
      expect(result.evidence?.[0].reason).toContain("provisoriamente");
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("mantém a origem quando a alternativa apaga uma nota mas conserva a voz", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      convert(inputPath: string, originalFilename: string, outputDir: string): Promise<{ evidence?: Array<{ selected: boolean; reason: string }> }>;
      resolveAudiverisBin(): Promise<string>;
      preprocessInput(): Promise<{ pages: Array<{ attempts: Array<{ paths: string[]; description: string }> }>; warnings: string[] }>;
      convertPage(pagePath: string): Promise<{ musicXml: string; warnings: string[] }>;
    };
    const wrap = (notes: string) => `<score-partwise><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>${notes}</measure></part></score-partwise>`;
    const original = wrap('<note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type></note><note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type></note>');
    const removedNote = wrap('<note><pitch><step>C</step><octave>4</octave></pitch><duration>3</duration><voice>1</voice><type>half</type></note>');
    adapter.resolveAudiverisBin = async () => "/tmp/Audiveris";
    adapter.preprocessInput = async () => ({ pages: [{ attempts: [{ paths: ["/tmp/original-note.png"], description: "original" }, { paths: ["/tmp/removed-note.png"], description: "alternative" }] }], warnings: [] });
    adapter.convertPage = async (pagePath) => ({ musicXml: pagePath.includes("original") ? original : removedNote, warnings: [] });
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-note-drop-"));
    try {
      const result = await adapter.convert("/tmp/input.png", "score.png", dir);
      expect(result.evidence?.map((item) => item.selected)).toEqual([true, false]);
      expect(result.evidence?.[0].reason).toContain("provisoriamente");
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("mantém membro de acorde e origem quando a alternativa apaga esse pitch para fechar o compasso", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      convert(inputPath: string, originalFilename: string, outputDir: string): Promise<{ evidence?: Array<{ selected: boolean; reason: string }> }>;
      resolveAudiverisBin(): Promise<string>;
      preprocessInput(): Promise<{ pages: Array<{ attempts: Array<{ paths: string[]; description: string }> }>; warnings: string[] }>;
      convertPage(pagePath: string): Promise<{ musicXml: string; warnings: string[] }>;
    };
    const wrap = (notes: string) => `<score-partwise><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>${notes}</measure></part></score-partwise>`;
    const original = wrap('<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note><note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note><note><pitch><step>G</step><octave>4</octave></pitch><duration>3</duration><voice>1</voice><type>half</type></note>');
    const removedChordMember = wrap('<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note><note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type></note>');
    adapter.resolveAudiverisBin = async () => "/tmp/Audiveris";
    adapter.preprocessInput = async () => ({ pages: [{ attempts: [{ paths: ["/tmp/original-chord.png"], description: "original" }, { paths: ["/tmp/removed-chord.png"], description: "alternative" }] }], warnings: [] });
    adapter.convertPage = async (pagePath) => ({ musicXml: pagePath.includes("original") ? original : removedChordMember, warnings: [] });
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-chord-drop-"));
    try {
      const result = await adapter.convert("/tmp/input.png", "score.png", dir);
      expect(result.evidence?.map((item) => item.selected)).toEqual([true, false]);
      expect(result.evidence?.[0].reason).toContain("provisoriamente");
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("não troca pitch e ritmo juntos sob a hipótese temporal", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      convert(inputPath: string, originalFilename: string, outputDir: string): Promise<{ evidence?: Array<{ selected: boolean; reason: string }> }>;
      resolveAudiverisBin(): Promise<string>;
      preprocessInput(): Promise<{ pages: Array<{ attempts: Array<{ paths: string[]; description: string }> }>; warnings: string[] }>;
      convertPage(pagePath: string): Promise<{ musicXml: string; warnings: string[] }>;
    };
    const wrap = (step: string, duration: number) => `<score-partwise><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>${step}</step><octave>4</octave></pitch><duration>${duration}</duration><voice>1</voice><type>quarter</type></note></measure></part></score-partwise>`;
    const original = wrap("C", 4);
    const changedPitch = wrap("D", 3);
    adapter.resolveAudiverisBin = async () => "/tmp/Audiveris";
    adapter.preprocessInput = async () => ({ pages: [{ attempts: [{ paths: ["/tmp/original-pitch.png"], description: "original" }, { paths: ["/tmp/changed-pitch.png"], description: "alternative" }] }], warnings: [] });
    adapter.convertPage = async (pagePath) => ({ musicXml: pagePath.includes("original") ? original : changedPitch, warnings: [] });
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-pitch-rhythm-change-"));
    try {
      const result = await adapter.convert("/tmp/input.png", "score.png", dir);
      expect(result.evidence?.map((item) => item.selected)).toEqual([true, false]);
      expect(result.evidence?.[0].reason).toContain("provisoriamente");
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("não aceita reparo temporal que acrescenta um grace isolado", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      convert(inputPath: string, originalFilename: string, outputDir: string): Promise<{ evidence?: Array<{ selected: boolean; reason: string }> }>;
      resolveAudiverisBin(): Promise<string>;
      preprocessInput(): Promise<{ pages: Array<{ attempts: Array<{ paths: string[]; description: string }> }>; warnings: string[] }>;
      convertPage(pagePath: string): Promise<{ musicXml: string; warnings: string[] }>;
    };
    const wrap = (body: string) => `<score-partwise><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>${body}</measure></part></score-partwise>`;
    const original = wrap('<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note>');
    const addedGrace = wrap('<note><pitch><step>C</step><octave>4</octave></pitch><duration>3</duration><voice>1</voice><type>half</type></note><note><grace/><pitch><step>D</step><octave>4</octave></pitch><duration>0</duration><voice>1</voice><type>eighth</type></note>');
    adapter.resolveAudiverisBin = async () => "/tmp/Audiveris";
    adapter.preprocessInput = async () => ({ pages: [{ attempts: [{ paths: ["/tmp/original-grace.png"], description: "original" }, { paths: ["/tmp/added-grace.png"], description: "alternative" }] }], warnings: [] });
    adapter.convertPage = async (pagePath) => ({ musicXml: pagePath.includes("original") ? original : addedGrace, warnings: [] });
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-grace-addition-"));
    try {
      const result = await adapter.convert("/tmp/input.png", "score.png", dir);
      expect(result.evidence?.map((item) => item.selected)).toEqual([true, false]);
      expect(result.evidence?.[0].reason).toContain("provisoriamente");
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("não aceita reparo temporal que altera uma ligadura de duração", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      convert(inputPath: string, originalFilename: string, outputDir: string): Promise<{ evidence?: Array<{ selected: boolean; reason: string }> }>;
      resolveAudiverisBin(): Promise<string>;
      preprocessInput(): Promise<{ pages: Array<{ attempts: Array<{ paths: string[]; description: string }> }>; warnings: string[] }>;
      convertPage(pagePath: string): Promise<{ musicXml: string; warnings: string[] }>;
    };
    const wrap = (body: string) => `<score-partwise><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>${body}</measure></part></score-partwise>`;
    const original = wrap('<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note>');
    const alteredTie = wrap('<note><pitch><step>C</step><octave>4</octave></pitch><duration>3</duration><voice>1</voice><tie type="start"/><type>half</type></note>');
    adapter.resolveAudiverisBin = async () => "/tmp/Audiveris";
    adapter.preprocessInput = async () => ({ pages: [{ attempts: [{ paths: ["/tmp/original-tie.png"], description: "original" }, { paths: ["/tmp/altered-tie.png"], description: "alternative" }] }], warnings: [] });
    adapter.convertPage = async (pagePath) => ({ musicXml: pagePath.includes("original") ? original : alteredTie, warnings: [] });
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-tie-change-"));
    try {
      const result = await adapter.convert("/tmp/input.png", "score.png", dir);
      expect(result.evidence?.map((item) => item.selected)).toEqual([true, false]);
      expect(result.evidence?.[0].reason).toContain("provisoriamente");
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("mantém a origem quando duas alternativas eliminam a mesma violação e permanecem ambíguas", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      convert(inputPath: string, originalFilename: string, outputDir: string): Promise<{ evidence?: Array<{ candidate: number; selected: boolean; reason: string }> }>;
      resolveAudiverisBin(): Promise<string>;
      preprocessInput(): Promise<{ pages: Array<{ attempts: Array<{ paths: string[]; description: string }> }>; warnings: string[] }>;
      convertPage(pagePath: string): Promise<{ musicXml: string; warnings: string[] }>;
    };
    const wrap = (step: string, duration: number) => `<score-partwise><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>${step}</step><octave>4</octave></pitch><duration>${duration}</duration><voice>1</voice><type>quarter</type></note></measure></part></score-partwise>`;
    const original = wrap("C", 4);
    const alternativeA = wrap("C", 3);
    const alternativeB = wrap("C", 3).replace("<type>quarter</type>", "<type>half</type>");
    adapter.resolveAudiverisBin = async () => "/tmp/Audiveris";
    adapter.preprocessInput = async () => ({ pages: [{ attempts: [
      { paths: ["/tmp/original.png"], description: "original" },
      { paths: ["/tmp/alternative-a.png"], description: "alternative A" },
      { paths: ["/tmp/alternative-b.png"], description: "alternative B" }
    ] }], warnings: [] });
    adapter.convertPage = async (pagePath) => ({ musicXml: pagePath.includes("alternative-a") ? alternativeA : pagePath.includes("alternative-b") ? alternativeB : original, warnings: [] });
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-ambiguous-dominance-"));
    try {
      const result = await adapter.convert("/tmp/input.png", "score.png", dir);
      expect(result.evidence?.map((item) => item.selected)).toEqual([true, false, false]);
      expect(result.evidence?.[0].reason).toContain("provisoriamente");
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("mantém a origem quando a alternativa elimina um overrun mas cria outro em região distinta", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      convert(inputPath: string, originalFilename: string, outputDir: string): Promise<{ evidence?: Array<{ candidate: number; selected: boolean; reason: string }> }>;
      resolveAudiverisBin(): Promise<string>;
      preprocessInput(): Promise<{ pages: Array<{ attempts: Array<{ paths: string[]; description: string }> }>; warnings: string[] }>;
      convertPage(pagePath: string): Promise<{ musicXml: string; warnings: string[] }>;
    };
    const wrap = (firstDuration: number, secondDuration: number) => `<score-partwise><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>${firstDuration}</duration><voice>1</voice><type>quarter</type></note></measure><measure number="2"><note><pitch><step>D</step><octave>4</octave></pitch><duration>${secondDuration}</duration><voice>1</voice><type>quarter</type></note></measure></part></score-partwise>`;
    const original = wrap(4, 3);
    const introducedViolation = wrap(3, 2);
    adapter.resolveAudiverisBin = async () => "/tmp/Audiveris";
    adapter.preprocessInput = async () => ({ pages: [{ attempts: [{ paths: ["/tmp/original.png"], description: "original" }, { paths: ["/tmp/alternative.png"], description: "alternative" }] }], warnings: [] });
    adapter.convertPage = async (pagePath) => ({ musicXml: pagePath.includes("alternative") ? introducedViolation : original, warnings: [] });
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-new-violation-"));
    try {
      const result = await adapter.convert("/tmp/input.png", "score.png", dir);
      expect(result.evidence?.map((item) => item.selected)).toEqual([true, false]);
      expect(result.evidence?.[0].reason).toContain("provisoriamente");
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("não usa avisos informativos nem menos compassos como prova de melhor transcrição", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      convert(inputPath: string, originalFilename: string, outputDir: string): Promise<{ musicXml: string; validation?: { issues: Array<{ code: string }> }; evidence?: Array<{ selected: boolean }> }>;
      resolveAudiverisBin(): Promise<string>;
      preprocessInput(): Promise<{ pages: Array<{ attempts: Array<{ paths: string[]; description: string }> }>; warnings: string[] }>;
      convertPage(pagePath: string): Promise<{ musicXml: string; warnings: string[] }>;
    };
    const one = '<measure number="1"><attributes><divisions>12</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes><note><rest/><duration>24</duration></note></measure>';
    const two = '<measure number="2"><note><rest/><duration>21</duration></note></measure>';
    const wrap = (body: string) => `<score-partwise><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1">${body}</part></score-partwise>`;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-validation-tie-"));
    try {
      adapter.resolveAudiverisBin = async () => "/tmp/Audiveris";
      adapter.preprocessInput = async () => ({ pages: [{ attempts: [{ paths: ["/tmp/raw.png"], description: "raw" }, { paths: ["/tmp/alt.png"], description: "alt" }] }], warnings: [] });
      adapter.convertPage = async (pagePath) => pagePath.includes("raw")
        ? { musicXml: wrap(one + two), warnings: ["A", "B", "C"] }
        : { musicXml: wrap(one), warnings: [] };
      const differing = await adapter.convert("/tmp/input.png", "score.png", dir);
      expect(differing.musicXml).toContain('measure number="2"');
      expect(differing.validation?.issues.map((issue) => issue.code)).toContain("CANDIDATE_MEASURE_COUNT_DIVERGENCE");
      expect(differing.evidence?.map((item) => item.selected)).toEqual([true, false]);
      adapter.convertPage = async (pagePath) => ({ musicXml: wrap(one), warnings: pagePath.includes("raw") ? ["A", "B"] : [] });
      const tied = await adapter.convert("/tmp/input.png", "score.png", dir);
      expect(tied.evidence?.map((item) => item.selected)).toEqual([true, false]);
      expect(tied.validation?.issues).toEqual([]);
      expect(tied.evidence?.every((item) => !("sourceImagePath" in item))).toBe(true);
      adapter.convertPage = async (pagePath) => ({ musicXml: pagePath.includes("raw") ? wrap(one) : wrap(one.replace("<rest/>", '<pitch><step>D</step><octave>4</octave></pitch>')), warnings: [] });
      const pitchesDiffer = await adapter.convert("/tmp/input.png", "score.png", dir);
      expect(pitchesDiffer.evidence?.map((item) => item.selected)).toEqual([true, false]);
      expect(pitchesDiffer.validation?.issues.map((issue) => issue.code)).toContain("CANDIDATE_XML_DIVERGENCE");
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("executa uma vez por imagem preparada com SHA-256 idêntico e mantém a origem de cada alias", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      convert(inputPath: string, originalFilename: string, outputDir: string, options?: { scoreType?: "guitar_duo" }): Promise<{ evidence?: Array<{ candidate: number; candidateIds?: number[]; reason: string; sourceImagePaths?: Array<{ candidate: number; path: string; sha256: string }> }> }>;
      resolveAudiverisBin(): Promise<string>;
      preprocessInput(): Promise<{ pages: Array<{ originalPath: string; attempts: Array<{ paths: string[]; description: string }> }>; warnings: string[] }>;
      convertPage(pagePath: string): Promise<{ musicXml: string; warnings: string[] }>;
    };
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-identical-image-"));
    const inputPath = path.join(dir, "source.pdf");
    const imageA = path.join(dir, "prepared-a.png");
    const imageB = path.join(dir, "prepared-b.png");
    const xml = score(
      ['<measure number="1"><note><pitch><step>C</step><octave>5</octave></pitch></note></measure>'],
      ['<measure number="1"><note><pitch><step>E</step><octave>4</octave></pitch></note></measure>']
    );
    try {
      await Promise.all([fs.writeFile(inputPath, "input"), fs.writeFile(imageA, "same prepared bytes"), fs.writeFile(imageB, "same prepared bytes")]);
      adapter.resolveAudiverisBin = async () => "/tmp/Audiveris";
      adapter.preprocessInput = async () => ({ pages: [{ originalPath: imageA, attempts: [
        { paths: [imageA], description: "preparação A" },
        { paths: [imageB], description: "preparação B" }
      ] }], warnings: [] });
      let executions = 0;
      adapter.convertPage = async () => { executions += 1; return { musicXml: xml, warnings: [] }; };

      const result = await adapter.convert(inputPath, "source.pdf", dir, { scoreType: "guitar_duo" });

      expect(executions).toBe(1);
      expect(result.evidence).toHaveLength(1);
      expect(result.evidence?.[0]).toMatchObject({ candidate: 1, candidateIds: [1, 2] });
      expect(result.evidence?.[0].reason).toContain("reutilizaram sua leitura; não são votos independentes");
      expect(result.evidence?.[0].sourceImagePaths?.map((source) => source.candidate)).toEqual([1, 2]);
      expect(result.evidence?.[0].sourceImagePaths?.[0].sha256).toBe(result.evidence?.[0].sourceImagePaths?.[1].sha256);
      expect(result.evidence?.[0].sourceImagePaths?.map((source) => path.basename(source.path))).toEqual(["prepared-a.png", "prepared-b.png"]);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("não repete leitura nem conta imagem duplicada como sucesso independente após falha da origem", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      convert(inputPath: string, originalFilename: string, outputDir: string, options?: { scoreType?: "guitar_duo" }): Promise<{ evidence?: Array<{ candidate: number; candidateIds?: number[] }> }>;
      resolveAudiverisBin(): Promise<string>;
      preprocessInput(): Promise<{ pages: Array<{ originalPath: string; attempts: Array<{ paths: string[]; description: string }> }>; warnings: string[] }>;
      convertPage(pagePath: string): Promise<{ musicXml: string; warnings: string[] }>;
    };
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-identical-failure-"));
    const inputPath = path.join(dir, "source.pdf");
    const imageA = path.join(dir, "first.png");
    const imageAlias = path.join(dir, "duplicate.png");
    const imageC = path.join(dir, "third.png");
    const xml = score(
      ['<measure number="1"><note><pitch><step>C</step><octave>5</octave></pitch></note></measure>'],
      ['<measure number="1"><note><pitch><step>E</step><octave>4</octave></pitch></note></measure>']
    );
    try {
      await Promise.all([fs.writeFile(inputPath, "input"), fs.writeFile(imageA, "same bytes"), fs.writeFile(imageAlias, "same bytes"), fs.writeFile(imageC, "other bytes")]);
      adapter.resolveAudiverisBin = async () => "/tmp/Audiveris";
      adapter.preprocessInput = async () => ({ pages: [{ originalPath: imageA, attempts: [
        { paths: [imageA], description: "primeira imagem" },
        { paths: [imageAlias], description: "alias idêntico" },
        { paths: [imageC], description: "imagem distinta" }
      ] }], warnings: [] });
      const executions: string[] = [];
      adapter.convertPage = async (pagePath) => {
        executions.push(path.basename(pagePath));
        if (pagePath === imageA) throw new AppError(422, "falha de teste", "AUDIVERIS_FAILED");
        return { musicXml: xml, warnings: [] };
      };

      const result = await adapter.convert(inputPath, "source.pdf", dir, { scoreType: "guitar_duo" });

      expect(executions).toEqual(["first.png", "third.png"]);
      expect(result.evidence).toEqual([expect.objectContaining({ candidate: 3 })]);
      expect(result.evidence?.some((candidate) => candidate.candidateIds?.includes(2))).toBe(false);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("mantém o comportamento anterior quando não consegue ler o hash da imagem", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      convert(inputPath: string, originalFilename: string, outputDir: string, options?: { scoreType?: "guitar_duo" }): Promise<unknown>;
      resolveAudiverisBin(): Promise<string>;
      preprocessInput(): Promise<{ pages: Array<{ originalPath: string; attempts: Array<{ paths: string[]; description: string }> }>; warnings: string[] }>;
      convertPage(pagePath: string): Promise<{ musicXml: string; warnings: string[] }>;
    };
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-unreadable-hash-"));
    const inputPath = path.join(dir, "source.pdf");
    const xml = score(
      ['<measure number="1"><note><pitch><step>C</step><octave>5</octave></pitch></note></measure>'],
      ['<measure number="1"><note><pitch><step>E</step><octave>4</octave></pitch></note></measure>']
    );
    try {
      await fs.writeFile(inputPath, "input");
      adapter.resolveAudiverisBin = async () => "/tmp/Audiveris";
      adapter.preprocessInput = async () => ({ pages: [{ originalPath: inputPath, attempts: [
        { paths: [path.join(dir, "missing-a.png")], description: "sem arquivo A" },
        { paths: [path.join(dir, "missing-b.png")], description: "sem arquivo B" }
      ] }], warnings: [] });
      let executions = 0;
      adapter.convertPage = async () => { executions += 1; return { musicXml: xml, warnings: [] }; };

      await adapter.convert(inputPath, "source.pdf", dir, { scoreType: "guitar_duo" });

      expect(executions).toBe(2);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("inclui a comparação de pautas da imagem original na validação antes de escolher candidato", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      convert(inputPath: string, originalFilename: string, outputDir: string): Promise<{ validation?: { issues: Array<{ code: string; page?: number }> } }>;
      resolveAudiverisBin(): Promise<string>;
      preprocessInput(): Promise<{ pages: Array<{ originalPath: string; attempts: Array<{ paths: string[]; description: string }> }>; warnings: string[] }>;
      convertPage(pagePath: string): Promise<{ musicXml: string; warnings: string[] }>;
    };
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-source-layout-integration-"));
    const inputPath = path.join(dir, "source.png");
    const lines = Array.from({ length: 6 }, (_value, bandIndex) => Array.from({ length: 5 }, (_line, lineIndex) => {
      const y = 30 + bandIndex * 230 + lineIndex * 10;
      return `<rect x="100" y="${y}" width="800" height="2" fill="black"/>`;
    }).join("")).join("");
    const svg = `<svg width="1000" height="1500" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/>${lines}</svg>`;
    const xml = `<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list><part id="P1">
      <measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><rest/><duration>1</duration></note></measure>
      <measure number="2"><print new-system="yes"/><note><rest/><duration>1</duration></note></measure>
      <measure number="3"><note><rest/><duration>1</duration></note></measure>
    </part></score-partwise>`;
    try {
      await sharp(Buffer.from(svg)).png().toFile(inputPath);
      adapter.resolveAudiverisBin = async () => "/tmp/Audiveris";
      adapter.preprocessInput = async () => ({ pages: [{ originalPath: inputPath, attempts: [{ paths: [inputPath], description: "original" }] }], warnings: [] });
      adapter.convertPage = async () => ({ musicXml: xml, warnings: [] });

      const result = await adapter.convert(inputPath, "source.png", dir);

      expect(result.validation?.issues).toContainEqual(expect.objectContaining({ code: "SOURCE_STAFF_COVERAGE_SUSPECTED", page: 1 }));
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("escolhe versão estruturalmente válida mesmo quando outra tem menos avisos", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      convert(inputPath: string, originalFilename: string, outputDir: string, options?: { scoreType?: "guitar_duo" }): Promise<{ musicXml: string; coverage?: { missingPages: number[] } }>;
      resolveAudiverisBin(): Promise<string>;
      preprocessInput(): Promise<{ pages: Array<{ attempts: Array<{ paths: string[]; description: string }> }>; warnings: string[] }>;
      convertPage(pagePath: string): Promise<{ musicXml: string; warnings: string[] }>;
    };
    const good = score(
      ['<measure number="1"><note><pitch><step>C</step><octave>5</octave></pitch></note></measure>'],
      ['<measure number="1"><note><pitch><step>E</step><octave>4</octave></pitch></note></measure>']
    );
    const missingGuitar = good.replace(/<part id="P2">[\s\S]*?<\/part>/, "");
    adapter.resolveAudiverisBin = async () => "/tmp/Audiveris";
    adapter.preprocessInput = async () => ({ pages: [{ attempts: [{ paths: ["/tmp/bad.png"], description: "bad" }, { paths: ["/tmp/good.png"], description: "good" }] }], warnings: [] });
    adapter.convertPage = async (pagePath) => pagePath.endsWith("bad.png")
      ? { musicXml: missingGuitar, warnings: [] }
      : { musicXml: good, warnings: ["Aviso válido"] };
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-valid-variant-"));
    try {
      const output = await adapter.convert("/tmp/input.png", "input.png", dir, { scoreType: "guitar_duo" });
      expect(output.coverage?.missingPages).toEqual([]);
      expect(output.musicXml).toContain('<part id="P2">');
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("não transforma perda de parte em página parcial quando todas as versões são inválidas", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      convert(inputPath: string, originalFilename: string, outputDir: string, options?: { scoreType?: "guitar_duo" }): Promise<unknown>;
      resolveAudiverisBin(): Promise<string>;
      preprocessInput(): Promise<{ pages: Array<{ attempts: Array<{ paths: string[]; description: string }> }>; warnings: string[] }>;
      convertPage(pagePath: string): Promise<{ musicXml: string; warnings: string[] }>;
    };
    const good = score(['<measure number="1"><note><rest/></note></measure>'], ['<measure number="1"><note><rest/></note></measure>']);
    adapter.resolveAudiverisBin = async () => "/tmp/Audiveris";
    adapter.preprocessInput = async () => ({ pages: [
      { attempts: [{ paths: ["/tmp/good.png"], description: "good" }] },
      { attempts: [{ paths: ["/tmp/bad-1.png"], description: "bad 1" }, { paths: ["/tmp/bad-2.png"], description: "bad 2" }] }
    ], warnings: [] });
    adapter.convertPage = async (pagePath) => ({ musicXml: pagePath.endsWith("good.png") ? good : good.replace(/<part id="P2">[\s\S]*?<\/part>/, ""), warnings: [] });
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-all-invalid-"));
    try {
      await expect(adapter.convert("/tmp/input.pdf", "input.pdf", dir, { scoreType: "guitar_duo" })).rejects.toMatchObject({ code: "OMR_PART_INTEGRITY" });
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("preserva timeout do processo e aceita outra versão válida da página", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      convert(inputPath: string, originalFilename: string, outputDir: string, options?: { scoreType?: "guitar_duo" }): Promise<{ coverage?: { missingPages: number[] } }>;
      resolveAudiverisBin(): Promise<string>;
      preprocessInput(): Promise<{ pages: Array<{ attempts: Array<{ paths: string[]; description: string }> }>; warnings: string[] }>;
      convertPage(pagePath: string): Promise<{ musicXml: string; warnings: string[] }>;
    };
    const good = score(['<measure number="1"><note><rest/></note></measure>'], ['<measure number="1"><note><rest/></note></measure>']);
    adapter.resolveAudiverisBin = async () => "/tmp/Audiveris";
    adapter.preprocessInput = async () => ({ pages: [{ attempts: [{ paths: ["/tmp/timeout.png"], description: "timeout" }, { paths: ["/tmp/good.png"], description: "good" }] }], warnings: [] });
    adapter.convertPage = async (pagePath) => { if (pagePath.endsWith("timeout.png")) throw new AppError(504, "timeout", "OMR_CONVERSION_TIMEOUT"); return { musicXml: good, warnings: [] }; };
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-timeout-fallback-"));
    try {
      expect((await adapter.convert("/tmp/input.png", "input.png", dir, { scoreType: "guitar_duo" })).coverage?.missingPages).toEqual([]);
      adapter.convertPage = async () => { throw new AppError(504, "timeout", "OMR_CONVERSION_TIMEOUT"); };
      await expect(adapter.convert("/tmp/input.png", "input.png", dir, { scoreType: "guitar_duo" })).rejects.toMatchObject({ code: "OMR_CONVERSION_TIMEOUT" });
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("não reempacota o timeout do Audiveris em AUDIVERIS_FAILED", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      convertPage(pagePath: string, originalFilename: string, outputDir: string): Promise<unknown>;
      runAudiveris(pagePath: string, outputDir: string): Promise<void>;
    };
    adapter.runAudiveris = async () => { throw new AppError(504, "timeout", "OMR_CONVERSION_TIMEOUT"); };
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-direct-timeout-"));
    try {
      await expect(adapter.convertPage("/tmp/page.png", "input.png", dir)).rejects.toMatchObject({ code: "OMR_CONVERSION_TIMEOUT" });
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("preserva ENOSPC nativo nas variantes e na preparação, sem tratar ENOENT como temporário", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      convert(inputPath: string, originalFilename: string, outputDir: string): Promise<unknown>;
      convertPage(pagePath: string, originalFilename: string, outputDir: string): Promise<unknown>;
      runAudiveris(pagePath: string, outputDir: string): Promise<void>;
      resolveAudiverisBin(): Promise<string>;
      preprocessInput(): Promise<{ pages: Array<{ attempts: Array<{ paths: string[]; description: string }> }>; warnings: string[] }>;
    };
    const diskFull = Object.assign(new Error("disk full"), { code: "ENOSPC" });
    adapter.runAudiveris = async () => { throw diskFull; };
    adapter.resolveAudiverisBin = async () => "/tmp/Audiveris";
    adapter.preprocessInput = async () => ({ pages: [{ attempts: [{ paths: ["/tmp/one.png"], description: "one" }, { paths: ["/tmp/two.png"], description: "two" }] }], warnings: [] });
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-native-temp-"));
    try {
      await expect(adapter.convertPage("/tmp/one.png", "input.png", dir)).rejects.toBe(diskFull);
      await expect(adapter.convert("/tmp/input.png", "input.png", dir)).rejects.toBe(diskFull);
      adapter.preprocessInput = async () => { throw diskFull; };
      await expect(adapter.convert("/tmp/input.png", "input.png", dir)).rejects.toBe(diskFull);
      adapter.preprocessInput = async () => { throw Object.assign(new Error("missing"), { code: "ENOENT" }); };
      await expect(adapter.convert("/tmp/input.png", "input.png", dir)).rejects.toMatchObject({ code: "OMR_PREPROCESS_FAILED" });
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("retorna mensagem clara quando o executavel configurado nao existe", async () => {
    const originalBin = env.AUDIVERIS_BIN;
    env.AUDIVERIS_BIN = "/tmp/audiveris-inexistente/Audiveris";
    const adapter = new AudiverisOmrAdapter() as unknown as {
      resolveAudiverisBin(): Promise<string>;
    };

    try {
      await expect(adapter.resolveAudiverisBin()).rejects.toMatchObject({
        code: "AUDIVERIS_NOT_FOUND",
        message: expect.stringContaining("Audiveris não encontrado em /tmp/audiveris-inexistente/Audiveris")
      });
    } finally {
      env.AUDIVERIS_BIN = originalBin;
    }
  });

  it("preserva todos os instrumentos ao juntar MusicXMLs de paginas diferentes", () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      mergePageMusicXml(pageXml: string[]): string;
    };

    const page1 = score(
      [
        '<measure number="10" width="100"><note><pitch><step>C</step><octave>5</octave></pitch></note></measure>',
        '<measure number="11" width="101"><note><pitch><step>D</step><octave>5</octave></pitch></note></measure>'
      ],
      [
        '<measure number="10" width="100"><note><pitch><step>E</step><octave>4</octave></pitch></note></measure>',
        '<measure number="11" width="101"><note><pitch><step>F</step><octave>4</octave></pitch></note></measure>'
      ]
    );
    const page2 = score(
      [
        '<measure number="1" width="200"><note><pitch><step>G</step><octave>5</octave></pitch></note></measure>',
        '<measure number="2" width="201"><note><pitch><step>A</step><octave>5</octave></pitch></note></measure>'
      ],
      [
        '<measure number="1" width="200"><note><pitch><step>B</step><octave>4</octave></pitch></note></measure>',
        '<measure number="2" width="201"><note><pitch><step>C</step><octave>4</octave></pitch></note></measure>'
      ]
    );

    const merged = adapter.mergePageMusicXml([page1, page2]);

    expect([...merged.matchAll(/<part id="P\d">/g)]).toHaveLength(2);
    expect([...partBody(merged, "P1").matchAll(/<measure\b/g)]).toHaveLength(4);
    expect([...partBody(merged, "P2").matchAll(/<measure\b/g)]).toHaveLength(4);
    expect(partBody(merged, "P1")).toContain("<step>A</step>");
    expect(partBody(merged, "P2")).toContain("<step>C</step>");
    expect(partBody(merged, "P2").match(/<measure number="\d+"/g)).toEqual([
      '<measure number="1"',
      '<measure number="2"',
      '<measure number="3"',
      '<measure number="4"'
    ]);
  });

  it("mantem MusicXML parcial quando apenas algumas paginas falham", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      convert(inputPath: string, originalFilename: string, outputDir: string, options?: { scoreType?: "guitar_duo" }): Promise<{
        musicXml: string;
        coverage?: { missingPages: number[] };
        warnings: string[];
      }>;
      resolveAudiverisBin(): Promise<string>;
      preprocessInput(inputPath: string, outputDir: string): Promise<{ pages: Array<{ attempts: Array<{ paths: string[]; description: string }> }>; warnings: string[] }>;
      convertPage(pagePath: string, originalFilename: string, pageOutputDir: string): Promise<{ musicXml: string; confidence: number; warnings: string[] }>;
    };

    const page1 = score(
      ['<measure number="1"><note><pitch><step>C</step><octave>5</octave></pitch></note></measure>'],
      ['<measure number="1"><note><pitch><step>E</step><octave>4</octave></pitch></note></measure>']
    );

    adapter.resolveAudiverisBin = async () => "/tmp/Audiveris";
    adapter.preprocessInput = async () => ({
      pages: [
        { attempts: [{ paths: ["/tmp/page-1.png"], description: "pagina 1" }] },
        { attempts: [{ paths: ["/tmp/page-2.png"], description: "pagina 2" }] }
      ],
      warnings: ["PDF dividido em 2 pagina(s)."]
    });
    adapter.convertPage = async (pagePath) => {
      if (pagePath.endsWith("page-2.png")) {
        throw new AppError(422, "Error in reaching step PAGE", "AUDIVERIS_FAILED");
      }
      return { musicXml: page1, confidence: 0.75, warnings: [] };
    };

    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-partial-"));
    const result = await adapter.convert("/tmp/input.pdf", "input.pdf", outputDir, { scoreType: "guitar_duo" });

    expect(result.musicXml).toContain("<score-partwise");
    expect(result.musicXml).toContain("<step>C</step>");
    expect(result.coverage?.missingPages).toEqual([2]);
    expect(result.warnings.join("\n")).toContain("Página 2: Tentamos 1 preparacao");
    expect(result.warnings.join("\n")).toContain("Error in reaching step PAGE");
    expect(result.warnings.join("\n")).toContain("MusicXML parcial");
  });

  it("permite piano parcial só quando a página mantida contém ambas as pautas", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      convert(inputPath: string, originalFilename: string, outputDir: string, options?: { scoreType?: "piano" }): Promise<{ coverage?: { missingPages: number[] } }>;
      resolveAudiverisBin(): Promise<string>;
      preprocessInput(inputPath: string, outputDir: string): Promise<{ pages: Array<{ attempts: Array<{ paths: string[]; description: string }> }>; warnings: string[] }>;
      convertPage(pagePath: string): Promise<{ musicXml: string; warnings: string[] }>;
    };
    const piano = (secondStaff: boolean) => `<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><staves>2</staves><clef number="1"><sign>G</sign></clef><clef number="2"><sign>F</sign></clef></attributes><note><rest/><staff>1</staff></note>${secondStaff ? "<note><rest/><staff>2</staff></note>" : ""}</measure></part></score-partwise>`;
    adapter.resolveAudiverisBin = async () => "/tmp/Audiveris";
    adapter.preprocessInput = async () => ({ pages: [{ attempts: [{ paths: ["/tmp/p1.png"], description: "p1" }] }, { attempts: [{ paths: ["/tmp/p2.png"], description: "p2" }] }], warnings: [] });
    adapter.convertPage = async (pagePath) => { if (pagePath.endsWith("p2.png")) throw new AppError(422, "sem leitura", "AUDIVERIS_FAILED"); return { musicXml: piano(true), warnings: [] }; };
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-piano-partial-"));
    expect((await adapter.convert("/tmp/input.pdf", "input.pdf", dir, { scoreType: "piano" })).coverage?.missingPages).toEqual([2]);
    adapter.convertPage = async () => ({ musicXml: piano(false), warnings: [] });
    await expect(adapter.convert("/tmp/input.pdf", "input.pdf", dir, { scoreType: "piano" })).rejects.toMatchObject({ code: "OMR_STAFF_INTEGRITY" });
  });

  it("prefere a página inteira quando recortes por sistema produzem mais compassos", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      convert(inputPath: string, originalFilename: string, outputDir: string, options?: { scoreType?: "guitar_duo" }): Promise<{
        musicXml: string;
        warnings: string[];
      }>;
      resolveAudiverisBin(): Promise<string>;
      preprocessInput(inputPath: string, outputDir: string): Promise<{ pages: Array<{ attempts: Array<{ paths: string[]; description: string; combineSegments?: boolean }> }>; warnings: string[] }>;
      convertPage(pagePath: string, originalFilename: string, pageOutputDir: string): Promise<{ musicXml: string; confidence: number; warnings: string[] }>;
    };

    const partial = score(
      [
        '<measure number="1"><note><pitch><step>C</step><octave>5</octave></pitch></note></measure>',
        '<measure number="2"><note><pitch><step>D</step><octave>5</octave></pitch></note></measure>'
      ],
      []
    );
    const segment1 = score(
      [
        '<measure number="1"><note><pitch><step>E</step><octave>5</octave></pitch></note></measure>',
        '<measure number="2"><note><pitch><step>F</step><octave>5</octave></pitch></note></measure>'
      ],
      []
    );
    const segment2 = score(
      [
        '<measure number="1"><note><pitch><step>G</step><octave>5</octave></pitch></note></measure>',
        '<measure number="2"><note><pitch><step>A</step><octave>5</octave></pitch></note></measure>',
        '<measure number="3"><note><pitch><step>B</step><octave>5</octave></pitch></note></measure>'
      ],
      []
    );

    adapter.resolveAudiverisBin = async () => "/tmp/Audiveris";
    adapter.preprocessInput = async () => ({
      pages: [{
        attempts: [
          { paths: ["/tmp/full-page.png"], description: "pagina inteira" },
          { paths: ["/tmp/system-1.png", "/tmp/system-2.png"], description: "2 recortes por sistema", combineSegments: true }
        ]
      }],
      warnings: []
    });
    adapter.convertPage = async (pagePath) => {
      if (pagePath.endsWith("full-page.png")) return { musicXml: partial, confidence: 0.75, warnings: [] };
      if (pagePath.endsWith("system-1.png")) return { musicXml: segment1, confidence: 0.75, warnings: [] };
      return { musicXml: segment2, confidence: 0.75, warnings: [] };
    };

    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-best-attempt-"));
    await expect(adapter.convert("/tmp/input.pdf", "input.pdf", outputDir, { scoreType: "guitar_duo" })).rejects.toMatchObject({ code: "OMR_PART_INTEGRITY" });
  });

  it("não publica recortes quando nenhuma página completa é reconhecida", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      convert(inputPath: string, originalFilename: string, outputDir: string): Promise<{
        musicXml: string;
        confidence: number;
        warnings: string[];
      }>;
      resolveAudiverisBin(): Promise<string>;
      preprocessInput(inputPath: string, outputDir: string): Promise<{ pages: Array<{ attempts: Array<{ paths: string[]; description: string; combineSegments?: boolean }> }>; warnings: string[] }>;
      convertPage(pagePath: string, originalFilename: string, pageOutputDir: string): Promise<{ musicXml: string; confidence: number; warnings: string[] }>;
    };

    const segment1 = score(
      ['<measure number="1"><note><pitch><step>E</step><octave>5</octave></pitch></note></measure>'],
      []
    );
    const segment2 = score(
      ['<measure number="1"><note><pitch><step>F</step><octave>5</octave></pitch></note></measure>'],
      []
    );

    adapter.resolveAudiverisBin = async () => "/tmp/Audiveris";
    adapter.preprocessInput = async () => ({
      pages: [{
        attempts: [
          { paths: ["/tmp/full-page.png"], description: "pagina inteira" },
          { paths: ["/tmp/system-1.png", "/tmp/system-2.png"], description: "2 recortes por sistema", combineSegments: true }
        ]
      }],
      warnings: []
    });
    adapter.convertPage = async (pagePath) => {
      if (pagePath.endsWith("full-page.png")) throw new AppError(422, "Error in reaching step PAGE", "AUDIVERIS_FAILED");
      return pagePath.endsWith("system-1.png")
        ? { musicXml: segment1, confidence: 0.75, warnings: [] }
        : { musicXml: segment2, confidence: 0.75, warnings: [] };
    };

    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-segment-fallback-"));
    await expect(adapter.convert("/tmp/input.pdf", "input.pdf", outputDir)).rejects.toMatchObject({ code: "PAGE_CLASSIFICATION_REQUIRED" });
  });

  it("resume falta de idioma OCR sem expor o comando bruto do Audiveris", () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      summarizeAudiverisOutput(output: string): string;
    };

    const summary = adapter.summarizeAudiverisOutput(
      "Command failed: /opt/audiveris/bin/Audiveris -batch -transcribe -export /tmp/audiveris-input.png WARN [] Languages 142 | *** No installed OCR languages *** Input \"/tmp/audiveris-input.png\" WARN Book 2044 | Error processing stub"
    );

    expect(summary).toContain("não há nenhum idioma OCR instalado");
    expect(summary).toContain("reinicie a API e o worker");
    expect(summary).not.toContain("Command failed");
    expect(summary).not.toContain("/tmp/audiveris-input.png");
  });

  it("explica falha de reconhecimento da pagina como problema de qualidade da imagem", () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      summarizeAudiverisOutput(output: string): string;
    };

    const summary = adapter.summarizeAudiverisOutput(
      "Command failed: /opt/audiveris/bin/Audiveris -batch -transcribe WARN [audiveris-input] Book 2044 | Error processing stub WARN [audiveris-input] CLI 956 | Exception occurred java.lang.Exception: Error in reaching step PAGE"
    );

    expect(summary).toContain("Não foi possível reconhecer a página");
    expect(summary).toContain("imagem está inclinada");
    expect(summary).toContain("modo documento/scan");
    expect(summary).not.toContain("Command failed");
    expect(summary).not.toContain("java.lang.Exception");
  });

  it("resume falha de renderizacao do PDF sem expor o comando bruto", () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      summarizePreprocessFailure(error: unknown): string;
    };

    const summary = adapter.summarizePreprocessFailure(new Error(
      "Command failed: pdftoppm -png -scale-to 4400 /app/storage/uploads/arquivo.pdf /tmp/score-omr/audiveris-input\nSyntax Error: Couldn't find trailer dictionary"
    ));

    expect(summary).toContain("Não foi possível ler todas as páginas do PDF");
    expect(summary).toContain("salve uma nova cópia");
    expect(summary).not.toContain("Command failed");
    expect(summary).not.toContain("/app/storage/uploads/arquivo.pdf");
  });

  it("ordena paginas renderizadas numericamente", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      findRenderedPages(dir: string): Promise<string[]>;
    };
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-pages-"));
    await fs.writeFile(path.join(dir, "audiveris-input-10.png"), "");
    await fs.writeFile(path.join(dir, "audiveris-input-2.png"), "");
    await fs.writeFile(path.join(dir, "audiveris-input-1.png"), "");

    const pages = await adapter.findRenderedPages(dir);

    expect(pages.map((page) => path.basename(page))).toEqual([
      "audiveris-input-1.png",
      "audiveris-input-2.png",
      "audiveris-input-10.png"
    ]);
  });

  it("rejeita PDF acima do limite antes de renderizar qualquer página", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      findPdfPageCount(inputPath: string): Promise<number>;
      renderPdfPages(command: string, inputPath: string, outputPrefix: string): Promise<void>;
    };
    adapter.findPdfPageCount = async () => env.OMR_MAX_PAGES + 1;
    await expect(adapter.renderPdfPages("/nonexistent/pdftoppm", "/tmp/input.pdf", "/tmp/page")).rejects.toMatchObject({ code: "OMR_PAGE_LIMIT" });
  });

  it("prepara fotos de celular antes de chamar o Audiveris", () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      imagePreprocessVariants(inputPath: string, outputDir: string): Array<{ name: string; outputPath: string; args: string[] }>;
    };

    const variants = adapter.imagePreprocessVariants("/tmp/foto.jpg", "/tmp");
    const softArgs = variants.find((variant) => variant.name === "contraste-suave")?.args ?? [];
    const documentArgs = variants.find((variant) => variant.name === "documento")?.args ?? [];
    const highContrastArgs = variants.find((variant) => variant.name === "alto-contraste")?.args ?? [];

    expect(variants).toHaveLength(3);
    expect(softArgs).toEqual(expect.arrayContaining([
      "-auto-orient",
      "-deskew",
      "40%",
      "-colorspace",
      "Gray",
      "-contrast-stretch",
      "2%x2%",
      "-sharpen",
      "0x1"
    ]));
    expect(documentArgs).toEqual(expect.arrayContaining(["-normalize", "-adaptive-sharpen", "0x1.1"]));
    expect(highContrastArgs).toEqual(expect.arrayContaining(["-lat", "35x35-8%", "-morphology", "Close", "Octagon:1"]));
    expect(softArgs).toContain("/tmp/foto.jpg");
    expect(softArgs).toEqual(expect.arrayContaining(["-limit", "memory", "256MiB", "map", "512MiB", "disk", "1GiB"]));
    expect(softArgs.at(-1)).toBe("/tmp/audiveris-input-soft.png");
  });

  it("usa preparacao leve para imagens vindas do scanner nativo", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      preprocessInput(inputPath: string, outputDir: string, options: { preprocessingProfile?: string | null }): Promise<{ pages: Array<{ attempts: Array<{ paths: string[]; description: string }> }>; warnings: string[] }>;
    };
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-document-scanner-"));
    const inputPath = path.join(dir, "scan.jpg");
    const png1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");
    await fs.writeFile(inputPath, png1x1);

    const result = await adapter.preprocessInput(inputPath, dir, { preprocessingProfile: "document_scanner" });

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].attempts).toHaveLength(1);
    expect(result.pages[0].attempts[0].description).toBe("scanner nativo padronizado");
    expect(path.basename(result.pages[0].attempts[0].paths[0])).toBe("audiveris-input-document-scanner.png");
    expect(result.warnings.join("\n")).toContain("scanner nativo de documentos");
  });

  it("aceita exercício curto válido tanto em foto quanto em PDF", () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      assertUsefulMusicXml(musicXml: string, originalFilename: string): void;
    };
    const tinyMusicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1"><note><pitch><step>C</step><octave>4</octave></pitch></note></measure>
  </part>
</score-partwise>`;

    expect(() => adapter.assertUsefulMusicXml(tinyMusicXml, "foto.jpg")).not.toThrow();
    expect(() => adapter.assertUsefulMusicXml(tinyMusicXml, "scan.pdf")).not.toThrow();
  });

  it("remove creditos OCR sobrepostos e usa o nome do arquivo como titulo", () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      cleanAudiverisText(musicXml: string, originalFilename: string): string;
    };
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <movement-title>Sons deCarinthies Page 03</movement-title>
  <work>
    <work-title>Texto OCR errado</work-title>
  </work>
  <credit page="1">
    <credit-words default-x="10" default-y="100">Titulo embolado</credit-words>
  </credit>
  <part-list>
    <score-part id="P1"><part-name>Music</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1"/>
  </part>
</score-partwise>`;

    const cleaned = adapter.cleanAudiverisText(musicXml, "Estudo & Peça.pdf");

    expect(cleaned).not.toContain("<credit");
    expect(cleaned).not.toContain("<movement-title>");
    expect(cleaned).not.toContain("Titulo embolado");
    expect(cleaned).toContain("<work-title>Estudo &amp; Peça</work-title>");
    expect(cleaned).toContain('<part id="P1">');
  });
});
