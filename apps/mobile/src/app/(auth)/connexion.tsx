import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, OfflineError } from '@/lib/api';
import { Body, Button, Card, Field, Title } from '@/components/ui';
import { colors, spacing } from '@/lib/theme';

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      await auth.login(email.trim().toLowerCase(), password);
      router.replace('/(tabs)/tableau-de-bord');
    } catch (caught) {
      if (caught instanceof OfflineError) {
        setError("Connexion à Internet requise pour la première connexion. Vos contenus déjà téléchargés restent accessibles hors ligne ensuite.");
      } else {
        setError((caught as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.memo600 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: insets.top + 48, paddingBottom: insets.bottom + 32 }}>
        <Text style={{ color: '#dbe7ff', fontSize: 12, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase' }}>
          Plateforme EdTech
        </Text>
        <Text style={{ color: '#ffffff', fontSize: 32, fontWeight: '900', letterSpacing: -0.8, marginTop: 6 }}>
          MÉMO CAMPUS
        </Text>
        <Text style={{ color: '#dbe7ff', fontSize: 15, marginTop: 8, marginBottom: spacing.xl, lineHeight: 22 }}>
          Comprendre, mémoriser, réussir. Vos cours, vos fiches et votre planning, sur mobile comme sur le Web.
        </Text>

        <Card style={{ padding: spacing.xl }}>
          <Title>Connexion</Title>
          <Body muted style={{ marginBottom: spacing.lg }}>
            Mêmes comptes que sur le Web.
          </Body>

          <Field label="Adresse e-mail" value={email} onChangeText={setEmail} placeholder="prenom.nom@exemple.cm" keyboardType="email-address" />
          <Field label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••••" />

          {error ? (
            <View style={{ backgroundColor: '#fee2e2', borderRadius: 12, padding: 12, marginBottom: spacing.md }}>
              <Text style={{ color: '#991b1b', fontSize: 13 }}>{error}</Text>
            </View>
          ) : null}

          <Button label={loading ? 'Connexion…' : 'Se connecter'} onPress={submit} loading={loading} disabled={!email || !password} />

          <View style={{ marginTop: spacing.lg }}>
            <Button label="Créer un compte" variant="secondary" onPress={() => router.push('/(auth)/inscription')} />
          </View>

          <View style={{ marginTop: spacing.lg, backgroundColor: '#f6f8fc', borderRadius: 12, padding: 12 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#5a6b8c', textTransform: 'uppercase' }}>
              Démonstration
            </Text>
            <Body muted style={{ fontSize: 12, marginTop: 4 }}>
              etudiant@demo.memo-campus.cm{'\n'}MemoCampus2026!
            </Body>
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
