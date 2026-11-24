import type { ConfigContext, ExpoConfig } from 'expo/config';
import base from './app.json';

/**
 * Configuration dynamique.
 *
 * L'adresse de l'API ne doit jamais être codée en dur dans un binaire que l'on
 * partage : elle dépend de l'endroit où tourne le serveur (émulateur, réseau
 * local, tunnel public, production). `EXPO_PUBLIC_API_URL` est donc lue à la
 * compilation, avec une valeur de repli explicite.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000';

  return {
    ...base.expo,
    ...config,
    extra: {
      ...base.expo.extra,
      apiUrl,
      builtAt: new Date().toISOString(),
      note: "Adresse de l'API figée à la compilation (EXPO_PUBLIC_API_URL). Émulateur : http://10.0.2.2:4000. Partage : URL du tunnel HTTPS.",
    },
  } as ExpoConfig;
};
