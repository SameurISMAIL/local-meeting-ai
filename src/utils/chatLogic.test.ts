import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMeetingsContextPayload,
  buildReunionChatSystemInstruction,
  formatChatHistoryForGemini,
  validateChatInput,
} from './chatLogic';
import type { ChatMessage, MeetingAnalysis } from '../types/meeting';

const mockMeetings: MeetingAnalysis[] = [
  {
    id: 'm1',
    title: 'Sprint Sync',
    recordedAt: 'Nov 12',
    durationSec: 120,
    participants: [{ id: 'p1', name: 'Claire Moreau', role: 'PM', imageUrl: '/c.jpg' }],
    transcript: [
      {
        id: 't1',
        startSec: 15,
        endSec: 30,
        speakerId: 'p1',
        speakerName: 'Claire Moreau',
        text: 'Send the launch notes tomorrow.',
        highlightedPhrase: 'Send the launch notes tomorrow',
        actionItemId: 'a1',
        emotion: 'Focused',
        facialCue: 'Steady gaze',
        emotionIntensity: 84,
      },
    ],
    actionItems: [
      {
        id: 'a1',
        task: 'Send the launch notes',
        assigneeId: 'p1',
        assigneeName: 'Claire Moreau',
        priority: 'High',
        dueDate: 'Tomorrow',
        sourceEntryId: 't1',
        timestampSec: 15,
        completed: false,
      },
    ],
    summary: null,
    stage: 'transcript_ready',
  },
  {
    id: 'm2',
    title: 'Design Review',
    recordedAt: 'Nov 13',
    durationSec: 90,
    participants: [],
    transcript: [],
    actionItems: [],
    summary: null,
    stage: 'transcript_ready',
  },
];

test('validateChatInput rejects blank messages and accepts valid questions', () => {
  assert.equal(validateChatInput('   ').valid, false);
  assert.equal(validateChatInput('Who owns launch notes?').valid, true);
});

test('buildMeetingsContextPayload filters by current meeting or includes all meetings', () => {
  const currentOnly = buildMeetingsContextPayload(mockMeetings, 'm1', 'current');
  assert.equal(currentOnly.length, 1);
  assert.equal(currentOnly[0].title, 'Sprint Sync');
  assert.equal(currentOnly[0].transcript[0].timestamp, '00:15');

  const all = buildMeetingsContextPayload(mockMeetings, 'm1', 'all');
  assert.equal(all.length, 2);
});

test('buildReunionChatSystemInstruction embeds role and meeting JSON context', () => {
  const ctx = buildMeetingsContextPayload(mockMeetings, 'm1', 'current');
  const instruction = buildReunionChatSystemInstruction(ctx);
  assert.ok(instruction.includes('Cadence Reunion Analyst'));
  assert.ok(instruction.includes('Sprint Sync'));
  assert.ok(instruction.includes('Claire Moreau'));
});

test('formatChatHistoryForGemini maps non-empty messages into Gemini parts', () => {
  const messages: ChatMessage[] = [
    { id: '1', role: 'user', text: 'Who spoke first?', timestamp: '10:00' },
    { id: '2', role: 'model', text: 'Claire Moreau spoke at 00:15.', timestamp: '10:00' },
    { id: '3', role: 'user', text: '   ', timestamp: '10:01' },
  ];
  const formatted = formatChatHistoryForGemini(messages);
  assert.equal(formatted.length, 2);
  assert.deepEqual(formatted[0], {
    role: 'user',
    parts: [{ text: 'Who spoke first?' }],
  });
  assert.deepEqual(formatted[1], {
    role: 'model',
    parts: [{ text: 'Claire Moreau spoke at 00:15.' }],
  });
});
