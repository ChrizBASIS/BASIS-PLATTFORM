'use client';

import { useEffect, useState } from 'react';
import {
  fetchAgents, fetchTenantProfile, fetchTokenSummary,
  type AgentInfo, type TenantProfileData, type TokenSummary,
} from '../lib/api-client';

export interface DashboardData {
  tenant: TenantProfileData | null;
  agents: AgentInfo[];
  tokens: TokenSummary | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// ─── Agent Meta (name + color — always stable, not from API) ────────────────
export const AGENT_META: Record<string, { color: string; role: string; initial: string }> = {
  lena:       { color: '#E8FF3A', role: 'Orchestratorin', initial: 'L' },
  marie:      { color: '#A78BFA', role: 'Sekretariat',    initial: 'M' },
  tom:        { color: '#60A5FA', role: 'Backoffice',     initial: 'T' },
  clara:      { color: '#34D399', role: 'Finance',        initial: 'C' },
  marco:      { color: '#FB923C', role: 'Marketing',      initial: 'Ma' },
  alex:       { color: '#F472B6', role: 'Support',        initial: 'A' },
  nico:       { color: '#38BDF8', role: 'Builder',        initial: 'N' },
  sekretariat:{ color: '#A78BFA', role: 'Sekretariat',    initial: 'M' },
  backoffice: { color: '#60A5FA', role: 'Backoffice',     initial: 'T' },
  finance:    { color: '#34D399', role: 'Finance',        initial: 'C' },
  marketing:  { color: '#FB923C', role: 'Marketing',      initial: 'Ma' },
  support:    { color: '#F472B6', role: 'Support',        initial: 'A' },
  builder:    { color: '#38BDF8', role: 'Builder',        initial: 'N' },
  orchestrator:{ color: '#E8FF3A', role: 'Orchestratorin', initial: 'L' },
};

export function useDashboardData(): DashboardData {
  const [tenant, setTenant] = useState<TenantProfileData | null>(null);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [tokens, setTokens] = useState<TokenSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchTenantProfile(),
      fetchAgents(),
      fetchTokenSummary(),
    ])
      .then(([tenantData, agentsData, tokensData]) => {
        if (cancelled) return;
        setTenant(tenantData);
        setAgents(agentsData);
        setTokens(tokensData);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [tick]);

  return {
    tenant,
    agents,
    tokens,
    loading,
    error,
    refetch: () => setTick((t) => t + 1),
  };
}
