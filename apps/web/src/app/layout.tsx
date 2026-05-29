import type { Metadata } from 'next';
import './globals.css';
import { Nav } from '@/components/Nav';

export const metadata: Metadata = {
  title: 'Omnira',
  description: 'Onchain chess on GenLayer',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Nav />
        <main className="relative z-10 max-w-6xl mx-auto px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
