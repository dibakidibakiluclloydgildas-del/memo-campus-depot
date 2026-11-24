import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { api, OfflineError, type ReviewItem } from '@/lib/api';
import { cacheReviews, readCachedReviews, readQueue } from '@/lib/offline';
import { Badge, Body, Button, Card, EmptyState, Title } from '@/components/ui';
import { spacing } from '@/lib/theme';

export default function ReviewsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [totalDue, setTotalDue] = useState(0);
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await api<{ totalDue: number; items: ReviewItem[] }>('/learning/reviews/today');
      setItems(data.items);
      setTotalDue(data.totalDue);
      await cacheReviews(data.items);
      setOffline(false);
    } catch (caught) {
      if (caught instanceof OfflineError) {
        setOffline(true);
        const cached = await readCachedReviews();
        setItems(cached?.items ?? []);
        setTotalDue(cached?.items.length ?? 0);
      }
    } finally {
      setPending((await readQueue()).length);
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
      <Title size={24}>Révisions</Title>
      <Body muted style={{ marginBottom: spacing.lg }}>
        Rappel actif et répétition espacée. Vous pouvez réviser hors connexion : vos réponses partiront à la reconnexion.
      </Body>

      {offline ? <Badge label="Hors connexion — révisions enregistrées localement" tone="warning" /> : null}
      {pending > 0 ? <Badge label={`${pending} réponse(s) à synchroniser`} tone="brand" /> : null}

      <View style={{ height: spacing.md }} />

      <Card>
        <Title size={17}>File du jour</Title>
        <Body muted style={{ marginBottom: spacing.md }}>
          {totalDue} carte(s) due(s){items.length > 0 ? ` · ${items.length} proposée(s) maintenant` : ''}.
        </Body>
        {items.length === 0 ? (
          <EmptyState title="Rien à réviser" description="Vos cartes sont à jour. Revenez plus tard ou générez de nouvelles cartes depuis le Web." />
        ) : (
          <Button label="Démarrer la session" onPress={() => router.push('/revision')} />
        )}
      </Card>

      {items.slice(0, 5).map((item) => (
        <Card key={item.id}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a' }}>{item.question}</Text>
          <Body muted style={{ fontSize: 12, marginTop: 4 }}>
            {item.subject?.name ?? 'Sans matière'} · maîtrise {item.masteryScore}/100
          </Body>
          <Body muted style={{ fontSize: 11, marginTop: 6, fontStyle: 'italic' }}>
            {item.why}
          </Body>
        </Card>
      ))}

      <View style={{ height: spacing.md }} />
      <Card>
        <Title size={15}>Fonctionnalités nécessitant Internet</Title>
        <Body muted style={{ fontSize: 12 }}>
          • Génération de résumés, cartes et évaluations (IA distante){'\n'}
          • Import et analyse de documents{'\n'}
          • Correction d&apos;évaluation et assistant{'\n'}
          {'\n'}Aucune de ces fonctions ne prétend fonctionner hors connexion.
        </Body>
      </Card>
    </ScrollView>
  );
}
