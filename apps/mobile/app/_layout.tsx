import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";
import { AuthProvider } from "../src/auth/AuthProvider";
import { colors } from "../src/theme/styles";

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Stack
          screenOptions={{
            headerBackTitle: "Voltar",
            headerStyle: { backgroundColor: colors.background },
            headerShadowVisible: false,
            headerTintColor: colors.text,
            headerTitleStyle: { color: colors.text, fontWeight: "700" },
            contentStyle: { backgroundColor: colors.background }
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ title: "Entrar" }} />
          <Stack.Screen name="profile" options={{ title: "Perfil" }} />
          <Stack.Screen name="scores" options={{ title: "Partituras" }} />
          <Stack.Screen name="score/[id]" options={{ title: "Processando" }} />
          <Stack.Screen name="score-view/[id]" options={{ title: "Partitura" }} />
        </Stack>
      </AuthProvider>
    </QueryClientProvider>
  );
}
