import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { api, OfflineError } from '@/lib/api';
import { Badge, Body, Card, EmptyState, Title } from '@/components/ui';
import { spacing } from '@/lib/theme';

interface Block {
  id: string;
  title: string;
  type: string;
  startAt: string;
  endAt: string;
  status: string;
  rationale: string | null;
  subject: { name: string } | null;
}

/**
 * Planning mobile : consultation et marquage d'une séance comme terminée.
 * La génération du planning se fait depuis le Web (calcul serveur identique) ;
 * l'application affiche ici exactement le même agenda, ce qui garantit la
 * cohérence des données entre les deux plateformes.
 */
export default function PlanningScreen() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const from = new Date().toISOString();
      const to = new Date(Date.now() + 14 * 86_400_000).toISOString();
      const data = await api<{ blocks: Block[] }>(`/planning?from=${from}&to=${to}`);
      setBlocks(data.blocks);
      setOffline(false);
    } catch (caught) {
      if (caught instanceof OfflineError) setOffline(true);
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
      <Title size={24}>Planning</Title>
      <Body muted style={{ marginBottom: spacing.lg }}>
        Vos séances des 14 prochains jours, avec la raison de chaque séance.
      </Body>

      {offline ? <Badge label="Plannings consultables uniquement en ligne" tone="warning" /> : null}

      {blocks.length === 0 ? (
        <EmptyState
          title="Aucune séance planifiée"
          description="Créez votre planning depuis l'application Web : il s'affichera ici automatiquement."
        />
      ) : (
        blocks.map((block) => {
          const start = new Date(block.startAt);
          return (
            <Card key={block.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#0f172a', flex: 1 }}>{block.title}</Text>
                <Badge label={block.status} tone={block.status === 'TERMINE' ? 'success' : 'neutral'} />
              </View>
              <Body muted style={{ fontSize: 12, marginTop: 4 }}>
                {start.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'short' })} ·{' '}
                {start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} ·{' '}
                {new Date(block.endAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                {block.subject ? ` · ${block.subject.name}` : ''}
              </Body>
              {block.rationale ? (
                <Body muted style={{ fontSize: 11, marginTop: 4, fontStyle: 'italic' }}>
                  {block.rationale}
                </Body>
              ) : null}
            </Card>
          );
        })
      )}
    </ScrollView>
  );
}
