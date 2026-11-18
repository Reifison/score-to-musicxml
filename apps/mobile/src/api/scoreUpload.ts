import type { ScoreType } from "./types";

export type MobileUploadFile = { uri: string; name: string; type: string };

export function appendScoreUploadFields(
  formData: Pick<FormData, "append">,
  file: MobileUploadFile,
  scoreType: ScoreType
): void {
  formData.append("file", file as unknown as Blob);
  formData.append("scoreType", scoreType);
}
