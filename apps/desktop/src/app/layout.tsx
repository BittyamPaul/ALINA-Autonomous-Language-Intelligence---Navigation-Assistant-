import type { Metadata } from 'next';
import '../styles/globals.css';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export const metadata: Metadata = {
  title: 'ALINA — Autonomous Language Intelligence & Navigation Assistant',
  description: 'A calm, local-first personal computer companion and autonomous workflow assistant.',
  icons: {
    icon: '/app-icon.svg',
    shortcut: '/app-icon.svg',
    apple: '/app-icon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-stone-50 dark:bg-[#0c0a09] text-stone-900 dark:text-[#f5f5f4] antialiased overflow-hidden select-none">
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}
