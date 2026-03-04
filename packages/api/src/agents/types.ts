export type AgentType =
  | 'orchestrator'
  | 'sekretariat'
  | 'backoffice'
  | 'finance'
  | 'marketing'
  | 'support'
  | 'builder';

export interface AgentDefinition {
  type: AgentType;
  name: string;
  emoji: string;
  description: string;
  systemPrompt: string;
  tools?: AgentTool[];
  handoffTo?: AgentType[];
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  agent?: AgentType;
  agentName?: string;
  timestamp?: Date;
}

export interface AgentResponse {
  message: string;
  agent: AgentType;
  agentName: string;
  handedOff?: boolean;
  handedOffTo?: AgentType;
  metadata?: Record<string, unknown>;
}

export interface AgentContext {
  tenantId: string;
  userId: string;
  conversationId: string;
  language: 'de' | 'it';
  projectTemplate?: string;
  enabledAgents: AgentType[];
}
