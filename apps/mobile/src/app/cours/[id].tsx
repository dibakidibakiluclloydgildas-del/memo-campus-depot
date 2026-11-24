import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { api, OfflineError } from '@/lib/api';
import { downloadDocument, getOfflineDocument, hasOfflineDocument, removeOfflineDocument, type OfflineDocument } from '@/lib/offline';
import { Badge, Body, Button, Card, Progress, Title } from '@/components/ui';
import { spacing } from '@/lib/theme';

interface SummaryPayload {
  generalSummary?: string;
  objectives?: string[];
  keyNotions?: { term: string; definition: string; source?: { page?: number } }[];
  chapters?: { title: string; summary: string }[];
  uncertainties?: string[];
}

interface DocumentDetail {
  id: string;
  title: string;
  status: string;
  progress: number;
  pageCount: number | null;
  subject: { name: string } | null;
  chapters: { id: string; title: string }[];
}

export default function CourseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [mode, setMode] = useState<string>('demo');
  const [offline, setOffline] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const detail = await api<DocumentDetail>(`/documents/${id}`);
      setDocument(detail);
      const record = await api<{ payload: SummaryPayload; mode: string }>(`/documents/${id}/summary`).catch(() => null);
      setSummary(record?.payload ?? null);
      setMode(record?.mode ?? 'demo');
      setOffline(false);
      setDownloaded(await hasOfflineDocument(id));
    } catch (caught) {
      if (caught instanceof OfflineError) {
        const local: OfflineDocument | null = await getOfflineDocument(id);
        setOffline(true);
        if (local) {
          setSummary((local.summary as { payload?: SummaryPayload })?.payload ?? (local.summary as SummaryPayload));
          setMode('demo');
          setDownloaded(true);
        } else {
          setError("Ce cours n'est pas disponible hors connexion. Téléchargez-le d'abord lorsque vous êtes en ligne.");
        }
      } else {
        setError((caught as Error).message);
      }
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function download() {
    if (!id) return;
    setBusy(true);
    setMessage(null);
    try {
      const [detail, record, sheet] = await Promise.all([
        api<DocumentDetail>(`/documents/${id}`),
        api<{ payload: SummaryPayload; mode: string }>(`/documents/${id}/summary`).catch(() => null),
        api<unknown>(`/documents/${id}/revision-sheet`).catch(() => null),
      ]);
      await downloadDocument(id, {
        title: detail.title,
        summary: record ?? { payload: {}, mode: 'demo' },
        revisionSheet: sheet,
      });
      setDownloaded(true);
      setMessage('Cours téléchargé : résumé et fiche consultables hors connexion.');
    } catch {
      setMessage("Le téléchargement a échoué : une connexion est nécessaire pour récupérer les contenus.");
    } finally {
      setBusy(false);
    }
  }

  async function removeDownload() {
    if (!id) return;
    await removeOfflineDocument(id);
    setDownloaded(false);
    setMessage('Contenu local supprimé (aucune donnée du compte n’a été modifiée).');
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
      <Title size={22}>{document?.title ?? 'Cours'}</Title>
      <Body muted style={{ marginBottom: spacing.md }}>
        {document?.subject?.name ?? 'Sans matière'} · {document?.pageCount ?? '—'} pages
        {document ? ` · ${document.chapters.length} chapitre(s)` : ''}
      </Body>

      {offline ? <Badge label="Mode hors connexion" tone="warning" /> : null}
      {downloaded ? <Badge label="Téléchargé sur cet appareil" tone="success" /> : null}
      {document && document.status !== 'READY' && document.status !== 'PARTIAL' ? (
        <Card>
          <Body style={{ fontWeight: '700' }}>Analyse : {document.status}</Body>
          <Progress value={document.progress} />
          <Body muted style={{ fontSize: 12, marginTop: 6 }}>
            L&apos;analyse se poursuit côté serveur. Revenez dans quelques instants.
          </Body>
        </Card>
      ) : null}

      {error ? (
        <Card>
          <Body style={{ fontWeight: '700' }}>Information indisponible</Body>
          <Body muted style={{ fontSize: 13 }}>{error}</Body>
        </Card>
      ) : null}

      {summary ? (
        <>
          <Card>
            <Title size={16}>Résumé</Title>
            <Body style={{ fontSize: 14 }}>{summary.generalSummary ?? 'Résumé non généré pour ce cours.'}</Body>
            <Body muted style={{ fontSize: 11, marginTop: spacing.sm }}>
              {mode === 'demo'
                ? 'Contenu extractif issu de votre cours (mode démonstration, sans modèle distant).'
                : 'Contenu généré par IA à partir de votre cours : vérifiez toujours la source.'}
            </Body>
          </Card>

          {summary.objectives && summary.objectives.length > 0 ? (
            <Card>
              <Title size={16}>Objectifs</Title>
              {summary.objectives.map((objective) => (
                <Body key={objective} style={{ fontSize: 13, marginBottom: 4 }}>
                  • {objective}
                </Body>
              ))}
            </Card>
          ) : null}

          {summary.keyNotions && summary.keyNotions.length > 0 ? (
            <Card>
              <Title size={16}>Notions essentielles</Title>
              {summary.keyNotions.slice(0, 12).map((notion) => (
                <View key={notion.term} style={{ marginBottom: spacing.sm }}>
                  <Text style={{ fontWeight: '700', fontSize: 13, color: '#0f172a' }}>{notion.term}</Text>
                  <Body muted style={{ fontSize: 12 }}>
                    {notion.definition}
                    {notion.source?.page ? ` (p. ${notion.source.page})` : ''}
                  </Body>
                </View>
              ))}
            </Card>
          ) : null}

          {summary.uncertainties && summary.uncertainties.length > 0 ? (
            <Card>
              <Title size={15}>À vérifier sur le document</Title>
              {summary.uncertainties.map((item) => (
                <Body key={item} muted style={{ fontSize: 12 }}>
                  • {item}
                </Body>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}

      <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
        {!downloaded ? (
          <Button label={busy ? 'Téléchargement…' : 'Télécharger pour hors connexion'} onPress={download} loading={busy} />
        ) : (
          <Button label="Supprimer le téléchargement" variant="secondary" onPress={removeDownload} />
        )}
        <Body muted style={{ fontSize: 11 }}>
          La génération de nouveaux résumés, cartes ou évaluations nécessite Internet.
        </Body>
      </View>
      {message ? <Body style={{ fontSize: 12, marginTop: spacing.sm }}>{message}</Body> : null}
    </ScrollView>
  );
}
