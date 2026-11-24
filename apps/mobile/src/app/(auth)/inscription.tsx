import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { auth } from '@/lib/api';
import { Body, Button, Card, Field, Title } from '@/components/ui';
import { colors, spacing } from '@/lib/theme';

export default function RegisterScreen() {
  const router = useRouter();
  const [form, setForm] = useState({ displayName: '', email: '', password: '', institution: '', level: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const passwordOk =
    form.password.length >= 10 && /[A-Z]/.test(form.password) && /[a-z]/.test(form.password) && /[0-9]/.test(form.password);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      await auth.register({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        displayName: form.displayName.trim(),
        institution: form.institution || undefined,
        level: form.level || undefined,
        acceptTerms: true,
      });
      router.replace('/(tabs)/tableau-de-bord');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.memo600 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: 56, paddingBottom: 40 }}>
        <Text style={{ color: '#ffffff', fontSize: 26, fontWeight: '900', marginBottom: spacing.lg }}>Créer un compte</Text>

        <Card style={{ padding: spacing.xl }}>
          <Title size={18}>Vos informations</Title>
          <Body muted style={{ marginBottom: spacing.lg }}>
            Gratuit, sans carte bancaire. Vos documents restent privés.
          </Body>

          <Field label="Nom d’affichage" value={form.displayName} onChangeText={(v) => setForm({ ...form, displayName: v })} autoCapitalize="sentences" />
          <Field label="Adresse e-mail" value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} keyboardType="email-address" />
          <Field label="Mot de passe" value={form.password} onChangeText={(v) => setForm({ ...form, password: v })} secureTextEntry />
          <Text style={{ fontSize: 11, color: passwordOk ? '#047857' : '#b45309', marginBottom: spacing.md }}>
            {passwordOk ? '✓ Mot de passe conforme' : '10 caractères minimum, une majuscule, une minuscule et un chiffre'}
          </Text>
          <Field label="Établissement (facultatif)" value={form.institution} onChangeText={(v) => setForm({ ...form, institution: v })} autoCapitalize="sentences" />
          <Field label="Niveau (facultatif)" value={form.level} onChangeText={(v) => setForm({ ...form, level: v })} autoCapitalize="sentences" />

          {error ? (
            <View style={{ backgroundColor: '#fee2e2', borderRadius: 12, padding: 12, marginBottom: spacing.md }}>
              <Text style={{ color: '#991b1b', fontSize: 13 }}>{error}</Text>
            </View>
          ) : null}

          <Button
            label={loading ? 'Création…' : 'Créer mon compte'}
            onPress={submit}
            loading={loading}
            disabled={!form.email || !form.displayName || !passwordOk}
          />
          <View style={{ marginTop: spacing.md }}>
            <Button label="J’ai déjà un compte" variant="secondary" onPress={() => router.back()} />
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
