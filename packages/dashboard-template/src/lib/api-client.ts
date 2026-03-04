/**
 * BASIS API Client
 * Reads API_URL from env, attaches Bearer token from localStorage.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('basis_access_token');
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err?.error ?? `API error ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ─── Agents ──────────────────────────────────────────────────────────────────
export interface AgentInfo {
  type: string;
  name: string;
  emoji: string;
  description: string;
  enabled: boolean;
}

export async function fetchAgents(): Promise<AgentInfo[]> {
  const data = await apiFetch<{ agents: AgentInfo[] }>('/agents/list');
  return data.agents;
}

// ─── Tenant Profile (YAML) ────────────────────────────────────────────────────
export interface TenantProfileData {
  meta: { name: string; plan: string; last_updated: string; version: number };
  business: { industry: string; company_size: string; description: string };
  tasks: Array<{
    id: string; title: string; assigned_agent: string;
    priority: string; status: string; description: string | null;
  }>;
  agents: {
    enabled: string[];
    task_summary: Record<string, { count: number; tasks: string[] }>;
  };
  integrations: Array<{ provider: string; label: string; status: string; last_synced: string | null }>;
  crm_summary: Record<string, unknown> | null;
}

export async function fetchTenantProfile(): Promise<TenantProfileData | null> {
  try {
    const data = await apiFetch<{ profile: TenantProfileData }>('/tenant-profile/yaml');
    return data.profile;
  } catch {
    return null;
  }
}

// ─── Token Usage ──────────────────────────────────────────────────────────────
export interface TokenSummary {
  period: string;
  total_tokens: number;
  limit: number;
  percentage: number;
  warning: boolean;
  agents: Array<{ agent: string; tokens: number }>;
}

export async function fetchTokenSummary(): Promise<TokenSummary | null> {
  try {
    const data = await apiFetch<{ summary: TokenSummary }>('/token-usage/summary');
    return data.summary;
  } catch {
    return null;
  }
}

// ─── Onboarding Tasks ────────────────────────────────────────────────────────
export interface OnboardingTask {
  id: string; title: string; description: string | null;
  assignedAgent: string; priority: string; status: string;
}

export async function fetchOnboardingTasks(): Promise<OnboardingTask[]> {
  try {
    const data = await apiFetch<{ tasks: OnboardingTask[] }>('/onboarding/tasks/lena');
    return data.tasks;
  } catch {
    return [];
  }
}
