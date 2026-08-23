import { describe, expect, it } from "vitest";
import { LOCAL_SAMPLE_MANIFESTS } from "./sampleManifests";

describe("LOCAL_SAMPLE_MANIFESTS", () => {
  it("fornece dois bancos locais com duas camadas de intensidade", () => {
    for (const instrument of ["piano", "guitar"] as const) {
      const manifest = LOCAL_SAMPLE_MANIFESTS[instrument];
      expect(manifest.samples).toHaveLength(32);
      expect(manifest.attribution).toBeTruthy();
      expect(manifest.samples.every((sample) => sample.url.startsWith(`/audio/samples/${instrument === "piano" ? "piano" : "guitar"}/`))).toBe(true);
      expect(manifest.samples.some((sample) => sample.minVelocity === 0 && sample.maxVelocity === 0.55)).toBe(true);
      expect(manifest.samples.some((sample) => sample.minVelocity === 0.55 && sample.maxVelocity === 1)).toBe(true);
    }
  });
});
