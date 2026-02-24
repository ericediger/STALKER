import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const crimsonPro = localFont({
  src: '../fonts/CrimsonPro-latin.woff2',
  weight: '400 600',
  variable: '--font-heading-ref',
  display: 'swap',
});

const dmSans = localFont({
  src: '../fonts/DMSans-latin.woff2',
  weight: '400 600',
  variable: '--font-body-ref',
  display: 'swap',
});

const jetbrainsMono = localFont({
  src: '../fonts/JetBrainsMono-latin.woff2',
  weight: '400 500',
  variable: '--font-mono-ref',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'STALKER — Portfolio Tracker',
  description: 'Stock & Portfolio Tracker + LLM Advisor',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${crimsonPro.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
