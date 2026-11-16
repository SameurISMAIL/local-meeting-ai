import test from 'node:test';
import assert from 'node:assert/strict';
import type { MeetingAnalysis } from '../types/meeting';
import {
  buildPrintableMeetingReportData,
  buildPrintDocumentTitle,
} from './printLogic';

function createFixtureMeeting(): MeetingAnalysis {
  return {
    id: 'mtg-1',
    title: 'Q4 Launch: Portal / API Readiness?',
    recordedAt: 'Nov 12, 2026 · 09:30',
    durationSec: 465,
    participants: [
      {
        id: 'p1',
        name: 'Claire Moreau',
        role: 'Product Director',
        imageUrl: '/claire.jpg',
      },
      {
        id: 'p2',
        name: 'Marcus Chen',
        role: 'Staff Engineer',
        imageUrl: '/marcus.jpg',
      },
    ],
    transcript: [
      {
        id: 't2',
        startSec: 95,
        endSec: 120,
        speakerId: 'p2',
        speakerName: 'Marcus Chen',
        text: 'I will run an overnight soak test and share percentiles by 09:00.',
        highlightedPhrase: 'run an overnight soak test',
        actionItemId: 'a2',
        emotion: 'Focused',
        facialCue: 'Steady gaze',
        emotionIntensity: 80,
      },
      {
        id: 't1',
        startSec: 14,
        endSec: 40,
        speakerId: 'p1',
        speakerName: 'Claire Moreau',
        text: 'Let us confirm the December 3 date and send the sign-off sheet.',
        highlightedPhrase: 'send the sign-off sheet',
        actionItemId: 'a1',
        emotion: 'Confident',
        facialCue: 'Calm nod',
        emotionIntensity: 85,
      },
    ],
    actionItems: [
      {
        id: 'a1',
        task: 'Send enterprise customer sign-off sheet',
        assigneeId: 'p1',
        assigneeName: 'Claire Moreau',
        priority: 'High',
        dueDate: 'Thursday 17:00',
        sourceEntryId: 't1',
        timestampSec: 14,
        completed: true,
      },
      {
        id: 'a2',
        task: 'Run overnight soak test and share percentiles',
        assigneeId: 'p2',
        assigneeName: 'Marcus Chen',
        priority: 'High',
        dueDate: 'Tomorrow 09:00',
        sourceEntryId: 't2',
        timestampSec: 95,
        completed: false,
      },
    ],
    summary: {
      executiveSummary: 'Team aligned on soak testing before locking release.',
      keyDecisions: ['Run 12-hour soak test before freeze'],
      personSummaries: [],
    },
    stage: 'complete',
  };
}

test('buildPrintDocumentTitle strips unsafe filename chars and formats PDF title', () => {
  assert.equal(
    buildPrintDocumentTitle('Q4 Launch: Portal / API Readiness?'),
    'Q4 Launch Portal API Readiness - Transcript & Action Items'
  );
  assert.equal(
    buildPrintDocumentTitle('   '),
    'Meeting Report - Transcript & Action Items'
  );
});

test('buildPrintableMeetingReportData sorts transcript chronologically and open actions first', () => {
  const report = buildPrintableMeetingReportData(createFixtureMeeting());

  assert.equal(report.durationLabel, '07:45');
  assert.equal(report.totalActionsCount, 2);
  assert.equal(report.completedActionsCount, 1);

  assert.deepEqual(
    report.transcript.map((entry) => entry.id),
    ['t1', 't2']
  );
  assert.equal(report.transcript[0].startLabel, '00:14');
  assert.equal(report.transcript[0].speakerRole, 'Product Director');
  assert.equal(report.transcript[0].highlightParts?.match, 'send the sign-off sheet');
  assert.equal(
    report.transcript[0].linkedActionTask,
    'Send enterprise customer sign-off sheet'
  );

  // Open action item sorts before completed action item
  assert.deepEqual(
    report.actionItems.map((item) => item.id),
    ['a2', 'a1']
  );
  assert.equal(report.actionItems[0].statusLabel, 'Open');
  assert.equal(report.actionItems[1].statusLabel, 'Completed');
});

test('buildPrintableMeetingReportData handles empty summary gracefully', () => {
  const fixture = createFixtureMeeting();
  fixture.summary = null;

  const report = buildPrintableMeetingReportData(fixture);
  assert.equal(report.executiveSummary, null);
  assert.deepEqual(report.keyDecisions, []);
});
