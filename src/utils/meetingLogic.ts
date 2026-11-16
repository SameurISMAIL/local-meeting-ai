import type {
  ActionItem,
  ActionPriority,
  EmotionLabel,
  Participant,
  TranscriptEntry,
} from '../types/meeting';

export function formatTimestamp(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

export function validateParticipantInput(
  name: string,
  hasImage: boolean
): { valid: boolean; error?: string } {
  const trimmed = name.trim();
  if (!trimmed) {
    return { valid: false, error: 'Enter the participant’s full name.' };
  }
  if (trimmed.length < 2) {
    return { valid: false, error: 'Participant name must be at least 2 characters.' };
  }
  if (!hasImage) {
    return { valid: false, error: 'Upload a face reference photo for this participant.' };
  }
  return { valid: true };
}

export function validateMeetingSubmission(
  title: string,
  participants: Participant[],
  hasVideo: boolean
): { valid: boolean; error?: string } {
  if (!title.trim()) {
    return { valid: false, error: 'Enter a meeting or reunion title.' };
  }
  if (participants.length === 0) {
    return {
      valid: false,
      error: 'Add at least one participant with a name and face photo before transcribing.',
    };
  }
  const missingPhoto = participants.find((p) => !p.imageUrl || !p.name.trim());
  if (missingPhoto) {
    return {
      valid: false,
      error: `Participant "${missingPhoto.name || 'Unnamed'}" is missing a name or face photo.`,
    };
  }
  if (!hasVideo) {
    return { valid: false, error: 'Select a meeting video file to transcribe and analyze.' };
  }
  return { valid: true };
}

export interface TranscriptFilterOptions {
  participantId: string;
  emotion: string;
  actionOnly: boolean;
  query: string;
}

export function filterTranscriptEntries(
  entries: TranscriptEntry[],
  filters: TranscriptFilterOptions
): TranscriptEntry[] {
  const normalizedQuery = filters.query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (filters.participantId !== 'all' && entry.speakerId !== filters.participantId) {
      return false;
    }
    if (filters.emotion !== 'all' && entry.emotion !== filters.emotion) {
      return false;
    }
    if (filters.actionOnly && !entry.actionItemId && !entry.highlightedPhrase) {
      return false;
    }
    if (normalizedQuery) {
      const haystack = `${entry.speakerName} ${entry.text} ${entry.facialCue} ${entry.emotion}`.toLowerCase();
      if (!haystack.includes(normalizedQuery)) {
        return false;
      }
    }
    return true;
  });
}

export interface AggregatedParticipantMetrics {
  participantId: string;
  turnCount: number;
  speakingSeconds: number;
  speakingSharePercent: number;
  dominantEmotion: EmotionLabel;
  emotionSequence: EmotionLabel[];
  totalActions: number;
  completedActions: number;
}

export function aggregateParticipantMetrics(
  participants: Participant[],
  entries: TranscriptEntry[],
  actionItems: ActionItem[]
): Record<string, AggregatedParticipantMetrics> {
  const totalMeetingSpeakingSec = entries.reduce(
    (sum, entry) => sum + Math.max(1, entry.endSec - entry.startSec),
    0
  );

  const result: Record<string, AggregatedParticipantMetrics> = {};

  for (const participant of participants) {
    const speakerEntries = entries.filter((e) => e.speakerId === participant.id);
    const speakingSeconds = speakerEntries.reduce(
      (sum, e) => sum + Math.max(1, e.endSec - e.startSec),
      0
    );

    const emotionCounts = new Map<EmotionLabel, number>();
    const emotionSequence: EmotionLabel[] = [];
    for (const entry of speakerEntries) {
      emotionCounts.set(entry.emotion, (emotionCounts.get(entry.emotion) ?? 0) + 1);
      if (emotionSequence[emotionSequence.length - 1] !== entry.emotion) {
        emotionSequence.push(entry.emotion);
      }
    }

    let dominantEmotion: EmotionLabel = 'Neutral';
    let topCount = 0;
    for (const [emotion, count] of emotionCounts.entries()) {
      if (count > topCount) {
        topCount = count;
        dominantEmotion = emotion;
      }
    }

    const assignedActions = actionItems.filter((a) => a.assigneeId === participant.id);
    const completedActions = assignedActions.filter((a) => a.completed).length;

    result[participant.id] = {
      participantId: participant.id,
      turnCount: speakerEntries.length,
      speakingSeconds,
      speakingSharePercent:
        totalMeetingSpeakingSec > 0
          ? Math.round((speakingSeconds / totalMeetingSpeakingSec) * 100)
          : 0,
      dominantEmotion,
      emotionSequence,
      totalActions: assignedActions.length,
      completedActions,
    };
  }

  return result;
}

export function toggleActionItemStatus(
  items: ActionItem[],
  itemId: string
): ActionItem[] {
  return items.map((item) =>
    item.id === itemId ? { ...item, completed: !item.completed } : item
  );
}

