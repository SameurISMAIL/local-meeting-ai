export function buildExecutiveSummaryScript(
  executiveSummary: string,
  keyDecisions: string[] = [],
  includeDecisions = false
): string {
  const summary = executiveSummary.trim();
  if (!summary) {
    return '';
  }

  if (!includeDecisions || keyDecisions.length === 0) {
    return summary;
  }

  const decisionsText = keyDecisions
    .map((decision, idx) => `Decision ${idx + 1}: ${decision.trim()}`)
    .filter(Boolean)
    .join('. ');

  return `${summary} Key decisions: ${decisionsText}`;
}

export function clampSpeechRate(rate: number): number {
  if (!Number.isFinite(rate)) {
    return 1;
  }
  return Math.min(2, Math.max(0.5, Math.round(rate * 100) / 100));
}

export function isSpeechSynthesisSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  );
}

export function pickPreferredVoice<
  T extends { lang: string; default?: boolean; localService?: boolean }
>(voices: T[]): T | undefined {
  if (!Array.isArray(voices) || voices.length === 0) {
    return undefined;
  }
  const enDefault = voices.find(
    (v) => v.default && v.lang.toLowerCase().startsWith('en')
  );
  if (enDefault) return enDefault;

  const enLocal = voices.find(
    (v) => v.localService && v.lang.toLowerCase().startsWith('en')
  );
  if (enLocal) return enLocal;

  const anyEn = voices.find((v) => v.lang.toLowerCase().startsWith('en'));
  return anyEn ?? voices[0];
}
