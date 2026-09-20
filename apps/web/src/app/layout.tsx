import type { Metadata } from 'next';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: 'ALINA Web Companion',
  description: 'Autonomous Language Intelligence & Navigation Assistant Web Portal',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0c0a09] text-[#f5f5f4] antialiased">
        {children}
      </body>
    </html>
  );
}
