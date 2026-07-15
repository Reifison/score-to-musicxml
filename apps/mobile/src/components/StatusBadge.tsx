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

const palette: Record<ScoreStatus, { background: string; color: string }> = {
  uploaded: { background: "#eef3f8", color: colors.muted },
  queued: { background: "#fff3d9", color: "#8a5206" },
  processing: { background: "#e8f1ff", color: "#1c5faf" },
  converted: { background: "#ddfbf6", color: "#0b7466" },
  failed: { background: "#ffe7e7", color: "#a82929" }
};

export function StatusBadge({ status }: { status: ScoreStatus }) {
  const state = palette[status];
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: state.background, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
      <Text style={{ color: state.color, fontSize: 12, fontWeight: "800" }}>{labels[status]}</Text>
    </View>
  );
}
