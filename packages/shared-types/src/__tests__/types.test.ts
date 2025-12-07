import {
  ScriptMessage,
  EpisodeConfig,
  CharacterProfile,
  LocationProfile,
  EpisodeProfile,
  FragmentGroupProfile,
  TheoryProfile,
  ConversationSession,
  RequestTracking,
  WebSocketMessage,
  QueryRequest,
} from '../index';

describe('Type Definitions', () => {
  describe('ScriptMessage', () => {
    test('accepts valid script message', () => {
      const message: ScriptMessage = {
        type: 'MSGSET',
        MessageID: 1,
        TextJPN: 'テスト',
        TextENG: 'Test',
        speaker: 'Rena',
        episodeId: 'onikakushi',
        chapterId: 'chapter_01',
      };

      expect(message.MessageID).toBe(1);
      expect(message.speaker).toBe('Rena');
    });
  });

  describe('EpisodeConfig', () => {
    test('accepts valid episode config', () => {
      const config: EpisodeConfig = {
        episodeId: 'onikakushi',
        episodeName: 'Onikakushi-hen',
        filePattern: 'kageboushi_*',
        arcType: 'question',
      };

      expect(config.episodeId).toBe('onikakushi');
      expect(config.arcType).toBe('question');
    });
  });

  describe('CharacterProfile', () => {
    test('accepts valid character profile', () => {
      const profile: CharacterProfile = {
        profileId: 'char-001',
        profileType: 'CHARACTER',
        userId: 'user-001',
        version: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        characterName: 'Rena Ryuugu',
        appearances: [],
        relationships: [],
        traits: ['friendly', 'mysterious'],
        knownFacts: [],
      };

      expect(profile.profileType).toBe('CHARACTER');
      expect(profile.characterName).toBe('Rena Ryuugu');
    });
  });

  describe('TheoryProfile', () => {
    test('accepts valid theory profile', () => {
      const profile: TheoryProfile = {
        profileId: 'theory-001',
        profileType: 'THEORY',
        userId: 'user-001',
        version: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        theoryName: 'Time Loop Theory',
        description: 'The events repeat in a loop',
        status: 'proposed',
        supportingEvidence: [],
        contradictingEvidence: [],
        refinements: [],
        relatedTheories: [],
      };

      expect(profile.profileType).toBe('THEORY');
      expect(profile.status).toBe('proposed');
    });
  });

  describe('ConversationSession', () => {
    test('accepts valid conversation session', () => {
      const session: ConversationSession = {
        userId: 'user-001',
        sessionId: 'session-001',
        startedAt: '2024-01-01T00:00:00Z',
        messages: [],
      };

      expect(session.userId).toBe('user-001');
      expect(session.messages).toEqual([]);
    });
  });

  describe('RequestTracking', () => {
    test('accepts valid request tracking', () => {
      const now = Date.now();
      const tracking: RequestTracking = {
        requestId: 'req-001',
        userId: 'user-001',
        connectionId: 'conn-001',
        status: 'processing',
        message: 'What happened in Onikakushi?',
        sessionId: 'session-001',
        responseChunks: [],
        accumulatedResponse: '',
        createdAt: now,
        updatedAt: now,
        ttl: now + 86400000, // 24 hours
      };

      expect(tracking.status).toBe('processing');
      expect(tracking.responseChunks).toEqual([]);
    });
  });

  describe('WebSocketMessage', () => {
    test('accepts valid sendMessage action', () => {
      const message: WebSocketMessage = {
        action: 'sendMessage',
        requestId: 'req-001',
        message: 'Test query',
      };

      expect(message.action).toBe('sendMessage');
      expect(message.message).toBe('Test query');
    });

    test('accepts valid resume action', () => {
      const message: WebSocketMessage = {
        action: 'resume',
        requestId: 'req-001',
      };

      expect(message.action).toBe('resume');
    });
  });

  describe('QueryRequest', () => {
    test('accepts valid query request', () => {
      const request: QueryRequest = {
        query: 'What happened?',
        userId: 'user-001',
        sessionId: 'session-001',
        episodeContext: ['onikakushi'],
      };

      expect(request.query).toBe('What happened?');
      expect(request.episodeContext).toEqual(['onikakushi']);
    });
  });
});
