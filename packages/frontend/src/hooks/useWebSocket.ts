import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  status?: 'sending' | 'streaming' | 'complete' | 'error';
}

interface UseWebSocketReturn {
  messages: Message[];
  sendMessage: (content: string) => void;
  isConnected: boolean;
  isReconnecting: boolean;
}

const WS_URL = import.meta.env.VITE_WEBSOCKET_URL || 'ws://localhost:3001';

export function useWebSocket(): UseWebSocketReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const pendingRequests = useRef<Map<string, Message>>(new Map());
  const reconnectTimeoutRef = useRef<number>();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      setIsReconnecting(false);

      // Resume any pending requests
      pendingRequests.current.forEach((_message, requestId) => {
        ws.send(
          JSON.stringify({
            action: 'resume',
            requestId,
          })
        );
      });
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'chunk') {
        // Append chunk to existing assistant message or create new one
        setMessages((prev) => {
          const existingAssistant = prev.find(
            (m) => m.id === `assistant-${data.requestId}` && m.role === 'assistant'
          );
          if (existingAssistant) {
            return prev.map((m) =>
              m.id === `assistant-${data.requestId}`
                ? { ...m, content: m.content + data.content, status: 'streaming' as const }
                : m
            );
          } else {
            // Create new assistant message with unique ID
            return [
              ...prev,
              {
                id: `assistant-${data.requestId}`,
                role: 'assistant' as const,
                content: data.content,
                timestamp: new Date(),
                status: 'streaming' as const,
              },
            ];
          }
        });
      } else if (data.type === 'complete') {
        // Mark assistant message as complete
        setMessages((prev) =>
          prev.map((m) =>
            m.id === `assistant-${data.requestId}` ? { ...m, status: 'complete' as const } : m
          )
        );
        pendingRequests.current.delete(data.requestId);
      } else if (data.type === 'error') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === `assistant-${data.requestId}`
              ? { ...m, content: m.content + '\n\nError: ' + data.message, status: 'error' as const }
              : m
          )
        );
        pendingRequests.current.delete(data.requestId);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);

      // Attempt reconnection if there are pending requests
      if (pendingRequests.current.size > 0) {
        setIsReconnecting(true);
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 2000) as unknown as number;
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  const sendMessage = useCallback(
    (content: string) => {
      const requestId = uuidv4();
      const userMessage: Message = {
        id: requestId,
        role: 'user',
        content,
        timestamp: new Date(),
        status: 'sending',
      };

      setMessages((prev) => [...prev, userMessage]);

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            action: 'sendMessage',
            requestId,
            message: content,
          })
        );

        // Track pending request for reconnection
        pendingRequests.current.set(requestId, userMessage);

        // Update status to sent
        setMessages((prev) =>
          prev.map((m) => (m.id === requestId ? { ...m, status: undefined } : m))
        );
      } else {
        // Connection not ready
        setMessages((prev) =>
          prev.map((m) =>
            m.id === requestId
              ? { ...m, status: 'error' as const, content: content + '\n\nError: Not connected' }
              : m
          )
        );
      }
    },
    []
  );

  return {
    messages,
    sendMessage,
    isConnected,
    isReconnecting,
  };
}
