import React, { useCallback, useEffect, useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { api, ApiError, OfflineError } from '@/lib/api';
import { enqueueUpload, readUploadQueue, removeUpload, type PendingUpload } from '@/lib/offline';
import { Badge, Body, Button, Card, Title } from '@/components/ui';
import { spacing } from '@/lib/theme';

/**
 * Import de cours depuis le téléphone.
 *
 * - PDF / photos / Word : sélection depuis les fichiers ou l'appareil photo ;
 * - hors connexion, le fichier est **mis en file localement** puis envoyé au
 *   retour du réseau (aucune perte, aucune fausse confirmation : l'écran dit
 *   clairement que l'envoi est en attente) ;
 * - l'analyse est asynchrone côté serveur : on affiche le vrai statut.
 */
export default function ImportScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);

  const refresh = useCallback(async () => {
    setPendingUploads(await readUploadQueue());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function send(uri: string, name: string, mimeType: string, base64?: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const form = new FormData();
      // React Native accepte l'objet { uri, name, type } pour joindre un fichier.
      form.append('file', { uri, name, type: mimeType } as unknown as Blob);
      form.append('title', name.replace(/\.[a-z0-9]+$/i, '').slice(0, 120));
      form.append('language', 'fr');

      const created = await api<{ id: string; status: string; message: string }>('/documents', {
        method: 'POST',
        body: form,
      });
      setMessage(created.message ?? 'Cours reçu. L’analyse démarre.');
      router.push(`/cours/${created.id}`);
    } catch (caught) {
      if (caught instanceof OfflineError) {
        await enqueueUpload({ name, uri, mimeType, base64 });
        await refresh();
        setMessage(
          "Vous êtes hors connexion : ce cours est enregistré sur le téléphone et sera envoyé automatiquement dès le retour du réseau.",
        );
      } else if (caught instanceof ApiError) {
        setError(caught.message);
      } else {
        setError((caught as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function pickDocument() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/png', 'image/jpeg', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    await send(asset.uri, asset.name, asset.mimeType ?? 'application/pdf');
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("L'accès à l'appareil photo est nécessaire pour photographier un cours. Vous pouvez aussi choisir une image déjà enregistrée.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.85, allowsEditing: false });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    await send(asset.uri, `Photo de cours ${new Date().toISOString().slice(0, 10)}.png`, 'image/png');
  }

  async function sendPending(upload: PendingUpload) {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', { uri: upload.uri, name: upload.name, type: upload.mimeType } as unknown as Blob);
      form.append('title', upload.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 120));
      await api('/documents', { method: 'POST', body: form });
      await removeUpload(upload.localId);
      await refresh();
      setMessage('Cours envoyé. Son analyse est en cours.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Envoi impossible pour le moment.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
      <Title size={24}>Importer un cours</Title>
      <Body muted style={{ marginBottom: spacing.lg }}>
        Formats acceptés : PDF (y compris numérisé), photo JPG/PNG, document Word (.docx). Taille maximale 25 Mo.
      </Body>

      {error ? (
        <View style={{ backgroundColor: '#fee2e2', borderRadius: 12, padding: 12, marginBottom: spacing.md }}>
          <Text style={{ color: '#991b1b', fontSize: 13 }}>{error}</Text>
        </View>
      ) : null}
      {message ? (
        <View style={{ backgroundColor: '#dcfce7', borderRadius: 12, padding: 12, marginBottom: spacing.md }}>
          <Text style={{ color: '#065f46', fontSize: 13 }}>{message}</Text>
        </View>
      ) : null}

      <Card>
        <Title size={17}>Choisir un fichier</Title>
        <Body muted style={{ fontSize: 13, marginBottom: spacing.md }}>
          Sélectionnez un PDF ou un document Word déjà enregistré sur votre téléphone.
        </Body>
        <Button label={busy ? 'Envoi en cours…' : 'Parcourir mes fichiers'} onPress={pickDocument} loading={busy} />
      </Card>

      <Card>
        <Title size={17}>Photographier un cours</Title>
        <Body muted style={{ fontSize: 13, marginBottom: spacing.md }}>
          Photographiez la page d&apos;un polycopié ou un tableau. Le texte est reconnu automatiquement (OCR) ; les
          passages illisibles sont signalés et jamais inventés.
        </Body>
        <Button label="Utiliser l’appareil photo" variant="secondary" onPress={takePhoto} disabled={busy} />
      </Card>

      <Card>
        <Title size={17}>Attention</Title>
        <Body muted style={{ fontSize: 12 }}>
          L&apos;import et l&apos;analyse nécessitent Internet. Sans connexion, le fichier est conservé sur le téléphone
          et envoyé plus tard : l&apos;écran vous l&apos;indique explicitement, sans fausse confirmation.
        </Body>
      </Card>

      {pendingUploads.length > 0 ? (
        <Card>
          <Title size={17}>En attente d’envoi ({pendingUploads.length})</Title>
          {pendingUploads.map((upload) => (
            <View key={upload.localId} style={{ marginBottom: spacing.md }}>
              <Text style={{ fontWeight: '700', fontSize: 13, color: '#0f172a' }}>{upload.name}</Text>
              <Body muted style={{ fontSize: 11 }}>
                Enregistré le {new Date(upload.createdAt).toLocaleString('fr-FR')}
              </Body>
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: 6 }}>
                <Badge label="En attente de réseau" tone="warning" />
              </View>
              <View style={{ marginTop: 6 }}>
                <Button label="Réessayer l’envoi" variant="secondary" onPress={() => sendPending(upload)} disabled={busy} />
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      <Body muted style={{ fontSize: 11 }}>
        {Platform.OS === 'android'
          ? 'Application Android native : les fichiers restent sur votre appareil tant que vous ne lancez pas l’envoi.'
          : 'Version de développement : le comportement est identique à celui de l’application Android.'}
      </Body>
    </ScrollView>
  );
}
