import type { Metadata } from 'next';
import './globals.css';
import { Nav } from '@/components/Nav';

export const metadata: Metadata = {
  title: 'Omnira — Onchain Chess',
  description: 'Master the art of strategy. Onchain chess on GenLayer.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Nav />
        <main className="relative z-10">{children}</main>
      </body>
    </html>
  );
}
