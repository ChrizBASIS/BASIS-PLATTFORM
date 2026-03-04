'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getAccessToken, isTokenExpired, refreshAccessToken, clearTokens } from '@/lib/auth';

const PUBLIC_PATHS = ['/login', '/auth/callback'];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return;

    const token = getAccessToken();

    if (!token) {
      router.replace('/login');
      return;
    }

    if (isTokenExpired()) {
      refreshAccessToken().then((ok) => {
        if (!ok) {
          clearTokens();
          router.replace('/login');
        }
      });
    }
  }, [pathname, router]);

  return <>{children}</>;
}
