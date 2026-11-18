import { describe, expect, it } from "vitest";
import { appendScoreUploadFields } from "./scoreUpload";

describe("mobile score upload fields", () => {
  it("sends the selected score type with the file in the same multipart request", () => {
    const entries: Array<[string, unknown]> = [];
    const formData = { append: (name: string, value: unknown) => entries.push([name, value]) } as unknown as FormData;
    const file = { uri: "file:///cache/duo.pdf", name: "duo.pdf", type: "application/pdf" };

    appendScoreUploadFields(formData, file, "guitar_duo");

    expect(entries).toEqual([["file", file], ["scoreType", "guitar_duo"]]);
  });
});
