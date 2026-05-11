export type Role = "admin" | "user";
export type ScoreStatus = "uploaded" | "queued" | "processing" | "converted" | "failed";

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Score = {
  id: string;
  userId: string;
  originalFilename: string;
  storedFilename: string;
  fileType: "pdf" | "image" | string;
  mimeType: string;
  fileSize: number;
  uploadStatus: ScoreStatus;
  conversionStatus: ScoreStatus;
  errorMessage: string | null;
  warnings: string[] | null;
  confidence: number | null;
  musicxmlFilename: string | null;
  createdAt: string;
  updatedAt: string;
  convertedAt: string | null;
};

export type Entitlement = {
  plan: "free" | "paid";
  source: "free" | "apple" | "legacy_grant" | "admin_grant";
  freeScanLimit: number;
  freeScansUsed: number;
  freeScansRemaining: number | null;
  purchasedAt: string | null;
  appleProductId: string | null;
  grantedAt: string | null;
  grantedById: string | null;
  grantReason: string | null;
};
