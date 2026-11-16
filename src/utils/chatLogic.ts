import type { ChatMessage, ChatScope, MeetingAnalysis } from '../types/meeting';
import { formatTimestamp } from './meetingLogic';

export function validateChatInput(input: string): { valid: boolean; error?: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { valid: false, error: 'Enter a question about the meeting.' };
  }
  return { valid: true };
}

export function buildMeetingsContextPayload(
  meetings: MeetingAnalysis[],
  activeMeetingId: string,
  scope: ChatScope
) {
  const targetMeetings =
    scope === 'all'
      ? meetings
      : meetings.filter((m) => m.id === activeMeetingId);

  return targetMeetings.map((meeting) => ({
    id: meeting.id,
    title: meeting.title,
    recordedAt: meeting.recordedAt,
    duration: formatTimestamp(meeting.durationSec),
    participants: meeting.participants.map((p) => ({
      name: p.name,
      role: p.role || 'Participant',
    })),
    transcript: meeting.transcript.map((entry) => ({
      timestamp: formatTimestamp(entry.startSec),
      speaker: entry.speakerName,
      emotion: entry.emotion,
      emotionIntensity: `${entry.emotionIntensity}%`,
      facialCue: entry.facialCue,
      text: entry.text,
      highlightedAction: entry.highlightedPhrase || null,
    })),
    actionItems: meeting.actionItems.map((item) => ({
      task: item.task,
      owner: item.assigneeName,
      priority: item.priority,
      dueDate: item.dueDate,
      completed: item.completed,
      timestamp: formatTimestamp(item.timestampSec),
    })),
    summary: meeting.summary
      ? {
          executiveSummary: meeting.summary.executiveSummary,
          keyDecisions: meeting.summary.keyDecisions,
          personSummaries: meeting.summary.personSummaries.map((ps) => ({
            participant: ps.participantName,
            dominantEmotion: ps.dominantEmotion,
            emotionTrajectory: ps.emotionTrajectory,
            facialObservation: ps.facialObservation,
            contributionSummary: ps.contributionSummary,
            actionSummary: ps.actionSummary,
          })),
        }
      : null,
  }));
}

export function buildReunionChatSystemInstruction(
  contextPayload: ReturnType<typeof buildMeetingsContextPayload>
): string {
  return [
    'You are the Cadence Reunion Analyst, a sharp and reliable meeting intelligence assistant.',
    'Your role is to answer questions about recorded meetings and reunions—including spoken dialogue, decisions, per-person tasks/action items, deadlines, and facial emotion observations while speaking.',
    'Rules:',
    '1. Ground every answer strictly in the meeting context JSON provided below. Do not invent tasks, quotes, deadlines, or emotions that are not present in the records.',
    '2. When referencing moments, cite participant names and timestamps (e.g., [00:52]) clearly.',
    '3. Keep answers concise, structured, and directly helpful.',
    '4. If the user asks about something not covered in the provided meeting records, state clearly what is missing.',
    `Meeting Records Context:\n${JSON.stringify(contextPayload)}`,
  ].join('\n\n');
}

export function formatChatHistoryForGemini(
  messages: ChatMessage[]
): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
  return messages
    .filter((m) => m.text.trim().length > 0)
    .map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    }));
}
