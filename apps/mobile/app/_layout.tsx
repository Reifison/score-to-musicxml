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
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.ink,
            headerTitleStyle: { fontWeight: "800" }
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="profile" options={{ title: "Perfil" }} />
          <Stack.Screen name="scores" options={{ title: "Partituras" }} />
          <Stack.Screen name="trash" options={{ title: "Lixeira" }} />
          <Stack.Screen name="users" options={{ title: "Usuarios" }} />
          <Stack.Screen name="logs" options={{ title: "Logs" }} />
          <Stack.Screen name="score/[id]" options={{ title: "Detalhes" }} />
        </Stack>
      </AuthProvider>
    </QueryClientProvider>
  );
}
