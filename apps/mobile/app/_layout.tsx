import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { AuthProvider, useAuth } from "../src/auth/AuthProvider";
import { StartupSplash } from "../src/components/StartupSplash";
import { FeatureOnboarding } from "../src/onboarding/FeatureOnboarding";
import { OnboardingProvider, useOnboarding } from "../src/onboarding/OnboardingProvider";
import { LanguageProvider, useTranslation } from "../src/i18n";
import { colors } from "../src/theme/styles";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <AuthProvider>
          <OnboardingProvider>
            <AppStack />
          </OnboardingProvider>
        </AuthProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

function AppStack() {
  const { loading } = useAuth();
  const { isReady: languageReady } = useTranslation();
  const onboarding = useOnboarding();
  const [opening, setOpening] = useState(true);
  const contentHidden = opening || onboarding.visible;

  return (
    <View style={styles.root}>
      <View
        accessibilityElementsHidden={contentHidden}
        importantForAccessibility={contentHidden ? "no-hide-descendants" : "auto"}
        pointerEvents={contentHidden ? "none" : "auto"}
        style={styles.root}
      >
        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: colors.surface },
            headerShown: false,
            gestureEnabled: true,
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
          <Stack.Screen name="score/[id]" options={{ headerShown: false, contentStyle: { backgroundColor: colors.surface, paddingLeft: 0, paddingRight: 0 } }} />
        </Stack>
      </View>
      {!opening && onboarding.visible ? (
        <View accessibilityViewIsModal style={styles.onboarding}>
          <FeatureOnboarding onFinish={onboarding.finish} />
        </View>
      ) : null}
      {opening && <StartupSplash onFinish={() => setOpening(false)} ready={!loading && languageReady && onboarding.isReady} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  onboarding: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.surface }
});
