import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeLiveChunkResults,
  pickSupportedRecorderMimeType,
  validateLiveSessionStart,
} from './liveSessionLogic';
import type { ActionItem, TranscriptEntry } from '../types/meeting';

test('pickSupportedRecorderMimeType selects best supported video/audio mime type', () => {
  const picked = pickSupportedRecorderMimeType(
    (mime) => mime === 'video/webm;codecs=vp9,opus' || mime === 'video/webm'
  );
  assert.equal(picked, 'video/webm;codecs=vp9,opus');

  assert.equal(pickSupportedRecorderMimeType(() => false), '');
});

test('validateLiveSessionStart enforces title and participants with face photos', () => {
  assert.equal(validateLiveSessionStart('', []).valid, false);
  assert.equal(
    validateLiveSessionStart('Sprint Review', [
      { id: 'p1', name: 'Claire', imageUrl: '' },
    ]).valid,
    false
  );
  assert.equal(
    validateLiveSessionStart('Sprint Review', [
      { id: 'p1', name: 'Claire', imageUrl: '/avatar.jpg' },
    ]).valid,
    true
  );
});

test('mergeLiveChunkResults offsets timestamps, deduplicates IDs, and links action items', () => {
  const existingEntry: TranscriptEntry = {
    id: 'live-tr-1-1',
    startSec: 0,
    endSec: 5,
    speakerId: 'p1',
    speakerName: 'Claire',
    text: 'Opening remarks.',
    emotion: 'Focused',
    facialCue: 'Steady gaze',
    emotionIntensity: 80,
  };
  const existingAction: ActionItem = {
    id: 'live-act-1-1',
    task: 'Initial task',
    assigneeId: 'p1',
    assigneeName: 'Claire',
    priority: 'Medium',
    dueDate: 'Today',
    sourceEntryId: 'live-tr-1-1',
    timestampSec: 2,
    completed: false,
  };

  const merged = mergeLiveChunkResults(
    [existingEntry],
    [existingAction],
    {
      transcript: [
        {
          id: 'tr-1',
          startSec: 1,
          endSec: 4,
          speakerId: 'p2',
          speakerName: 'Marcus',
          text: 'I will deploy the staging build tomorrow.',
          highlightedPhrase: 'deploy the staging build tomorrow',
          emotion: 'Confident',
          facialCue: 'Firm nod',
          emotionIntensity: 86,
        },
        {
          id: 'tr-2',
          startSec: 4,
          endSec: 5,
          speakerId: 'p1',
          speakerName: 'Claire',
          text: '   ',
          emotion: 'Neutral',
          facialCue: 'Listening',
          emotionIntensity: 50,
        },
      ],
      actionItems: [
        {
          id: 'act-1',
          task: 'Deploy staging build',
          assigneeId: 'p2',
          assigneeName: 'Marcus',
          priority: 'High',
          dueDate: 'Tomorrow',
          sourceEntryId: 'tr-1',
          timestampSec: 2,
          completed: false,
        },
      ],
    },
    12,
    2
  );

  assert.equal(merged.transcript.length, 2);
  assert.equal(merged.transcript[1].id, 'live-tr-2-1');
  assert.equal(merged.transcript[1].startSec, 13);
  assert.equal(merged.transcript[1].endSec, 16);
  assert.equal(merged.transcript[1].actionItemId, 'live-act-2-1');
  assert.equal(merged.actionItems.length, 2);
  assert.equal(merged.actionItems[1].sourceEntryId, 'live-tr-2-1');
  assert.equal(merged.actionItems[1].timestampSec, 14);
});
