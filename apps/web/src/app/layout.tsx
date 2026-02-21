import type { Metadata } from 'next';

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
