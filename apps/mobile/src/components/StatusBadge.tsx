import { Text, View } from "react-native";
import type { ScoreStatus } from "../api/types";
import { colors, radius } from "../theme/styles";

const labels: Record<ScoreStatus, string> = {
  uploaded: "Enviado",
  queued: "Na fila",
  processing: "Processando",
  converted: "Convertido",
  failed: "Falhou"
};

const palette: Record<ScoreStatus, { background: string; text: string }> = {
  uploaded: { background: colors.line, text: colors.muted },
  queued: { background: "#FDF0DC", text: colors.accentWarm },
  processing: { background: "#E6F9F5", text: colors.primaryDark },
  converted: { background: "#E6F9F5", text: colors.primaryDark },
  failed: { background: "#FCEEEE", text: colors.danger }
};

export function StatusBadge({ status }: { status: ScoreStatus }) {
  const tone = palette[status];

  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: tone.background,
        borderRadius: radius.pill,
        paddingHorizontal: 12,
        paddingVertical: 5
      }}
    >
      <Text style={{ color: tone.text, fontSize: 12, fontWeight: "700" }}>{labels[status]}</Text>
    </View>
  );
}
