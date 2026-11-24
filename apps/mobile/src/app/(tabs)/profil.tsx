import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { api, auth, OfflineError, type Profile } from '@/lib/api';
import { listOfflineDocuments, readQueue, removeOfflineDocument } from '@/lib/offline';
import { cancelDailyReminder, scheduleDailyReminder } from '@/lib/notifications';
import { Badge, Body, Button, Card, Title } from '@/components/ui';
import { spacing } from '@/lib/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [offlineCount, setOfflineCount] = useState(0);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setProfile(await api<Profile>('/auth/me'));
      setError(null);
    } catch (caught) {
      if (caught instanceof OfflineError) setError('Hors connexion : profil affiché depuis la dernière session.');
      else setError((caught as Error).message);
    }
    const [docs, queue] = await Promise.all([listOfflineDocuments(), readQueue()]);
    setOfflineCount(docs.length);
    setPending(queue.length);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function logout() {
    await auth.logout();
    router.replace('/(auth)/connexion');
  }

  async function clearOffline() {
    const docs = await listOfflineDocuments();
    for (const doc of docs) await removeOfflineDocument(doc.id);
    await load();
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
      <Title size={24}>Mon profil</Title>
      <Body muted style={{ marginBottom: spacing.lg }}>
        Même compte que sur le Web : les données sont strictement identiques.
      </Body>

      {error ? <Badge label={error} tone="warning" /> : null}

      <Card>
        <Text style={{ fontSize: 17, fontWeight: '800', color: '#0f172a' }}>{profile?.displayName ?? '—'}</Text>
        <Body muted style={{ fontSize: 13 }}>{profile?.email ?? '—'}</Body>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: spacing.md, flexWrap: 'wrap' }}>
          <Badge label={profile?.planCode ?? '—'} tone="brand" />
          <Badge label={profile?.level ?? 'Niveau non renseigné'} tone="neutral" />
          {profile?.institution ? <Badge label={profile.institution} tone="neutral" /> : null}
        </View>
      </Card>

      <Card>
        <Title size={16}>Stockage hors connexion</Title>
        <Body muted style={{ fontSize: 13, marginBottom: spacing.md }}>
          {offlineCount} cours téléchargé(s) · {pending} réponse(s) en attente de synchronisation.
        </Body>
        {offlineCount > 0 ? <Button label="Vider le stockage local" variant="secondary" onPress={clearOffline} /> : null}
        <Body muted style={{ fontSize: 11, marginTop: spacing.sm }}>
          Vider le stockage ne supprime aucune donnée de votre compte : cela libère uniquement l&apos;espace du téléphone.
        </Body>
      </Card>

      <Card>
        <Title size={16}>Rappels de révision</Title>
        <Body muted style={{ fontSize: 13, marginBottom: spacing.md }}>
          Un rappel local chaque jour à 18 h. Il fonctionne sans connexion et n&apos;envoie aucune donnée à un serveur.
        </Body>
        <View style={{ gap: spacing.sm }}>
          <Button
            label="Activer le rappel quotidien"
            variant="secondary"
            onPress={async () => {
              const ok = await scheduleDailyReminder(18, 0);
              setError(ok ? 'Rappel programmé chaque jour à 18 h.' : "Notifications refusées par le système : aucun rappel n'a été programmé.");
            }}
          />
          <Button
            label="Désactiver les rappels"
            variant="secondary"
            onPress={async () => {
              await cancelDailyReminder();
              setError('Rappels désactivés.');
            }}
          />
        </View>
      </Card>

      <Card>
        <Title size={16}>Sécurité</Title>
        <Body muted style={{ fontSize: 13 }}>
          Votre session est stockée dans le Keystore sécurisé Android. Un changement de mot de passe depuis le Web
          déconnecte immédiatement cet appareil.
        </Body>
      </Card>

      <Button label="Se déconnecter" variant="danger" onPress={logout} />
      <View style={{ height: spacing.sm }} />
      <Body muted style={{ fontSize: 11, textAlign: 'center' }}>
        MÉMO CAMPUS 0.1.0 · Web et Android partagent le même backend, les mêmes comptes et les mêmes données.
      </Body>
    </ScrollView>
  );
}
