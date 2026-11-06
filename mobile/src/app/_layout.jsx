import { Stack, ThemeProvider, DarkTheme, DefaultTheme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { DataProvider } from '../lib/data';
import { useColors } from '../lib/theme';

export default function RootLayout() {
  const c = useColors();
  const base = c.dark ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, primary: c.primary, background: c.bg, card: c.card, text: c.text, border: c.border },
  };
  return (
    <ThemeProvider value={theme}>
      <DataProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerBackTitle: 'Retour' }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="route/[id]" options={{ title: 'Ligne' }} />
          <Stack.Screen name="station/[id]" options={{ title: 'Arrêt' }} />
        </Stack>
      </DataProvider>
    </ThemeProvider>
  );
}
