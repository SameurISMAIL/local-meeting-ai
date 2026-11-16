import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExecutiveSummaryScript,
  clampSpeechRate,
  pickPreferredVoice,
} from './speechLogic';

test('buildExecutiveSummaryScript returns trimmed summary or empty string', () => {
  assert.equal(buildExecutiveSummaryScript('   '), '');
  assert.equal(
    buildExecutiveSummaryScript('  Team aligned on December 3 launch.  '),
    'Team aligned on December 3 launch.'
  );
});

test('buildExecutiveSummaryScript optionally appends key decisions', () => {
  const script = buildExecutiveSummaryScript(
    'Summary body.',
    ['Hold launch date', 'Ship accessibility fixes'],
    true
  );
  assert.equal(
    script,
    'Summary body. Key decisions: Decision 1: Hold launch date. Decision 2: Ship accessibility fixes'
  );
});

test('clampSpeechRate keeps playback rate within 0.5x to 2.0x', () => {
  assert.equal(clampSpeechRate(0.2), 0.5);
  assert.equal(clampSpeechRate(1.25), 1.25);
  assert.equal(clampSpeechRate(3.4), 2);
  assert.equal(clampSpeechRate(Number.NaN), 1);
});

test('pickPreferredVoice prioritizes default English then local English voice', () => {
  const voices = [
    { name: 'French', lang: 'fr-FR', default: false, localService: true },
    { name: 'English Remote', lang: 'en-US', default: false, localService: false },
    { name: 'English Local', lang: 'en-GB', default: false, localService: true },
    { name: 'English Default', lang: 'en-US', default: true, localService: false },
  ];
  assert.equal(pickPreferredVoice(voices)?.name, 'English Default');
  assert.equal(
    pickPreferredVoice(voices.slice(0, 3))?.name,
    'English Local'
  );
  assert.equal(pickPreferredVoice([]), undefined);
});
