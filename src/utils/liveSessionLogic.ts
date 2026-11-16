import type {
  ActionItem,
  Participant,
  TranscriptEntry,
} from '../types/meeting';
import { validateParticipantInput } from './meetingLogic';

export type VideoSourceMode = 'upload' | 'live';

export function pickSupportedRecorderMimeType(
  isTypeSupported: (mimeType: string) => boolean
): string {
  const candidates = [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm',
    'video/mp4',
  ];
  for (const candidate of candidates) {
    if (isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return '';
}

export function validateLiveSessionStart(
  title: string,
  participants: Participant[]
): { valid: boolean; error?: string } {
  if (!title.trim()) {
    return {
      valid: false,
      error: 'Enter a meeting or reunion title before starting live transcription.',
    };
  }
  if (participants.length === 0) {
    return {
      valid: false,
      error: 'Add at least one participant with a name and face photo first.',
    };
  }
  for (const person of participants) {
    const check = validateParticipantInput(person.name, Boolean(person.imageUrl));
    if (!check.valid) {
      return {
        valid: false,
        error: `Participant "${person.name || 'Unnamed'}" is missing a name or face photo.`,
      };
    }
  }
  return { valid: true };
}

export interface LiveChunkPayload {
  transcript: TranscriptEntry[];
  actionItems: ActionItem[];
}

export function mergeLiveChunkResults(
  existingTranscript: TranscriptEntry[],
  existingActions: ActionItem[],
  chunk: LiveChunkPayload,
  offsetSec: number,
  chunkSequence: number
): { transcript: TranscriptEntry[]; actionItems: ActionItem[] } {
  const safeOffset = Math.max(0, Math.round(offsetSec));
  const entryIdMap = new Map<string, string>();
  const actionIdMap = new Map<string, string>();

  const nextActions: ActionItem[] = (chunk.actionItems ?? []).map((act, idx) => {
    const uniqueActionId = `live-act-${chunkSequence}-${idx + 1}`;
    if (act.id) {
      actionIdMap.set(act.id, uniqueActionId);
    }
    return {
      ...act,
      id: uniqueActionId,
      timestampSec: Math.max(0, Math.round(act.timestampSec)) + safeOffset,
      completed: false,
    };
  });

  const nextEntries: TranscriptEntry[] = (chunk.transcript ?? [])
    .filter((entry) => entry.text && entry.text.trim().length > 0)
    .map((entry, idx) => {
      const uniqueEntryId = `live-tr-${chunkSequence}-${idx + 1}`;
      if (entry.id) {
        entryIdMap.set(entry.id, uniqueEntryId);
      }
      const startSec = Math.max(0, Math.round(entry.startSec)) + safeOffset;
      const rawEnd = Math.max(0, Math.round(entry.endSec)) + safeOffset;
      const endSec = Math.max(startSec + 1, rawEnd);
      return {
        ...entry,
        id: uniqueEntryId,
        startSec,
        endSec,
        actionItemId: entry.actionItemId
          ? actionIdMap.get(entry.actionItemId) ?? entry.actionItemId
          : undefined,
      };
    });

  const remappedActions = nextActions.map((act) => ({
    ...act,
    sourceEntryId: act.sourceEntryId
      ? entryIdMap.get(act.sourceEntryId) ?? act.sourceEntryId
      : nextEntries[0]?.id ?? '',
  }));

  // Ensure bidirectional link if action had sourceEntryId
  const actionByEntryId = new Map<string, string>();
  for (const act of remappedActions) {
    if (act.sourceEntryId && !actionByEntryId.has(act.sourceEntryId)) {
      actionByEntryId.set(act.sourceEntryId, act.id);
    }
  }

  const linkedEntries = nextEntries.map((entry) => ({
    ...entry,
    actionItemId: entry.actionItemId ?? actionByEntryId.get(entry.id),
  }));

  return {
    transcript: [...existingTranscript, ...linkedEntries],
    actionItems: [...existingActions, ...remappedActions],
  };
}
