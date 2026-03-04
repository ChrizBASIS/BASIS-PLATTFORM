import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AuthGuard } from '@/components/AuthGuard';
import { ToastProvider } from '@/components/Toast';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import './globals.css';

export const metadata: Metadata = {
  title: 'BASIS Dashboard',
  description: 'Dein digitales Dashboard — powered by BASIS',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" data-theme="dark" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ThemeProvider><ToastProvider><ErrorBoundary><AuthGuard>{children}</AuthGuard></ErrorBoundary></ToastProvider></ThemeProvider>
      </body>
    </html>
  );
}
