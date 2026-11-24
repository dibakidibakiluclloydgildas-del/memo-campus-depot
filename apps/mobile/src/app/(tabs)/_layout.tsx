import React from 'react';
import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { colors } from '@/lib/theme';

/**
 * Navigation mobile adaptée : cinq onglets, libellés explicites et icônes
 * textuelles (aucune police d'icônes à télécharger : démarrage plus rapide et
 * aucune dépendance réseau supplémentaire).
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.memo600,
        tabBarInactiveTintColor: '#8b9ab5',
        tabBarStyle: { height: 62, paddingBottom: 8, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        headerStyle: { backgroundColor: colors.memo600 },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="tableau-de-bord"
        options={{ title: 'Accueil', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>🏠</Text> }}
      />
      <Tabs.Screen
        name="bibliotheque"
        options={{ title: 'Cours', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>📚</Text> }}
      />
      <Tabs.Screen
        name="importer"
        options={{ title: 'Importer', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>＋</Text> }}
      />
      <Tabs.Screen
        name="revisions"
        options={{ title: 'Réviser', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>🧠</Text> }}
      />
      <Tabs.Screen
        name="planning"
        options={{ title: 'Planning', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>🗓️</Text> }}
      />
      <Tabs.Screen
        name="profil"
        options={{ title: 'Profil', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>👤</Text> }}
      />
    </Tabs>
  );
}
