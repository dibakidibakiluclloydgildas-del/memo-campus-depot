import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'MÉMO CAMPUS — Votre compagnon académique', template: '%s · MÉMO CAMPUS' },
  description:
    "MÉMO CAMPUS transforme vos cours en résumés structurés, fiches de révision, évaluations corrigées et planning réaliste. Web et Android, mêmes comptes, mêmes données.",
  applicationName: 'MÉMO CAMPUS',
  authors: [{ name: 'MÉMO CAMPUS' }],
  keywords: ['révisions', 'étudiants', 'EdTech', 'QCM', 'répétition espacée', 'Cameroun'],
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script
          // Applique le thème avant le premier rendu (évite le flash blanc).
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('memo-theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
