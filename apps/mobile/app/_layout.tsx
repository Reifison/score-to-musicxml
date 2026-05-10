import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";
import { AuthProvider } from "../src/auth/AuthProvider";

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Stack screenOptions={{ headerBackTitle: "Voltar" }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ title: "Entrar" }} />
          <Stack.Screen name="scores" options={{ title: "Partituras" }} />
          <Stack.Screen name="score/[id]" options={{ title: "Detalhes" }} />
        </Stack>
      </AuthProvider>
    </QueryClientProvider>
  );
}
