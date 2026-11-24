import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { api, OfflineError, type DocumentSummaryItem } from '@/lib/api';
import { cacheLibrary, listOfflineDocuments, readCachedLibrary, type OfflineDocument } from '@/lib/offline';
import { Badge, Body, Button, Card, Title } from '@/components/ui';
import { spacing } from '@/lib/theme';

const STATUS_LABELS: Record<string, { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'brand' }> = {
  READY: { label: 'Prêt', tone: 'success' },
  PARTIAL: { label: 'Partiel', tone: 'warning' },
  FAILED: { label: 'Échec', tone: 'danger' },
  QUEUED: { label: 'En file', tone: 'brand' },
  EXTRACTING: { label: 'Extraction', tone: 'brand' },
  OCR: { label: 'OCR', tone: 'brand' },
  STRUCTURING: { label: 'Structure', tone: 'brand' },
  CHUNKING: { label: 'Découpage', tone: 'brand' },
  INDEXING: { label: 'Indexation', tone: 'brand' },
};

export default function LibraryScreen() {
  const router = useRouter();
  const [items, setItems] = useState<DocumentSummaryItem[]>([]);
  const [offlineDocs, setOfflineDocs] = useState<OfflineDocument[]>([]);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await api<{ items: DocumentSummaryItem[] }>('/documents?pageSize=50');
      setItems(data.items);
      await cacheLibrary(data.items);
      setOffline(false);
    } catch (caught) {
      if (caught instanceof OfflineError) {
        setOffline(true);
        const cached = await readCachedLibrary();
        setItems(cached?.items ?? []);
      }
    } finally {
      const local = await listOfflineDocuments();
      setOfflineDocs(local);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <FlatList
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
      data={items}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={{ marginBottom: spacing.md }}>
          <Title size={24}>Mes cours</Title>
          <Body muted>
            {offline
              ? 'Hors connexion : liste mise en cache. Ouvrez un cours téléchargé pour lire son résumé et ses fiches.'
              : 'Touchez un cours pour ouvrir son résumé. Téléchargez-le pour le consulter hors connexion.'}
          </Body>
          {offlineDocs.length > 0 ? (
            <View style={{ marginTop: spacing.md }}>
              <Badge label={`${offlineDocs.length} cours disponible(s) hors connexion`} tone="success" />
            </View>
          ) : null}
          <View style={{ marginTop: spacing.md }}>
            <Text style={{ fontSize: 11, color: '#5a6b8c', fontWeight: '700', textTransform: 'uppercase' }}>
              Import de document
            </Text>
            <Body muted style={{ fontSize: 12 }}>
              L&apos;import et l&apos;analyse nécessitent une connexion Internet.
            </Body>
          </View>
        </View>
      }
      ListEmptyComponent={
        <Card>
          <Body muted>
            Aucun cours disponible. Importez un cours depuis le Web : il apparaîtra ici après synchronisation.
          </Body>
        </Card>
      }
      renderItem={({ item }) => {
        const status = STATUS_LABELS[item.status] ?? { label: item.status, tone: 'neutral' as const };
        const downloaded = offlineDocs.some((doc) => doc.id === item.id);
        return (
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#0f172a', flex: 1 }}>{item.title}</Text>
              <Badge label={status.label} tone={status.tone} />
            </View>
            <Body muted style={{ fontSize: 12, marginTop: 4 }}>
              {item.subject?.name ?? 'Sans matière'} · {item.pageCount ?? '—'} pages · {item._count.chapters} chapitre(s)
              {downloaded ? ' · disponible hors connexion' : ''}
            </Body>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Button label="Ouvrir" onPress={() => router.push(`/cours/${item.id}`)} />
              </View>
            </View>
          </Card>
        );
      }}
    />
  );
}
