import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseClientProvider } from '@/firebase';
import { BuyMeACoffeeWidget } from '@/components/buy-me-a-coffee-widget/buy-me-a-coffee-widget';
import { TauriUpdater } from '@/components/tauri-updater';

export const metadata: Metadata = {
  title: 'Vortex',
  description: 'Real-time voice and text chat sessions.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body antialiased" suppressHydrationWarning>
        <FirebaseClientProvider>
          {children}
        </FirebaseClientProvider>
        <Toaster />
        <BuyMeACoffeeWidget />
        <TauriUpdater />
      </body>
    </html>
  );
}
