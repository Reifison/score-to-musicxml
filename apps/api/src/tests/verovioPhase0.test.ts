import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { VerovioToolkit } from "verovio/esm";
import createVerovioModule from "verovio/wasm";

function readTrackChunks(midi: Buffer) {
  const tracks: Buffer[] = [];
  let offset = 14;
  while (offset + 8 <= midi.length) {
    expect(midi.subarray(offset, offset + 4).toString("ascii")).toBe("MTrk");
    const length = midi.readUInt32BE(offset + 4);
    tracks.push(midi.subarray(offset + 8, offset + 8 + length));
    offset += 8 + length;
  }
  return tracks;
}

function countNoteOn(track: Buffer, pitch: number) {
  let count = 0;
  for (let index = 0; index + 2 < track.length; index += 1) {
    if (track[index] === 0x90 && track[index + 1] === pitch && track[index + 2] > 0) count += 1;
  }
  return count;
}

describe("Verovio — evidência da Fase 0", () => {
  it("mantém partes distintas quando canal e programa são iguais (M03)", async () => {
    const xml = await fs.readFile(new URL("./fixtures/midi/same-channel-program.musicxml", import.meta.url), "utf8");
    const module = await createVerovioModule();
    const toolkit = new VerovioToolkit(module);
    try {
      toolkit.setOptions({ breaks: "none", inputFrom: "xml" });
      expect(toolkit.loadData(xml)).toBeTruthy();
      const midi = Buffer.from(toolkit.renderToMIDI().replaceAll(/\s/g, ""), "base64");
      const tracks = readTrackChunks(midi);
      expect(midi.readUInt16BE(10)).toBe(3); // conductor + duas partes
      expect(tracks).toHaveLength(3);
      expect(tracks.slice(1).map((track) => countNoteOn(track, 0x3c) + countNoteOn(track, 0x43))).toEqual([1, 1]);
      // Mesmo canal/programa não é evidência suficiente para fundir as partes.
      expect(tracks.slice(1).every((track) => track.includes(0x90))).toBe(true);
    } finally {
      toolkit.destroy();
    }
  });

  it("mantém instrumentos e vozes internas da mesma parte em uma trilha e expande repetição", async () => {
    const xml = await fs.readFile(new URL("./fixtures/midi/verovio-phase0-edge-cases.musicxml", import.meta.url), "utf8");
    const module = await createVerovioModule();
    const toolkit = new VerovioToolkit(module);
    try {
      toolkit.setOptions({ breaks: "none", inputFrom: "xml" });
      expect(toolkit.loadData(xml)).toBeTruthy();
      const midi = Buffer.from(toolkit.renderToMIDI().replaceAll(/\s/g, ""), "base64");
      const tracks = readTrackChunks(midi);

      expect(midi.subarray(0, 4).toString("ascii")).toBe("MThd");
      expect(midi.readUInt16BE(10)).toBe(2); // conductor + one sounding part
      expect(tracks).toHaveLength(2);
      const sounding = tracks[1];
      expect(sounding.toString("ascii")).toContain("Dueto na mesma parte");
      expect(sounding).toContainEqual(0x90); // first instrument uses MIDI channel 0
      expect(sounding).not.toContainEqual(0x91); // second midi-instrument does not become a track/channel
      expect([...sounding].filter((byte) => byte === 0x90).length).toBeGreaterThanOrEqual(4);
      expect(countNoteOn(sounding, 0x3c)).toBe(2); // C4 appears twice after repeat
      expect(countNoteOn(sounding, 0x43)).toBe(2); // G4 appears twice after repeat
    } finally {
      toolkit.destroy();
    }
  });
});
