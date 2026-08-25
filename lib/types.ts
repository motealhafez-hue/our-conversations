export type MessageKind = 'text' | 'image' | 'video' | 'voice' | 'sticker' | 'link' | 'document' | 'call' | 'deleted' | 'system' | 'other';

export type SourceKind = 'telegram' | 'whatsapp' | 'instagram' | 'json' | 'csv' | 'text';

export interface Message {
  id: string;
  conversationId: string;
  sender: string;
  timestamp: number;
  text: string;
  kind: MessageKind;
  source: SourceKind;
  attachmentName?: string;
}

export interface ConversationCandidate {
  id: string;
  title: string;
  sourceName: string;
  source: SourceKind;
  participants: string[];
  messages: Message[];
  warnings: string[];
}

export interface AnalysisSettings {
  sessionGapHours: 1 | 3 | 6 | 12 | 24;
  normalizeArabic: boolean;
  normalizeTaaMarbuta: boolean;
  excludeStopWords: boolean;
  customStopWords: string[];
}

export interface ReplyMetric {
  sender: string;
  averageMs: number;
  medianMs: number;
  fastestMs: number;
  underMinute: number;
  underFive: number;
  underFifteen: number;
  underHour: number;
  overHours: number;
  count: number;
}

export interface Session {
  id: string;
  start: number;
  end: number;
  starter: string;
  closer: string;
  messages: Message[];
  alternations: number;
}
