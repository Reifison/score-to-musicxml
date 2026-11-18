import { describe, expect, it } from "vitest";
import { projectSourceRectangle, validSourceImageTransform, type SourceImageTransform } from "../services/SourceImageTransform.js";

const transform = (): SourceImageTransform => ({ version: 1, method: "crop_padding_v1",
  originalImageSHA256: "a".repeat(64), preparedImageSHA256: "b".repeat(64),
  originalWidth: 1000, originalHeight: 800, preparedWidth: 1060, preparedHeight: 900,
  crop: { left: 40, top: 20, width: 900, height: 740 }, padding: { left: 80, top: 80, right: 80, bottom: 80 } });

describe("verified crop and padding geometry", () => {
  it("maps two native bars to the original crop without scaling their widths", () => {
    expect(projectSourceRectangle({ left: 130, top: 180, width: 240, height: 40 }, transform()))
      .toEqual({ left: 90, top: 120, width: 240, height: 40 });
    expect(projectSourceRectangle({ left: 370, top: 180, width: 280, height: 40 }, transform()))
      .toEqual({ left: 330, top: 120, width: 280, height: 40 });
  });
  it("never projects padding into an unobserved area of the source", () => {
    expect(projectSourceRectangle({ left: 0, top: 10, width: 40, height: 30 }, transform())).toBeNull();
    expect(projectSourceRectangle({ left: 70, top: 70, width: 40, height: 40 }, transform()))
      .toEqual({ left: 40, top: 20, width: 30, height: 30 });
  });
  it("rejects inconsistent dimensions, crop bounds, hashes and unsupported transforms", () => {
    for (const patch of [
      { preparedWidth: 1000 }, { originalWidth: 900 }, { originalImageSHA256: "unknown" },
      { method: "deskew" }, { crop: { left: -1, top: 0, width: 900, height: 740 } }
    ]) expect(validSourceImageTransform({ ...transform(), ...patch } as SourceImageTransform)).toBe(false);
  });
  it("projects resized evidence into the original source pixels and rejects inconsistent output size", () => {
    const resized: SourceImageTransform = { ...transform(), method: "crop_resize_padding_v1",
      resize: { width: 1800, height: 1480 }, preparedWidth: 1960, preparedHeight: 1640 };
    expect(validSourceImageTransform(resized)).toBe(true);
    expect(projectSourceRectangle({ left: 180, top: 280, width: 200, height: 80 }, resized))
      .toEqual({ left: 90, top: 120, width: 100, height: 40 });
    expect(validSourceImageTransform({ ...resized, preparedWidth: 1900 })).toBe(false);
  });
});
