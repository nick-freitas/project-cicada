import { Citation } from './profiles';

export interface WebSocketMessage {
  action: 'sendMessage' | 'resume';
  requestId: string;
  message?: string;
}

export interface WebSocketResponse {
  requestId: string;
  type: 'chunk' | 'complete' | 'error';
  content?: string;
  error?: string;
}

export interface QueryRequest {
  query: string;
  userId: string;
  sessionId: string;
  episodeContext?: string[];
  fragmentGroup?: string;
}

export interface QueryResponse {
  content: string;
  citations: Citation[];
  profileUpdates?: string[];
}
