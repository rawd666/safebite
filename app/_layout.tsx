import { OnboardingSplash } from '@/components/OnboardingSplash';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/useColorScheme';

const MyTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#4EA8DE',
    background: '#ffffff',
    card: '#FFFFFF', 
    text: '#000000', 
    border: '#E0E0E0',
    notification: '#4EA8DE',   
  },
};

export default function RootLayout() {

  const colorScheme = useColorScheme();

  const [loaded] = useFonts({
    titleFont: require("../assets/fonts/HankenGrotesk-ExtraBold.ttf"),
    subtitleFont: require("../assets/fonts/HankenGrotesk-Bold.ttf"),
    bodyFont: require("../assets/fonts/HankenGrotesk-Regular.ttf"),
    mediumFont: require("../assets/fonts/HankenGrotesk-SemiBold.ttf"),
  });

  if (!loaded) {
    return <OnboardingSplash />;
  }

  return (
    <ThemeProvider value={MyTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
