import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { api, OfflineError, type Profile } from '@/lib/api';
import { flushQueue, readCachedLibrary, readCachedReviews, readQueue } from '@/lib/offline';
import { Badge, Body, Button, Card, EmptyState, Progress, Title } from '@/components/ui';
import { colors, spacing } from '@/lib/theme';

interface Dashboard {
  greeting: string;
  library: { totalDocuments: number; readyDocuments: number };
  memory: { totalCards: number; dueToday: number; reviewsLast7Days: number; successRateLast7Days: number | null };
  study: { focusMinutesLast7Days: number };
  subscription: { plan: { name: string } };
}

export default function DashboardScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [data, setData] = useState<Dashboard | null>(null);
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);
  const [cached, setCached] = useState<{ library: number | null; reviews: number | null }>({ library: null, reviews: null });
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [me, dashboard] = await Promise.all([api<Profile>('/auth/me'), api<Dashboard>('/dashboard')]);
      setProfile(me);
      setData(dashboard);
      setOffline(false);
      const flush = await flushQueue();
      setPending(flush.remaining);
    } catch (caught) {
      if (caught instanceof OfflineError) {
        setOffline(true);
        const [library, reviews, queue] = await Promise.all([readCachedLibrary(), readCachedReviews(), readQueue()]);
        setCached({ library: library?.items.length ?? null, reviews: reviews?.items.length ?? null });
        setPending(queue.length);
      } else {
        setError((caught as Error).message);
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
    >
      {offline ? (
        <View style={{ backgroundColor: '#fef3c7', borderRadius: 12, padding: 12, marginBottom: spacing.md }}>
          <Text style={{ color: '#92400e', fontWeight: '700', fontSize: 13 }}>Hors connexion</Text>
          <Text style={{ color: '#92400e', fontSize: 12, marginTop: 2 }}>
            Contenus téléchargés : {cached.library ?? 0} cours · {cached.reviews ?? 0} cartes de révision.
            {pending > 0 ? ` ${pending} réponse(s) en attente d'envoi.` : ''}
          </Text>
          <Text style={{ color: '#92400e', fontSize: 12, marginTop: 4 }}>
            La génération IA, l&apos;import et la correction d&apos;évaluation nécessitent Internet.
          </Text>
        </View>
      ) : null}

      {error ? (
        <View style={{ backgroundColor: '#fee2e2', borderRadius: 12, padding: 12, marginBottom: spacing.md }}>
          <Text style={{ color: '#991b1b', fontSize: 13 }}>{error}</Text>
        </View>
      ) : null}

      <Title size={26}>{data?.greeting ?? 'Bonjour'}{profile ? `, ${profile.displayName.split(' ')[0]}` : ''}</Title>
      <Body muted style={{ marginBottom: spacing.lg }}>
        {profile ? `Offre ${data?.subscription.plan.name ?? profile.planCode}` : 'Chargement de votre espace…'}
      </Body>

      <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
        <Card style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#5a6b8c', textTransform: 'uppercase' }}>Cours prêts</Text>
          <Text style={{ fontSize: 26, fontWeight: '900', color: '#0f172a' }}>{data?.library.readyDocuments ?? '—'}</Text>
          <Body muted style={{ fontSize: 12 }}>sur {data?.library.totalDocuments ?? '—'}</Body>
        </Card>
        <Card style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#5a6b8c', textTransform: 'uppercase' }}>À revoir</Text>
          <Text style={{ fontSize: 26, fontWeight: '900', color: data?.memory.dueToday ? '#b45309' : '#0f172a' }}>
            {data?.memory.dueToday ?? '—'}
          </Text>
          <Body muted style={{ fontSize: 12 }}>{data?.memory.totalCards ?? 0} cartes</Body>
        </Card>
      </View>

      <Card>
        <Title size={17}>Révisions du jour</Title>
        {data && data.memory.dueToday > 0 ? (
          <>
            <Body muted style={{ marginBottom: spacing.md }}>
              {data.memory.dueToday} carte(s) à consolider. Les révisions sont priorisées selon votre maîtrise réelle et vos
              échéances.
            </Body>
            <Button label="Commencer la révision" onPress={() => router.push('/revision')} />
          </>
        ) : (
          <Body muted>Aucune révision due pour le moment. Générez des cartes depuis un cours analysé.</Body>
        )}
      </Card>

      <Card>
        <Title size={17}>Progression (7 jours)</Title>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
          <Body muted style={{ fontSize: 12 }}>Taux de réussite</Body>
          <Body style={{ fontSize: 12, fontWeight: '700' }}>
            {data?.memory.successRateLast7Days === null || data?.memory.successRateLast7Days === undefined
              ? '—'
              : `${data.memory.successRateLast7Days}%`}
          </Body>
        </View>
        <Progress value={data?.memory.successRateLast7Days ?? 0} />
        <Body muted style={{ fontSize: 12, marginTop: spacing.md }}>
          {data?.memory.reviewsLast7Days ?? 0} révision(s) · {data?.study.focusMinutesLast7Days ?? 0} min de concentration
        </Body>
      </Card>

      <Card>
        <Title size={17}>Bibliothèque</Title>
        {data && data.library.totalDocuments === 0 ? (
          <EmptyState title="Aucun cours importé" description="Importez un PDF ou une photo depuis l’onglet Cours. L’import nécessite une connexion." />
        ) : (
          <Button label="Ouvrir mes cours" variant="secondary" onPress={() => router.push('/(tabs)/bibliotheque')} />
        )}
      </Card>

      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.sm }}>
        <Badge label="Web + Android synchronisés" tone="brand" />
        <Badge label="Rappel actif" tone="success" />
        {pending > 0 ? <Badge label={`${pending} en attente de sync`} tone="warning" /> : null}
      </View>
    </ScrollView>
  );
}
