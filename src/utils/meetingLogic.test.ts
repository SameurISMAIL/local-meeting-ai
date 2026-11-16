import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addManualActionItem,
  aggregateParticipantMetrics,
  buildMoodTimelineData,
  filterTranscriptEntries,
  formatTimestamp,
  splitTextAroundHighlight,
  toggleActionItemStatus,
  validateMeetingSubmission,
  validateParticipantInput,
} from './meetingLogic';
import type { ActionItem, Participant, TranscriptEntry } from '../types/meeting';

const sampleParticipants: Participant[] = [
  { id: 'p1', name: 'Claire Moreau', role: 'Product Lead', imageUrl: '/claire.jpg' },
  { id: 'p2', name: 'Marcus Chen', role: 'Staff Engineer', imageUrl: '/marcus.jpg' },
];

const sampleEntries: TranscriptEntry[] = [
  {
    id: 't1',
    startSec: 12,
    endSec: 32,
    speakerId: 'p1',
    speakerName: 'Claire Moreau',
    text: 'Let us finalize the Q4 rollout checklist before Friday afternoon.',
    highlightedPhrase: 'finalize the Q4 rollout checklist before Friday afternoon',
    actionItemId: 'a1',
    emotion: 'Focused',
    facialCue: 'Steady eye contact, slight forward lean',
    emotionIntensity: 82,
  },
  {
    id: 't2',
    startSec: 35,
    endSec: 55,
    speakerId: 'p2',
    speakerName: 'Marcus Chen',
    text: 'I am concerned about the database migration latency on legacy shards.',
    emotion: 'Concerned',
    facialCue: 'Furrowed brow, pressed lips',
    emotionIntensity: 76,
  },
  {
    id: 't3',
    startSec: 58,
    endSec: 78,
    speakerId: 'p2',
    speakerName: 'Marcus Chen',
    text: 'I will benchmark the migration script on staging tomorrow morning.',
    highlightedPhrase: 'benchmark the migration script on staging tomorrow morning',
    actionItemId: 'a2',
    emotion: 'Confident',
    facialCue: 'Relaxed shoulders, clear nod',
    emotionIntensity: 85,
  },
];

const sampleActions: ActionItem[] = [
  {
    id: 'a1',
    task: 'Finalize the Q4 rollout checklist',
    assigneeId: 'p1',
    assigneeName: 'Claire Moreau',
    priority: 'High',
    dueDate: 'Friday',
    sourceEntryId: 't1',
    timestampSec: 12,
    completed: false,
  },
  {
    id: 'a2',
    task: 'Benchmark migration script on staging',
    assigneeId: 'p2',
    assigneeName: 'Marcus Chen',
    priority: 'High',
    dueDate: 'Tomorrow morning',
    sourceEntryId: 't3',
    timestampSec: 58,
    completed: true,
  },
];

test('formatTimestamp formats mm:ss and hh:mm:ss cleanly', () => {
  assert.equal(formatTimestamp(0), '00:00');
  assert.equal(formatTimestamp(65), '01:05');
  assert.equal(formatTimestamp(3661), '01:01:01');
  assert.equal(formatTimestamp(-5), '00:00');
});

test('validateParticipantInput enforces name and reference face photo', () => {
  assert.equal(validateParticipantInput('', true).valid, false);
  assert.equal(validateParticipantInput('A', true).valid, false);
  assert.equal(validateParticipantInput('Claire', false).valid, false);
  assert.equal(validateParticipantInput('Claire Moreau', true).valid, true);
});

test('validateMeetingSubmission requires title, participants with photos, and video', () => {
  assert.equal(validateMeetingSubmission('', sampleParticipants, true).valid, false);
  assert.equal(validateMeetingSubmission('Weekly Sync', [], true).valid, false);
  assert.equal(validateMeetingSubmission('Weekly Sync', sampleParticipants, false).valid, false);
  assert.equal(validateMeetingSubmission('Weekly Sync', sampleParticipants, true).valid, true);
});

test('filterTranscriptEntries filters by speaker, emotion, action items, and search query', () => {
  const bySpeaker = filterTranscriptEntries(sampleEntries, {
    participantId: 'p2',
    emotion: 'all',
    actionOnly: false,
    query: '',
  });
  assert.equal(bySpeaker.length, 2);

  const actionOnly = filterTranscriptEntries(sampleEntries, {
    participantId: 'all',
    emotion: 'all',
    actionOnly: true,
    query: '',
  });
  assert.equal(actionOnly.length, 2);
  assert.deepEqual(
    actionOnly.map((e) => e.id),
    ['t1', 't3']
  );

  const byQuery = filterTranscriptEntries(sampleEntries, {
    participantId: 'all',
    emotion: 'Concerned',
    actionOnly: false,
    query: 'furrowed',
  });
  assert.equal(byQuery.length, 1);
  assert.equal(byQuery[0].id, 't2');
});

