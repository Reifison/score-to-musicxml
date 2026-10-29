import { t, useTranslation } from "../i18n";
import { AdaptiveText as Text } from "../adaptive/AdaptiveTypography";
import { View } from "react-native";
import type { ConversionResultStatus, RecognitionQuality, ScoreStatus } from "../api/types";
import { colors } from "../theme/styles";

const labels: Record<ScoreStatus, string> = {
  uploaded: "Enviado",
  queued: "Na fila",
  processing: "Processando",
  converted: "Convertido",
  failed: "Falhou"
};

const palette: Record<ScoreStatus, { background: string; color: string }> = {
  uploaded: { background: "#eef3f8", color: colors.muted },
  queued: { background: "#fff3d9", color: "#8a5206" },
  processing: { background: "#e8f1ff", color: "#1c5faf" },
  converted: { background: "#ddfbf6", color: "#0b7466" },
  failed: { background: "#ffe7e7", color: "#a82929" }
};

export function StatusBadge({ status, resultStatus, recognitionQuality }: { status: ScoreStatus; resultStatus?: ConversionResultStatus | null; recognitionQuality?: RecognitionQuality | null }) {
  useTranslation();
  const state = palette[status];
  if (status === "converted" && resultStatus === "partial") {
    return <Badge background="#fff3d9" color="#704000" label={t("Parcial", "Partial")} />;
  }
  if (status === "converted" && recognitionQuality?.status === "needs_review") {
    return <Badge background="#fff3d9" color="#704000" label={t("Revisar partitura", "Review score")} />;
  }
  if (status === "converted" && recognitionQuality?.status === "unverified") {
    return <Badge background="#f1ece7" color="#62544d" label={t("Conferir original", "Compare with original")} />;
  }
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: state.background, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
      <Text style={{ color: state.color, fontSize: 12, fontWeight: "800" }}>{t(labels[status], ({ uploaded: "Uploaded", queued: "Queued", processing: "Processing", converted: "Converted", failed: "Failed" })[status])}</Text>
    </View>
  );
}

function Badge({ background, color, label }: { background: string; color: string; label: string }) {
  return (
    <View style={{ backgroundColor: background, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
      <Text style={{ color, fontSize: 12, fontWeight: "800" }}>{label}</Text>
    </View>
  );
}
