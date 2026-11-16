import type {
  ActionPriority,
  EmotionLabel,
  MeetingAnalysis,
} from '../types/meeting';
import { formatTimestamp, splitTextAroundHighlight } from './meetingLogic';

export interface PrintableParticipant {
  id: string;
  name: string;
  role?: string;
}

export interface PrintableActionItem {
  id: string;
  task: string;
  assigneeName: string;
  priority: ActionPriority;
  dueDate: string;
  timestampSec: number;
  timestampLabel: string;
  completed: boolean;
  statusLabel: 'Completed' | 'Open';
}

export interface PrintableTranscriptEntry {
  id: string;
  startSec: number;
  endSec: number;
  startLabel: string;
  endLabel: string;
  speakerName: string;
  speakerRole?: string;
  emotion: EmotionLabel;
  emotionIntensity: number;
  emotionAnalyzed?: boolean;
  facialCue: string;
  text: string;
  highlightParts: { before: string; match: string; after: string } | null;
  linkedActionTask?: string;
}

export interface PrintableMeetingReportData {
  title: string;
  recordedAt: string;
  durationLabel: string;
  participantCount: number;
  totalActionsCount: number;
  completedActionsCount: number;
  participants: PrintableParticipant[];
  executiveSummary: string | null;
  keyDecisions: string[];
  actionItems: PrintableActionItem[];
  transcript: PrintableTranscriptEntry[];
}

const PRIORITY_RANK: Record<ActionPriority, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
};

export function buildPrintDocumentTitle(meetingTitle: string): string {
  const cleaned = meetingTitle
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const base = cleaned || 'Meeting Report';
  return `${base} - Transcript & Action Items`;
}

export function buildPrintableMeetingReportData(
  meeting: MeetingAnalysis
): PrintableMeetingReportData {
  const roleById = new Map<string, string | undefined>();
  for (const participant of meeting.participants) {
    roleById.set(participant.id, participant.role);
  }

  const actionById = new Map(meeting.actionItems.map((item) => [item.id, item]));

  const sortedActions = [...meeting.actionItems].sort((a, b) => {
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }
    if (a.timestampSec !== b.timestampSec) {
      return a.timestampSec - b.timestampSec;
    }
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  });

  const printableActions: PrintableActionItem[] = sortedActions.map((item) => ({
    id: item.id,
    task: item.task,
    assigneeName: item.assigneeName || 'Unassigned',
    priority: item.priority,
    dueDate: item.dueDate || 'TBD',
    timestampSec: item.timestampSec,
    timestampLabel: formatTimestamp(item.timestampSec),
    completed: item.completed,
    statusLabel: item.completed ? 'Completed' : 'Open',
  }));

  const sortedTranscript = [...meeting.transcript].sort(
    (a, b) => a.startSec - b.startSec || a.endSec - b.endSec
  );

  const printableTranscript: PrintableTranscriptEntry[] = sortedTranscript.map(
    (entry) => {
      const linkedAction = entry.actionItemId
        ? actionById.get(entry.actionItemId)
        : undefined;

      return {
        id: entry.id,
        startSec: entry.startSec,
        endSec: entry.endSec,
        startLabel: formatTimestamp(entry.startSec),
        endLabel: formatTimestamp(entry.endSec),
        speakerName: entry.speakerName,
        speakerRole: roleById.get(entry.speakerId),
        emotion: entry.emotion,
        emotionIntensity: entry.emotionIntensity,
        emotionAnalyzed: entry.emotionAnalyzed,
        facialCue: entry.facialCue,
        text: entry.text,
        highlightParts: splitTextAroundHighlight(
          entry.text,
          entry.highlightedPhrase
        ),
        linkedActionTask: linkedAction?.task,
      };
    }
  );

  const completedActionsCount = meeting.actionItems.filter(
    (item) => item.completed
  ).length;

  return {
    title: meeting.title.trim() || 'Untitled Meeting',
    recordedAt: meeting.recordedAt,
    durationLabel: formatTimestamp(meeting.durationSec),
    participantCount: meeting.participants.length,
    totalActionsCount: meeting.actionItems.length,
    completedActionsCount,
    participants: meeting.participants.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
    })),
    executiveSummary: meeting.summary?.executiveSummary?.trim() || null,
    keyDecisions: meeting.summary?.keyDecisions ?? [],
    actionItems: printableActions,
    transcript: printableTranscript,
  };
}

export function triggerBrowserPrint(meetingTitle: string): void {
  if (typeof window === 'undefined' || typeof window.print !== 'function') {
    return;
  }

  const previousTitle = typeof document !== 'undefined' ? document.title : '';
  let restored = false;
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

  const restoreTitle = () => {
    if (restored) return;
    restored = true;
    if (fallbackTimer !== undefined) {
      clearTimeout(fallbackTimer);
    }
    if (typeof document !== 'undefined') {
      document.title = previousTitle;
    }
    window.removeEventListener('afterprint', restoreTitle);
  };

  if (typeof document !== 'undefined') {
    document.title = buildPrintDocumentTitle(meetingTitle);
  }

  window.addEventListener('afterprint', restoreTitle);
  fallbackTimer = setTimeout(restoreTitle, 3000);

  try {
    window.print();
  } finally {
    // Some headless or embedded browsers return synchronously after print()
    // without dispatching afterprint immediately; schedule restoration safely.
    setTimeout(restoreTitle, 150);
  }
}
