import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";
import { AuthProvider } from "../src/auth/AuthProvider";

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Stack
          screenOptions={{
            headerBackTitle: "Voltar",
            headerShadowVisible: false,
            headerStyle: { backgroundColor: "#f4f7fb" },
            headerTintColor: "#2f2a38",
            headerTitleStyle: { fontWeight: "800" }
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="profile" options={{ title: "Perfil" }} />
          <Stack.Screen name="scores" options={{ title: "Partituras" }} />
          <Stack.Screen name="users" options={{ title: "Usuarios" }} />
          <Stack.Screen name="logs" options={{ title: "Logs" }} />
          <Stack.Screen name="score/[id]" options={{ title: "Detalhes" }} />
        </Stack>
      </AuthProvider>
    </QueryClientProvider>
  );
}
