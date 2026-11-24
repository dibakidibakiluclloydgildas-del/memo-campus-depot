import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { getToken } from '@/lib/api';

/** Point d'entrée : redirige selon l'état de session. */
export default function IndexScreen() {
  const [state, setState] = useState<'loading' | 'auth' | 'guest'>('loading');

  useEffect(() => {
    (async () => {
      const token = await getToken();
      setState(token ? 'auth' : 'guest');
    })();
  }, []);

  if (state === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#2145ea" />
      </View>
    );
  }

  return <Redirect href={state === 'auth' ? '/(tabs)/tableau-de-bord' : '/(auth)/connexion'} />;
}
