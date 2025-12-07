import { Citation } from './profiles';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  citations?: Citation[];
  profileUpdates?: string[];
}

export interface ConversationSession {
  userId: string;
  sessionId: string;
  startedAt: string;
  messages: Message[];
  summary?: string;
  compactedContext?: string;
  activeEpisodeContext?: string[];
  activeFragmentGroup?: string;
}

export interface RequestTracking {
  requestId: string;
  userId: string;
  connectionId: string;
  status: 'processing' | 'complete' | 'error';
  query: string;
  responseChunks: string[];
  fullResponse?: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
}
