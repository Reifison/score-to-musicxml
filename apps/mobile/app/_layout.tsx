import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useState } from "react";
import { Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import { AuthProvider, useAuth } from "../src/auth/AuthProvider";
import { StartupSplash } from "../src/components/StartupSplash";
import { colors } from "../src/theme/styles";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppStack />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function AppStack() {
  const { loading, user } = useAuth();
  const [opening, setOpening] = useState(true);
  const { width } = useWindowDimensions();
  const hasAndroidRail = Platform.OS === "android" && width >= 600 && Boolean(user);

  return (
    <View style={styles.root}>
      <View
        accessibilityElementsHidden={opening}
        importantForAccessibility={opening ? "no-hide-descendants" : "auto"}
        pointerEvents={opening ? "none" : "auto"}
        style={styles.root}
      >
        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: colors.surface, paddingLeft: hasAndroidRail ? 88 : 0 },
            headerBackTitle: "Voltar",
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.ink,
            headerTitleStyle: { fontWeight: "800" }
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="profile" options={{ title: "Perfil" }} />
          <Stack.Screen name="settings" options={{ title: "Configurações" }} />
          <Stack.Screen name="scores" options={{ title: "Partituras" }} />
          <Stack.Screen name="trash" options={{ title: "Lixeira" }} />
          <Stack.Screen name="users" options={{ title: "Usuários" }} />
          <Stack.Screen name="logs" options={{ title: "Logs" }} />
          <Stack.Screen name="score/[id]" options={{ title: "Detalhes" }} />
        </Stack>
      </View>
      {opening && <StartupSplash onFinish={() => setOpening(false)} ready={!loading} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface }
});
