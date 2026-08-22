import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as Sharing from "expo-sharing";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { API_URL, api } from "../../src/api/client";
import { useAuth } from "../../src/auth/AuthProvider";
import { BottomNav, bottomNavHeight } from "../../src/components/BottomNav";
import { StatusBadge } from "../../src/components/StatusBadge";
import { ScorePlayerWebView } from "../../src/player/ScorePlayerWebView";
import { scoreDisplayName, scoreExtension } from "../../src/score/presentation";
import { colors, sharedStyles } from "../../src/theme/styles";

export default function ScoreDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();

  const scoreQuery = useQuery({
    queryKey: ["score", id],
    queryFn: () => api.score(token!, id),
    enabled: Boolean(token && id),
    refetchInterval: (query) => {
      const status = query.state.data?.score.conversionStatus;
      return status === "queued" || status === "processing" ? 3000 : false;
    }
  });

  const score = scoreQuery.data?.score;

  const musicXmlShareMutation = useMutation({
    mutationFn: async () => {
      if (!score) return;
      let result;
      try {
        result = await api.downloadMusicXml(token!, score);
      } catch {
        throw new Error("Não foi possível baixar o MusicXML. Verifique sua conexão e tente novamente.");
      }

      if (!(await Sharing.isAvailableAsync())) {
        throw new Error("O MusicXML foi baixado, mas o compartilhamento não está disponível neste dispositivo.");
      }

      try {
        await Sharing.shareAsync(result.uri, {
          dialogTitle: "Exportar MusicXML",
          mimeType: "application/vnd.recordare.musicxml+xml",
          UTI: "public.xml"
        });
      } catch {
        throw new Error("Não foi possível abrir o compartilhamento do MusicXML. Tente novamente.");
      }
    }
  });

  const midiShareMutation = useMutation({
    mutationFn: async () => {
      if (!score) return;
      let result;
      try {
        result = await api.downloadMidi(token!, score);
      } catch {
        throw new Error("Não foi possível baixar o MIDI. Verifique sua conexão e tente novamente.");
      }

      if (!(await Sharing.isAvailableAsync())) {
        throw new Error("O MIDI foi baixado, mas o compartilhamento não está disponível neste dispositivo.");
      }

      try {
        await Sharing.shareAsync(result.uri, {
          dialogTitle: "Exportar MIDI",
          mimeType: "audio/midi",
          UTI: "public.midi-audio"
        });
      } catch {
        throw new Error("Não foi possível abrir o compartilhamento do MIDI. Tente novamente.");
      }
    }
  });

  if (scoreQuery.isLoading || !score) {
    return (
      <View style={[sharedStyles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const canDownload = score.conversionStatus === "converted";

  return (
    <View style={sharedStyles.screen}>
      <ScrollView style={sharedStyles.screen} contentContainerStyle={styles.content}>
        <View style={styles.headerCard}>
          <StatusBadge status={score.conversionStatus} />
          <View style={styles.nameRow}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.nameLabel}>Nome da partitura</Text>
              <Text numberOfLines={2} style={styles.scoreName}>{scoreDisplayName(score)}</Text>
            </View>
            {scoreExtension(score) ? <Text style={styles.extension}>{scoreExtension(score)}</Text> : null}
          </View>
        </View>

        {score.errorMessage ? <Text style={sharedStyles.error}>{score.errorMessage}</Text> : null}

        <View style={styles.playerCard}>
          <View style={styles.sectionHeading}>
            <Ionicons color={colors.primary} name="musical-notes-outline" size={22} />
            <View style={styles.sectionHeadingText}>
              <Text style={styles.sectionTitle}>Partitura digital</Text>
              <Text style={styles.sectionSubtitle}>Visualize, acompanhe as notas e reproduza a partitura.</Text>
            </View>
          </View>
          <View style={styles.playerFrame}>
            <ScorePlayerWebView score={score} token={token!} />
          </View>
        </View>

        <View style={styles.preview}>
          <View style={styles.previewHeading}>
            <Ionicons color={colors.muted} name="document-outline" size={20} />
            <Text style={styles.previewTitle}>Arquivo original</Text>
          </View>
          <Image
            resizeMode="contain"
            source={{ uri: `${API_URL}/api/scores/${score.id}/preview-image`, headers: { Authorization: `Bearer ${token}` } }}
            style={styles.previewImage}
          />
        </View>

        <View style={styles.bottomActions}>
          <Text style={styles.exportHint}>MusicXML preserva melhor a notação para continuar editando a partitura.</Text>
          <Pressable
            accessibilityHint="Abre as opções para compartilhar ou salvar a partitura em MusicXML"
            accessibilityRole="button"
            disabled={!canDownload || musicXmlShareMutation.isPending}
            onPress={() => musicXmlShareMutation.mutate()}
            style={[sharedStyles.button, styles.downloadButton, (!canDownload || musicXmlShareMutation.isPending) && styles.disabled]}
          >
            {musicXmlShareMutation.isPending ? <ActivityIndicator color={colors.onPrimary} /> : <Ionicons color={colors.onPrimary} name="download-outline" size={20} />}
            <Text style={sharedStyles.buttonText}>{canDownload ? "Exportar MusicXML" : "MusicXML ainda não pronto"}</Text>
          </Pressable>
          {musicXmlShareMutation.error ? <Text style={sharedStyles.error}>{musicXmlShareMutation.error instanceof Error ? musicXmlShareMutation.error.message : "Não foi possível exportar o MusicXML."}</Text> : null}

          <Text style={[styles.exportHint, styles.midiHint]}>MIDI representa a execução e pode ser aberto no MuseScore ou em outro app compatível.</Text>
          <Pressable
            accessibilityHint="Abre as opções para compartilhar ou salvar a execução em MIDI"
            accessibilityRole="button"
            disabled={!canDownload || midiShareMutation.isPending}
            onPress={() => midiShareMutation.mutate()}
            style={[sharedStyles.button, sharedStyles.buttonSecondary, styles.downloadButton, (!canDownload || midiShareMutation.isPending) && styles.disabled]}
          >
            {midiShareMutation.isPending ? <ActivityIndicator color={colors.primary} /> : <Ionicons color={colors.ink} name="musical-notes-outline" size={20} />}
            <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextSecondary]}>{canDownload ? "Exportar MIDI" : "MIDI ainda não pronto"}</Text>
          </Pressable>
          {midiShareMutation.error ? <Text style={sharedStyles.error}>{midiShareMutation.error instanceof Error ? midiShareMutation.error.message : "Não foi possível exportar o MIDI."}</Text> : null}
        </View>
      </ScrollView>
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  bottomActions: {
    gap: 10
  },
  content: {
    flexGrow: 1,
    gap: 18,
    padding: 20,
    paddingBottom: bottomNavHeight + 28
  },
  disabled: {
    opacity: 0.55
  },
  downloadButton: {
    minHeight: 58
  },
  extension: {
    color: colors.faint,
    fontSize: 16,
    fontWeight: "800"
  },
  exportHint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  headerCard: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    gap: 16,
    padding: 16,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.05,
    shadowRadius: 18
  },
  nameLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800"
  },
  nameRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 8
  },
  midiHint: {
    marginTop: 8
  },
  preview: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 300,
    overflow: "hidden"
  },
  previewHeading: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  previewTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800"
  },
  previewImage: {
    backgroundColor: colors.surfaceSoft,
    height: 460,
    width: "100%"
  },
  playerCard: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden"
  },
  playerFrame: {
    borderTopColor: colors.line,
    borderTopWidth: 1
  },
  scoreName: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 27
  },
  sectionHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    padding: 16
  },
  sectionHeadingText: {
    flex: 1,
    gap: 3
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "800"
  }
});
