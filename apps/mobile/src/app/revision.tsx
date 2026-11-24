import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { api, OfflineError, type ReviewItem } from '@/lib/api';
import { cacheReviews, queueReview, readCachedReviews } from '@/lib/offline';
import { Badge, Body, Button, Card, EmptyState, Title } from '@/components/ui';
import { colors, spacing } from '@/lib/theme';

const GRADES = [
  { key: 'AGAIN', label: 'Oublié', hint: 'Revoir très tôt', tone: colors.danger },
  { key: 'HARD', label: 'Difficile', hint: 'Intervalle réduit', tone: colors.warn },
  { key: 'GOOD', label: 'Bien', hint: 'Intervalle normal', tone: colors.memo500 },
  { key: 'EASY', label: 'Facile', hint: 'Intervalle allongé', tone: colors.progress },
] as const;

/**
 * Session de rappel actif sur mobile.
 * Hors connexion, la réponse est enregistrée localement puis envoyée à la
 * reconnexion : l'étudiant n'est jamais bloqué, et aucune donnée n'est perdue.
 */
export default function ReviewScreen() {
  const router = useRouter();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [done, setDone] = useState(0);
  const [queued, setQueued] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ items: ReviewItem[] }>('/learning/reviews/today');
      setItems(data.items);
      await cacheReviews(data.items);
    } catch (caught) {
      if (caught instanceof OfflineError) {
        const cached = await readCachedReviews();
        setItems(cached?.items ?? []);
      }
    }
    setStartedAt(Date.now());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const current = items[index];

  if (!current) {
    return (
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <Title size={22}>Session terminée</Title>
        <Body muted style={{ marginBottom: spacing.lg }}>
          {done} carte(s) revue(s). {queued > 0 ? `${queued} réponse(s) seront envoyées à la reconnexion.` : ''}
        </Body>
        <EmptyState title="Bravo" description="Les prochaines révisions sont programmées selon vos résultats réels." />
        <View style={{ height: spacing.md }} />
        <Button label="Retour" onPress={() => router.back()} />
      </ScrollView>
    );
  }

  async function grade(value: (typeof GRADES)[number]['key']) {
    if (!current) return;
    const durationMs = Date.now() - startedAt;
    try {
      await api('/learning/reviews', {
        method: 'POST',
        body: JSON.stringify({ flashcardId: current.id, grade: value, durationMs }),
      });
    } catch (caught) {
      if (caught instanceof OfflineError) {
        await queueReview({ flashcardId: current.id, grade: value, durationMs });
        setQueued((count) => count + 1);
      } else {
        setError((caught as Error).message);
        return;
      }
    }
    setError(null);
    setDone((count) => count + 1);
    setIndex((currentIndex) => currentIndex + 1);
    setRevealed(false);
    setStartedAt(Date.now());
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm }}>
        <Body muted style={{ fontSize: 12 }}>
          Carte {index + 1} / {items.length}
        </Body>
        <Body muted style={{ fontSize: 12 }}>Maîtrise {current.masteryScore}/100</Body>
      </View>

      <Card style={{ padding: spacing.xl }}>
        {current.subject ? <Badge label={current.subject.name} tone="brand" /> : null}
        <Text style={{ fontSize: 18, fontWeight: '800', color: '#0f172a', marginTop: spacing.sm }}>{current.question}</Text>

        {!revealed ? (
          <>
            <Body muted style={{ marginTop: spacing.sm }}>
              Restituez la réponse sans regarder votre cours, puis vérifiez.
            </Body>
            <View style={{ height: spacing.md }} />
            <Button label="Afficher la réponse" onPress={() => setRevealed(true)} />
          </>
        ) : (
          <>
            <View style={{ backgroundColor: '#f6f8fc', borderRadius: 12, padding: spacing.md, marginTop: spacing.md }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#5a6b8c', textTransform: 'uppercase' }}>
                Réponse attendue
              </Text>
              <Body style={{ marginTop: 6 }}>{current.answer}</Body>
            </View>

            <Text style={{ fontWeight: '700', marginTop: spacing.lg, marginBottom: spacing.sm }}>
              Comment cela s&apos;est-il passé ?
            </Text>
            <View style={{ gap: spacing.sm }}>
              {GRADES.map((option) => (
                <Button
                  key={option.key}
                  label={`${option.label} — ${option.hint}`}
                  onPress={() => grade(option.key)}
                  variant={option.key === 'AGAIN' ? 'secondary' : 'primary'}
                />
              ))}
            </View>
          </>
        )}

        {error ? (
          <Body style={{ color: '#b91c1c', fontSize: 12, marginTop: spacing.sm }}>{error}</Body>
        ) : null}
      </Card>

      <Body muted style={{ fontSize: 11, fontStyle: 'italic' }}>
        <Text style={{ fontWeight: '700' }}>Pourquoi cette carte ? </Text>
        {current.why}
      </Body>
      {queued > 0 ? <Badge label={`${queued} réponse(s) en attente de synchronisation`} tone="warning" /> : null}
    </ScrollView>
  );
}
