export interface ScriptMessage {
  type: string;
  MessageID: number;
  TextJPN: string;
  TextENG: string;
  speaker?: string;
  episodeId: string;
  chapterId: string;
}

export interface EpisodeConfig {
  episodeId: string;
  episodeName: string;
  filePattern: string;
  arcType: 'question' | 'answer' | 'other';
  metadata?: Record<string, unknown>;
}