export function addManualActionItem(
  entries: TranscriptEntry[],
  actionItems: ActionItem[],
  params: {
    entryId: string;
    taskText: string;
    assigneeId: string;
    assigneeName: string;
    priority: ActionPriority;
    dueDate: string;
  }
): { entries: TranscriptEntry[]; actionItems: ActionItem[]; created: ActionItem } {
  const targetEntry = entries.find((e) => e.id === params.entryId);
  const newId = `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const created: ActionItem = {
    id: newId,
    task: params.taskText.trim(),
    assigneeId: params.assigneeId,
    assigneeName: params.assigneeName,
    priority: params.priority,
    dueDate: params.dueDate.trim() || 'This week',
    sourceEntryId: params.entryId,
    timestampSec: targetEntry ? targetEntry.startSec : 0,
    completed: false,
  };

  const updatedEntries = entries.map((entry) =>
    entry.id === params.entryId
      ? {
          ...entry,
          actionItemId: newId,
          highlightedPhrase: entry.highlightedPhrase || params.taskText.trim(),
        }
      : entry
  );

  return {
    entries: updatedEntries,
    actionItems: [...actionItems, created],
    created,
  };
}

export function splitTextAroundHighlight(
  text: string,
  phrase?: string
): { before: string; match: string; after: string } | null {
  if (!phrase || !phrase.trim()) {
    return null;
  }
  const idx = text.toLowerCase().indexOf(phrase.trim().toLowerCase());
  if (idx === -1) {
    return null;
  }
  const len = phrase.trim().length;
  return {
    before: text.slice(0, idx),
    match: text.slice(idx, idx + len),
    after: text.slice(idx + len),
  };
}

export interface MoodTimelinePoint {
  bucketIndex: number;
  bucketLabel: string;
  rangeLabel: string;
  startSec: number;
  endSec: number;
  [participantId: string]: string | number | null;
}

export interface MoodTimelineResult {
  points: MoodTimelinePoint[];
  overallAverages: Record<string, number | null>;
  bucketEmotions: Record<number, Record<string, EmotionLabel[]>>;
}

export function buildMoodTimelineData(
  participants: Participant[],
  entries: TranscriptEntry[],
  durationSec: number,
  bucketCount = 5
): MoodTimelineResult {
  const safeBuckets = Math.max(1, Math.floor(bucketCount));
  const analyzedEntries = entries.filter((entry) => entry.emotionAnalyzed !== false);
  const maxEnd = analyzedEntries.reduce((max, e) => Math.max(max, e.endSec), 0);
  const effectiveDuration = Math.max(durationSec, maxEnd, 1);

  const intensitiesByBucket = new Map<string, number[]>();
  const emotionsByBucket = new Map<string, EmotionLabel[]>();
  const overallTotals = new Map<string, { sum: number; count: number }>();

  for (const entry of analyzedEntries) {
    const midpoint = (entry.startSec + entry.endSec) / 2;
    const rawIdx = Math.floor((midpoint / effectiveDuration) * safeBuckets);
    const bucketIdx = Math.min(safeBuckets - 1, Math.max(0, rawIdx));
    const key = `${bucketIdx}:${entry.speakerId}`;

    const list = intensitiesByBucket.get(key) ?? [];
    list.push(entry.emotionIntensity);
    intensitiesByBucket.set(key, list);

    const emoList = emotionsByBucket.get(key) ?? [];
    if (!emoList.includes(entry.emotion)) {
      emoList.push(entry.emotion);
    }
    emotionsByBucket.set(key, emoList);

    const agg = overallTotals.get(entry.speakerId) ?? { sum: 0, count: 0 };
    agg.sum += entry.emotionIntensity;
    agg.count += 1;
    overallTotals.set(entry.speakerId, agg);
  }

  const points: MoodTimelinePoint[] = [];
  const bucketEmotions: Record<number, Record<string, EmotionLabel[]>> = {};

  for (let i = 0; i < safeBuckets; i += 1) {
    const startSec = Math.floor((i * effectiveDuration) / safeBuckets);
    const endSec =
      i === safeBuckets - 1
        ? Math.ceil(effectiveDuration)
        : Math.floor(((i + 1) * effectiveDuration) / safeBuckets);

    const point: MoodTimelinePoint = {
      bucketIndex: i,
      bucketLabel: formatTimestamp(startSec),
      rangeLabel: `${formatTimestamp(startSec)} – ${formatTimestamp(endSec)}`,
      startSec,
      endSec,
    };

    bucketEmotions[i] = {};

    for (const participant of participants) {
      const key = `${i}:${participant.id}`;
      const values = intensitiesByBucket.get(key);
      if (values && values.length > 0) {
        const avg = Math.round(
          values.reduce((sum, v) => sum + v, 0) / values.length
        );
        point[participant.id] = avg;
        bucketEmotions[i][participant.id] = emotionsByBucket.get(key) ?? [];
      } else {
        point[participant.id] = null;
      }
    }

    points.push(point);
  }

  const overallAverages: Record<string, number | null> = {};
  for (const participant of participants) {
    const agg = overallTotals.get(participant.id);
    overallAverages[participant.id] =
      agg && agg.count > 0 ? Math.round(agg.sum / agg.count) : null;
  }

  return { points, overallAverages, bucketEmotions };
}

