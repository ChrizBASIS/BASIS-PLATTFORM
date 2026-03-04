/**
 * BASIS API Client
 * Reads API_URL from env, attaches Bearer token from localStorage.
 */

import { getAccessToken, refreshAccessToken, clearTokens } from './auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function getToken(): string | null {
  return getAccessToken();
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

  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const newToken = getAccessToken();
      const retry = await fetch(`${API_BASE}/api/v1${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(newToken ? { Authorization: `Bearer ${newToken}` } : {}),
          ...options?.headers,
        },
      });
      if (retry.ok) return retry.json() as Promise<T>;
    }
    clearTokens();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('Nicht angemeldet');
  }

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

// ─── Tenant Profile (JSON) ────────────────────────────────────────────────────
export interface TenantProfileData {
  id?: string;
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
    const data = await apiFetch<{ profile: TenantProfileData }>('/tenant-profile/json');
    return data.profile;
  } catch {
    return null;
  }
}

// ─── Token Usage ──────────────────────────────────────────────────────────────
// Matches actual API response from GET /token-usage/summary
export interface TokenSummary {
  period: { label: string; start: string; end: string };
  total_tokens: number;
  limit: number;
  percentage: number;
  warning: 'critical' | 'warning' | null;
  agents: Array<{ agent: string; tokens: number }>;
}

export async function fetchTokenSummary(): Promise<TokenSummary | null> {
  try {
    const raw = await apiFetch<{
      period: { label: string; start: string; end: string };
      total: { totalTokens: number };
      limit: number;
      percentage: number;
      warning: 'critical' | 'warning' | null;
      byAgent: Array<{ agent: string; totalTokens: number }>;
    }>('/token-usage/summary');

    return {
      period: raw.period,
      total_tokens: raw.total.totalTokens,
      limit: raw.limit,
      percentage: raw.percentage,
      warning: raw.warning,
      agents: raw.byAgent.map((a) => ({ agent: a.agent, tokens: a.totalTokens })),
    };
  } catch {
    return null;
  }
}

// ─── Agent Name → API Type mapping ───────────────────────────────────────────
export const AGENT_TYPE_MAP: Record<string, string> = {
  lena:   'orchestrator',
  marie:  'sekretariat',
  tom:    'backoffice',
  clara:  'finance',
  marco:  'marketing',
  alex:   'support',
  nico:   'builder',
  // fallback by role name
  sekretariat:  'sekretariat',
  backoffice:   'backoffice',
  finance:      'finance',
  marketing:    'marketing',
  support:      'support',
  builder:      'builder',
  orchestrator: 'orchestrator',
};

// ─── SSE stream types ─────────────────────────────────────────────────────────
export type StreamEvent =
  | { type: 'agent';  agent: string; agentName: string }
  | { type: 'delta';  content: string }
  | { type: 'done';   conversationId: string }
  | { type: 'error';  message: string };

/**
 * Streams chat via SSE. Yields parsed StreamEvents.
 * Routes through orchestrator which auto-selects the right agent.
 */
export async function* streamChat(
  message: string,
  conversationId?: string,
): AsyncGenerator<StreamEvent> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/v1/agents/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message, ...(conversationId ? { conversationId } : {}) }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Chat error ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event = JSON.parse(line.slice(6)) as StreamEvent;
          yield event;
        } catch {
          // ignore malformed
        }
      }
    }
  }
}

/**
 * Direct (non-streaming) chat to a specific agent type.
 */
export interface DirectChatResponse {
  reply: string;
  agent: string;
  agentName: string;
  conversationId: string;
}

export async function sendDirectChat(
  agentType: string,
  message: string,
  conversationId?: string,
): Promise<DirectChatResponse> {
  return apiFetch<DirectChatResponse>(`/agents/${agentType}/chat`, {
    method: 'POST',
    body: JSON.stringify({ message, ...(conversationId ? { conversationId } : {}) }),
  });
}

// ─── Onboarding ──────────────────────────────────────────────────────────────
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

export interface OnboardingProfileInput {
  industry: string;
  companySize?: string;
  businessDescription?: string;
  workflows?: Array<{ name: string; description?: string }>;
}

export async function createOnboardingProfile(data: OnboardingProfileInput): Promise<{ profileId: string }> {
  return apiFetch<{ profileId: string }>('/onboarding/profile', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export interface AnalyzeTask {
  category: string;
  title: string;
  description?: string;
  currentProcess?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  automatable?: boolean;
}

export interface AnalyzeResult {
  tasks: Array<{
    id: string; title: string; category: string;
    assignedAgent: string; assignedAgentName: string;
    priority: string; automatable: boolean;
  }>;
  yamlVersion: number;
  summary: {
    total: number;
    byAgent: Record<string, number>;
  };
}

export async function analyzeOnboarding(tasks: AnalyzeTask[]): Promise<AnalyzeResult> {
  return apiFetch<AnalyzeResult>('/onboarding/analyze', {
    method: 'POST',
    body: JSON.stringify({ tasks }),
  });
}

// ─── Settings ─────────────────────────────────────────────────────────────────
export async function updateTenantName(tenantId: string, name: string): Promise<void> {
  await apiFetch(`/tenants/${tenantId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function toggleAgent(agentType: string, enabled: boolean): Promise<void> {
  await apiFetch('/agents/config', {
    method: 'PATCH',
    body: JSON.stringify({ agentType, enabled }),
  });
}

export interface TenantMember {
  id: string; email: string; name: string | null;
  role: string; joinedAt: string;
}

export async function fetchMembers(tenantId: string): Promise<TenantMember[]> {
  const data = await apiFetch<{ members: TenantMember[] }>(`/tenants/${tenantId}/members`);
  return data.members;
}

// ─── Token History ────────────────────────────────────────────────────────────
export interface TokenHistoryDay {
  date: string;
  totalTokens: number;
  byAgent: Record<string, number>;
}

export async function fetchTokenHistory(): Promise<TokenHistoryDay[]> {
  try {
    const data = await apiFetch<{ history: TokenHistoryDay[] }>('/token-usage/history');
    return data.history;
  } catch {
    return [];
  }
}
