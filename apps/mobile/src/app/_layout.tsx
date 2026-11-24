import React, { useCallback, useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { getToken } from '@/lib/api';
import { flushQueue } from '@/lib/offline';
import { ensureAndroidChannel, scheduleDailyReminder } from '@/lib/notifications';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

/**
 * Racine de l'application.
 * - restaure la session depuis le Keystore sécurisé ;
 * - synchronise les actions effectuées hors connexion au démarrage ;
 * - protège les écrans privés (redirection vers /connexion sans session).
 */
export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    (async () => {
      const token = await getToken();
      setAuthenticated(Boolean(token));
      if (token) {
        // Synchronisation silencieuse : les révisions hors connexion partent ici.
        await flushQueue().catch(() => undefined);
        // Rappels locaux : programmés sur l'appareil, ils fonctionnent même
        // sans connexion et ne transmettent aucune donnée à un serveur.
        await ensureAndroidChannel().catch(() => undefined);
        await scheduleDailyReminder().catch(() => undefined);
      }
      setReady(true);
      await SplashScreen.hideAsync().catch(() => undefined);
    })();
  }, []);

  const redirect = useCallback(() => {
    if (!ready) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!authenticated && !inAuthGroup) router.replace('/(auth)/connexion');
    if (authenticated && inAuthGroup) router.replace('/(tabs)/tableau-de-bord');
  }, [ready, authenticated, segments, router]);

  useEffect(() => {
    redirect();
  }, [redirect]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: '#2145ea' }, headerTintColor: '#ffffff', headerTitleStyle: { fontWeight: '700' } }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="cours/[id]" options={{ title: 'Cours' }} />
        <Stack.Screen name="revision" options={{ title: 'Révision' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
