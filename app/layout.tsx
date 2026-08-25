import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://our-conversations-private.motealhafez.chatgpt.site'),
  title: 'Our Conversations — private conversation archive',
  description: 'A private, local-first archive and visual analysis of the conversations that matter.',
  openGraph: {
    title: 'Our Conversations',
    description: 'A private archive of the conversations that matter.',
    images: [{ url: '/og.png', width: 1792, height: 921, alt: 'Our Conversations' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Our Conversations',
    description: 'A private archive of the conversations that matter.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
