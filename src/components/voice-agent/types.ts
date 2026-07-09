export interface VoiceAgent {
  id: string;
  name: string;
  description: string | null;
  companyName: string | null;
  companyDesc: string | null;
  greeting: string;
  voice: string;
  speed: number;
  tone: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  scripts: AgentScript[];
  _count?: { callLogs: number };
}

export interface AgentScript {
  id: string;
  agentId: string;
  title: string;
  content: string;
  order: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  department: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CallLog {
  id: string;
  agentId: string | null;
  duration: number;
  status: string;
  transcript: string | null;
  createdAt: string;
  agent?: { id: string; name: string };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  audioUrl?: string;
}