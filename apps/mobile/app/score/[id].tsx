import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Sharing from "expo-sharing";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { API_URL, api } from "../../src/api/client";
import { useAuth } from "../../src/auth/AuthProvider";
import { BottomNav, bottomNavHeight } from "../../src/components/BottomNav";
import { StatusBadge } from "../../src/components/StatusBadge";
import { ScorePlayerWebView } from "../../src/player/ScorePlayerWebView";
import { scoreDisplayName } from "../../src/score/presentation";
import { colors, sharedStyles } from "../../src/theme/styles";

export default function ScoreDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const rootRef = useRef<View>(null);
  const playerFrameRef = useRef<View>(null);
  const playerAnchorYRef = useRef<number | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [immersive, setImmersive] = useState(false);
  const [playerBounds, setPlayerBounds] = useState({ left: 0, top: 0, width: 0 });
  const [scrollY, setScrollY] = useState(0);

  const measurePlayer = useCallback(() => {
    const root = rootRef.current;
    const frame = playerFrameRef.current;
    if (!root || !frame) return;

    root.measureInWindow((rootX, rootY) => {
      frame.measureInWindow((frameX, frameY, frameWidth) => {
        const anchorY = frameY - rootY + scrollY;
        playerAnchorYRef.current = anchorY;
        setPlayerBounds({
          left: frameX - rootX,
          top: anchorY - scrollY,
          width: frameWidth
        });
      });
    });
  }, [scrollY]);

  const schedulePlayerMeasurement = useCallback(() => {
    requestAnimationFrame(measurePlayer);
  }, [measurePlayer]);

  useEffect(() => {
    if (!immersive) schedulePlayerMeasurement();
  }, [immersive, schedulePlayerMeasurement]);

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

  useEffect(() => {
    if (score) setNameDraft(scoreDisplayName(score));
  }, [score?.id, score?.originalFilename]);

  const renameMutation = useMutation({
    mutationFn: (name: string) => api.renameScore(token!, id, `${name}${fileExtension(score?.originalFilename ?? "")}`),
    onSuccess: async ({ score: renamed }) => {
      queryClient.setQueryData(["score", id], { score: renamed });
      await queryClient.invalidateQueries({ queryKey: ["scores"] });
      setEditingName(false);
    },
    onError: (error) => Alert.alert("Não foi possível salvar o nome", error instanceof Error ? error.message : "Tente novamente.")
  });

  const favoriteMutation = useMutation({
    mutationFn: (isFavorite: boolean) => api.setScoreFavorite(token!, id, isFavorite),
    onSuccess: ({ score: updated }) => {
      queryClient.setQueryData(["score", id], { score: updated });
      queryClient.invalidateQueries({ queryKey: ["scores"] });
    },
    onError: (error) => Alert.alert("Não foi possível atualizar o favorito", error instanceof Error ? error.message : "Tente novamente.")
  });

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
  const canRename = score.fileType === "image";
  const displayName = scoreDisplayName(score);
  const nameChanged = Boolean(nameDraft.trim()) && nameDraft.trim() !== displayName;

  function cancelNameEdit() {
    setNameDraft(displayName);
    setEditingName(false);
  }

  return (
    <View ref={rootRef} style={sharedStyles.screen}>
      <Stack.Screen options={{ headerShown: !immersive }} />
      <ScrollView
        onLayout={schedulePlayerMeasurement}
        onScroll={(event) => {
          const nextScrollY = event.nativeEvent.contentOffset.y;
          setScrollY(nextScrollY);
          const playerAnchorY = playerAnchorYRef.current;
          if (playerAnchorY !== null) {
            setPlayerBounds((current) => ({ ...current, top: playerAnchorY - nextScrollY }));
          }
        }}
        scrollEventThrottle={16}
        style={sharedStyles.screen}
        contentContainerStyle={styles.content}
      >
        <View style={styles.headerCard}>
          <View style={styles.statusRow}>
            <StatusBadge status={score.conversionStatus} />
            <Pressable
              accessibilityLabel={score.isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
              accessibilityRole="button"
              accessibilityState={{ checked: score.isFavorite }}
              disabled={favoriteMutation.isPending}
              onPress={() => favoriteMutation.mutate(!score.isFavorite)}
              style={styles.favoriteButton}
            >
              <Ionicons color={score.isFavorite ? colors.danger : colors.muted} name={score.isFavorite ? "heart" : "heart-outline"} size={22} />
            </Pressable>
          </View>
          <View style={styles.nameRow}>
            <View style={styles.nameContent}>
              {editingName && canRename ? (
                <View style={styles.nameEditRow}>
                  <TextInput
                    accessibilityLabel="Nome da partitura"
                    autoFocus
                    maxLength={175}
                    onChangeText={setNameDraft}
                    onSubmitEditing={() => nameChanged && renameMutation.mutate(nameDraft.trim())}
                    returnKeyType="done"
                    style={styles.nameInput}
                    value={nameDraft}
                  />
                  <Pressable
                    accessibilityLabel="Salvar nome da partitura"
                    accessibilityRole="button"
                    disabled={!nameChanged || renameMutation.isPending}
                    onPress={() => renameMutation.mutate(nameDraft.trim())}
                    style={[styles.saveNameButton, (!nameChanged || renameMutation.isPending) && styles.disabled]}
                  >
                    {renameMutation.isPending ? <ActivityIndicator color={colors.primary} size="small" /> : <Ionicons color={colors.primary} name="checkmark" size={20} />}
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Cancelar edição do nome"
                    accessibilityRole="button"
                    disabled={renameMutation.isPending}
                    onPress={cancelNameEdit}
                    style={styles.saveNameButton}
                  >
                    <Ionicons color={colors.muted} name="close" size={20} />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  accessibilityHint={canRename ? "Toque para editar o nome" : undefined}
                  accessibilityRole={canRename ? "button" : undefined}
                  disabled={!canRename}
                  onPress={() => setEditingName(true)}
                  style={styles.editNameTrigger}
                >
                  <Text numberOfLines={2} style={styles.scoreName}>{displayName}</Text>
                  {canRename ? <Ionicons color={colors.muted} name="pencil-outline" size={17} /> : null}
                </Pressable>
              )}
            </View>
          </View>
        </View>

        {score.errorMessage ? <Text style={sharedStyles.error}>{score.errorMessage}</Text> : null}

        <View style={styles.playerCard}>
          <View style={styles.sectionHeading}>
            <Ionicons color={colors.primary} name="musical-notes-outline" size={22} />
            <View style={styles.sectionHeadingText}>
              <Text style={styles.sectionTitle}>Partitura digital</Text>
            </View>
          </View>
          <View ref={playerFrameRef} onLayout={schedulePlayerMeasurement} style={styles.playerFrame}>
            <View style={styles.playerPlaceholder} />
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
      {!immersive ? <BottomNav /> : null}
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <View
          pointerEvents={immersive || playerBounds.width > 0 ? "auto" : "none"}
          style={[
            styles.playerLayer,
            immersive
              ? { bottom: insets.bottom, left: 0, right: 0, top: insets.top }
              : {
                  height: 620,
                  left: playerBounds.left,
                  opacity: playerBounds.width > 0 ? 1 : 0,
                  top: playerBounds.top,
                  width: playerBounds.width
                }
          ]}
        >
          <ScorePlayerWebView
            immersive={immersive}
            onImmersiveChange={setImmersive}
            score={score}
            token={token!}
          />
        </View>
      </View>
    </View>
  );
}

function fileExtension(filename: string): string {
  const match = filename.match(/(\.[^.]+)$/);
  return match?.[1] ?? "";
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
  exportHint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  editNameTrigger: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 8,
    minHeight: 44
  },
  favoriteButton: {
    alignItems: "center",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  headerCard: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    gap: 8,
    padding: 14,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.05,
    shadowRadius: 18
  },
  nameContent: {
    flex: 1
  },
  nameEditRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  nameInput: {
    ...sharedStyles.input,
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 12
  },
  nameRow: {
    flexDirection: "row"
  },
  saveNameButton: {
    alignItems: "center",
    borderColor: colors.lineStrong,
    borderRadius: 12,
    borderWidth: 1,
    height: 46,
    justifyContent: "center",
    width: 46
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
  playerLayer: {
    overflow: "hidden",
    position: "absolute",
    zIndex: 40
  },
  playerFrame: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    height: 620
  },
  playerPlaceholder: {
    height: 620,
    width: "100%"
  },
  scoreName: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 21
  },
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  sectionHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  sectionHeadingText: {
    flex: 1
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "800"
  }
});
