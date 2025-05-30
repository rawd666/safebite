import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" redirect={true} />
      <Stack.Screen name="auth/login" />
      <Stack.Screen name="auth/signup" />
      <Stack.Screen name="auth/reset-password" />
      <Stack.Screen name="auth/verify-otp" />
      <Stack.Screen name="auth/set-new-password" />
      <Stack.Screen name="(tabs)" />
       <Stack.Screen name="tracking/history" />

      <Stack.Screen name="+not-found" />
    </Stack>
  );
}
