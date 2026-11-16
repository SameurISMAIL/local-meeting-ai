export type EmotionLabel =
  | 'Confident'
  | 'Focused'
  | 'Enthusiastic'
  | 'Concerned'
  | 'Hesitant'
  | 'Frustrated'
  | 'Supportive'
  | 'Neutral';

export type ActionPriority = 'High' | 'Medium' | 'Low';

export interface Participant {
  id: string;
  name: string;
  role?: string;
  imageUrl: string;
}

export interface ActionItem {
  id: string;
  task: string;
  assigneeId: string;
  assigneeName: string;
  priority: ActionPriority;
  dueDate: string;
  sourceEntryId: string;
  timestampSec: number;
  completed: boolean;
}

export interface TranscriptEntry {
  id: string;
  startSec: number;
  endSec: number;
  speakerId: string;
  speakerName: string;
  text: string;
  highlightedPhrase?: string;
  actionItemId?: string;
  emotion: EmotionLabel;
  facialCue: string;
  emotionIntensity: number; // 0 to 100
  emotionAnalyzed?: boolean;
}

export interface PersonSummary {
  participantId: string;
  participantName: string;
  dominantEmotion: EmotionLabel;
  emotionTrajectory: string;
  facialObservation: string;
  contributionSummary: string;
  actionSummary: string;
}

export interface MeetingSummaryData {
  executiveSummary: string;
  keyDecisions: string[];
  personSummaries: PersonSummary[];
}

export type PipelineStage =
  | 'idle'
  | 'transcribing'
  | 'transcript_ready'
  | 'summarizing'
  | 'complete';

export interface MeetingAnalysis {
  id: string;
  title: string;
  recordedAt: string;
  durationSec: number;
  videoUrl?: string;
  participants: Participant[];
  transcript: TranscriptEntry[];
  actionItems: ActionItem[];
  summary: MeetingSummaryData | null;
  stage: PipelineStage;
  isSample?: boolean;
}

export type ChatScope = 'current' | 'all';

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
}

