import Conf from 'conf';

interface BasisConfig {
  accessToken?: string;
  refreshToken?: string;
  apiUrl: string;
  tenantId?: string;
  projectId?: string;
}

export const config = new Conf<BasisConfig>({
  projectName: 'basis-cli',
  defaults: {
    apiUrl: 'http://localhost:3001',
  },
});

export function getToken(): string | undefined {
  return config.get('accessToken');
}

export function isLoggedIn(): boolean {
  return !!config.get('accessToken');
}

export function getApiUrl(): string {
  return config.get('apiUrl');
}
