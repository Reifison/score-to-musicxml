import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as Sharing from "expo-sharing";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { API_URL, api } from "../../src/api/client";
import { useAuth } from "../../src/auth/AuthProvider";
import { BottomNav, bottomNavHeight } from "../../src/components/BottomNav";
import { StatusBadge } from "../../src/components/StatusBadge";
import { musicXmlActionLabel, scoreDisplayName, scoreExtension } from "../../src/score/presentation";
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

  const shareMutation = useMutation({
    mutationFn: async () => {
      if (!score) return;
      const result = await api.downloadMusicXml(token!, score);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, { mimeType: "application/vnd.recordare.musicxml+xml", UTI: "public.xml" });
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

        <View style={styles.preview}>
          <Image
            resizeMode="contain"
            source={{ uri: `${API_URL}/api/scores/${score.id}/preview-image`, headers: { Authorization: `Bearer ${token}` } }}
            style={styles.previewImage}
          />
        </View>

        <View style={styles.bottomActions}>
          <Pressable disabled={!canDownload || shareMutation.isPending} onPress={() => shareMutation.mutate()} style={[sharedStyles.button, styles.downloadButton, (!canDownload || shareMutation.isPending) && styles.disabled]}>
            {shareMutation.isPending ? <ActivityIndicator color="#fff" /> : <Ionicons color="#fff" name="download-outline" size={20} />}
            <Text style={sharedStyles.buttonText}>{musicXmlActionLabel(score)}</Text>
          </Pressable>
          {shareMutation.error ? <Text style={sharedStyles.error}>{shareMutation.error instanceof Error ? shareMutation.error.message : "Falha ao baixar."}</Text> : null}
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
  preview: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 300,
    overflow: "hidden"
  },
  previewImage: {
    backgroundColor: colors.surfaceSoft,
    height: 460,
    width: "100%"
  },
  scoreName: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 27
  }
});
