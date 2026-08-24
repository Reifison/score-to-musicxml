import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Redirect, router } from "expo-router";
import type { ComponentProps } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../src/api/client";
import { useAuth } from "../src/auth/AuthProvider";
import { BottomNav, bottomNavHeight } from "../src/components/BottomNav";
import { BrandLockup } from "../src/components/BrandLockup";
import { colors, sharedStyles } from "../src/theme/styles";

type UploadFile = { uri: string; name: string; type: string };
type Tile = {
  color: string;
  iconColor?: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
};

export default function IndexScreen() {
  const { loading, token, user } = useAuth();
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: (file: UploadFile) => api.upload(token!, file),
    onSuccess: async ({ score }) => {
      await queryClient.invalidateQueries({ queryKey: ["scores"] });
      await queryClient.invalidateQueries({ queryKey: ["entitlement"] });
      router.push(`/score/${score.id}`);
    },
    onError: (error) => {
      Alert.alert("Nao foi possivel enviar", error instanceof Error ? error.message : "Tente novamente.");
    }
  });

  if (loading) {
    return (
      <View style={styles.loading}>
        <Image resizeMode="contain" source={require("../assets/splash.png")} style={styles.loadingImage} />
      </View>
    );
  }

  if (!user || !token) return <Redirect href="/login" />;

  const tiles: Tile[] = [
    { color: colors.primary, icon: "musical-notes-outline", label: "Minhas partituras", onPress: () => router.push("/scores") },
    { color: colors.accentCoral, icon: "heart-outline", label: "Favoritas", onPress: () => Alert.alert("Favoritas", "Esta área ainda será ligada às suas partituras favoritas.") },
    { color: colors.surfaceSoft, iconColor: colors.muted, icon: "trash-outline", label: "Lixeira", onPress: () => router.push("/trash") },
    { color: colors.accentGold, icon: "settings-outline", label: "Configurações", onPress: () => Alert.alert("Configurações", "As configurações do app ainda estão em preparação.") },
    { color: colors.accentBlue, icon: "person-outline", label: "Perfil", onPress: () => router.push("/profile") }
  ];

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      type: "application/pdf"
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    uploadMutation.mutate({
      uri: asset.uri,
      name: asset.name || "partitura.pdf",
      type: asset.mimeType || "application/pdf"
    });
  }

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    uploadMutation.mutate({
      uri: asset.uri,
      name: asset.fileName || "partitura.jpg",
      type: asset.mimeType || "image/jpeg"
    });
  }

  async function scanWithCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Camera indisponivel", "Autorize o uso da camera para fotografar partituras.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      cameraType: ImagePicker.CameraType.back,
      quality: 0.9
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    uploadMutation.mutate({
      uri: asset.uri,
      name: asset.fileName || "scan.jpg",
      type: asset.mimeType || "image/jpeg"
    });
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} style={styles.scroller}>
        <BrandLockup />
        <View style={styles.uploadPanel}>
          <Pressable disabled={uploadMutation.isPending} onPress={scanWithCamera} style={sharedStyles.button}>
            {uploadMutation.isPending ? <ActivityIndicator color={colors.onPrimary} /> : <Ionicons color={colors.onPrimary} name="camera-outline" size={22} />}
            <Text style={sharedStyles.buttonText}>{uploadMutation.isPending ? "Enviando..." : "Escanear partitura"}</Text>
          </Pressable>
          <View style={styles.uploadActions}>
            <Pressable disabled={uploadMutation.isPending} onPress={pickFile} style={[sharedStyles.button, sharedStyles.buttonSecondary, styles.uploadChoice]}>
              <Ionicons color={colors.ink} name="document-outline" size={22} />
              <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextSecondary, styles.choiceText]}>PDF</Text>
            </Pressable>
            <Pressable disabled={uploadMutation.isPending} onPress={pickPhoto} style={[sharedStyles.button, sharedStyles.buttonSecondary, styles.uploadChoice]}>
              <Ionicons color={colors.ink} name="image-outline" size={22} />
              <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextSecondary, styles.choiceText]}>Foto</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.tileGrid}>
          {tiles.map((tile) => (
            <Pressable key={tile.label} onPress={tile.onPress} style={styles.tile}>
              <View style={[styles.tileIcon, { backgroundColor: tile.color }]}>
                <Ionicons color={tile.iconColor ?? colors.onPrimary} name={tile.icon} size={34} />
              </View>
              <Text style={styles.tileText}>{tile.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <BottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  choiceText: {
    fontSize: 18
  },
  content: {
    flexGrow: 1,
    gap: 28,
    padding: 20,
    paddingBottom: bottomNavHeight + 40,
    paddingTop: 28
  },
  loading: {
    alignItems: "center",
    backgroundColor: colors.surface,
    flex: 1,
    justifyContent: "center"
  },
  loadingImage: {
    height: "100%",
    width: "100%"
  },
  screen: {
    backgroundColor: colors.surface,
    flex: 1
  },
  scroller: {
    backgroundColor: colors.surface,
    flex: 1
  },
  tile: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 20,
    borderWidth: 1,
    flexBasis: "47%",
    gap: 18,
    justifyContent: "center",
    minHeight: 144,
    padding: 16,
    shadowColor: "#4c2e22",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.06,
    shadowRadius: 24
  },
  tileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    justifyContent: "space-between"
  },
  tileIcon: {
    alignItems: "center",
    borderRadius: 18,
    height: 72,
    justifyContent: "center",
    shadowColor: "#4c2e22",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    width: 72
  },
  tileText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800"
  },
  uploadActions: {
    flexDirection: "row",
    gap: 10
  },
  uploadChoice: {
    flex: 1,
    minHeight: 58
  },
  uploadPanel: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    gap: 14,
    padding: 18,
    shadowColor: "#4c2e22",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.05,
    shadowRadius: 18
  }
});