test('aggregateParticipantMetrics calculates speaking shares, emotion sequences, and action counts', () => {
  const metrics = aggregateParticipantMetrics(sampleParticipants, sampleEntries, sampleActions);
  assert.equal(metrics.p1.turnCount, 1);
  assert.equal(metrics.p1.speakingSeconds, 20);
  assert.equal(metrics.p1.dominantEmotion, 'Focused');
  assert.equal(metrics.p1.totalActions, 1);
  assert.equal(metrics.p1.completedActions, 0);

  assert.equal(metrics.p2.turnCount, 2);
  assert.equal(metrics.p2.speakingSeconds, 40);
  assert.deepEqual(metrics.p2.emotionSequence, ['Concerned', 'Confident']);
  assert.equal(metrics.p2.totalActions, 1);
  assert.equal(metrics.p2.completedActions, 1);
  assert.equal(metrics.p1.speakingSharePercent + metrics.p2.speakingSharePercent, 100);
});

test('toggleActionItemStatus flips completion state immutably', () => {
  const next = toggleActionItemStatus(sampleActions, 'a1');
  assert.equal(next[0].completed, true);
  assert.equal(sampleActions[0].completed, false);
});

test('addManualActionItem attaches highlighted action to transcript entry', () => {
  const { entries, actionItems, created } = addManualActionItem(sampleEntries, sampleActions, {
    entryId: 't2',
    taskText: 'Audit legacy shard indexes',
    assigneeId: 'p2',
    assigneeName: 'Marcus Chen',
    priority: 'Medium',
    dueDate: 'Wednesday',
  });
  assert.equal(actionItems.length, 3);
  const updatedEntry = entries.find((e) => e.id === 't2');
  assert.equal(updatedEntry?.actionItemId, created.id);
});

test('splitTextAroundHighlight finds case-insensitive substring match', () => {
  const parts = splitTextAroundHighlight(
    'Let us Finalize the Q4 Rollout Checklist before Friday.',
    'finalize the Q4 rollout checklist'
  );
  assert.ok(parts);
  assert.equal(parts?.before, 'Let us ');
  assert.equal(parts?.match, 'Finalize the Q4 Rollout Checklist');
  assert.equal(parts?.after, ' before Friday.');
});

test('buildMoodTimelineData averages participant emotion intensity across meeting duration buckets', () => {
  const result = buildMoodTimelineData(sampleParticipants, sampleEntries, 90, 3);
  assert.equal(result.points.length, 3);
  assert.equal(result.points[0].bucketLabel, '00:00');
  assert.equal(result.points[0].p1, 82);
  assert.equal(result.points[0].p2, null);
  assert.equal(result.points[1].p2, 76);
  assert.equal(result.points[2].p2, 85);
  assert.equal(result.overallAverages.p1, 82);
  assert.equal(result.overallAverages.p2, 81);
  assert.deepEqual(result.bucketEmotions[1].p2, ['Concerned']);
});

test('buildMoodTimelineData averages multiple turns for the same participant within one bucket', () => {
  const twoTurnsSameBucket: TranscriptEntry[] = [
    { ...sampleEntries[1], startSec: 5, endSec: 15, emotionIntensity: 60 },
    { ...sampleEntries[2], startSec: 18, endSec: 25, emotionIntensity: 90 },
  ];
  const result = buildMoodTimelineData(sampleParticipants, twoTurnsSameBucket, 90, 3);
  assert.equal(result.points[0].p2, 75);
  assert.equal(result.overallAverages.p2, 75);
  assert.equal(result.overallAverages.p1, null);
});

test('buildMoodTimelineData excludes local entries without emotion analysis', () => {
  const localEntry: TranscriptEntry = {
    ...sampleEntries[0],
    speakerId: 'p1',
    emotionIntensity: 0,
    emotionAnalyzed: false,
  };
  const result = buildMoodTimelineData(sampleParticipants, [localEntry], 30, 2);

  assert.equal(result.overallAverages.p1, null);
  assert.ok(result.points.every((point) => point.p1 === null));
});
