import { Text, View } from "react-native";
import type { ScoreStatus } from "../api/types";
import { colors } from "../theme/styles";

const labels: Record<ScoreStatus, string> = {
  uploaded: "Enviado",
  queued: "Na fila",
  processing: "Processando",
  converted: "Convertido",
  failed: "Falhou"
};

const palette: Record<ScoreStatus, string> = {
  uploaded: colors.muted,
  queued: colors.warning,
  processing: colors.primary,
  converted: colors.success,
  failed: colors.danger
};

export function StatusBadge({ status }: { status: ScoreStatus }) {
  return (
    <View style={{ alignSelf: "flex-start", borderColor: palette[status], borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ color: palette[status], fontSize: 12, fontWeight: "700" }}>{labels[status]}</Text>
    </View>
  );
}
