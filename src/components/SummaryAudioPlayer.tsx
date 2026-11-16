import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Square, Volume2 } from 'lucide-react';
import {
  buildExecutiveSummaryScript,
  clampSpeechRate,
  isSpeechSynthesisSupported,
  pickPreferredVoice,
} from '../utils/speechLogic';

type PlaybackState = 'idle' | 'speaking' | 'paused';

interface SummaryAudioPlayerProps {
  meetingId: string;
  executiveSummary: string;
  keyDecisions: string[];
}

export function SummaryAudioPlayer({
  meetingId,
  executiveSummary,
  keyDecisions,
}: SummaryAudioPlayerProps) {
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [rate, setRate] = useState<number>(1);
  const [audioError, setAudioError] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const supported = isSpeechSynthesisSupported();
  const script = buildExecutiveSummaryScript(executiveSummary, keyDecisions, false);

  useEffect(() => {
    return () => {
      if (isSpeechSynthesisSupported()) {
        window.speechSynthesis.cancel();
      }
      utteranceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (isSpeechSynthesisSupported()) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
    setPlaybackState('idle');
    setAudioError(null);
  }, [meetingId, executiveSummary]);

  const handleStop = () => {
    if (isSpeechSynthesisSupported()) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
    setPlaybackState('idle');
  };

  const handlePlayOrResume = () => {
    if (!supported) {
      setAudioError('Audio read-back is not supported by this browser.');
      return;
    }
    if (!script) {
      setAudioError('No executive summary text available to read.');
      return;
    }

    setAudioError(null);

    if (playbackState === 'paused') {
      window.speechSynthesis.resume();
      setPlaybackState('speaking');
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new window.SpeechSynthesisUtterance(script);
    utterance.rate = clampSpeechRate(rate);

    const voices = window.speechSynthesis.getVoices();
    const preferred = pickPreferredVoice(voices);
    if (preferred) {
      utterance.voice = preferred;
      utterance.lang = preferred.lang;
    }

    utterance.onstart = () => {
      setPlaybackState('speaking');
    };
    utterance.onpause = () => {
      setPlaybackState('paused');
    };
    utterance.onresume = () => {
      setPlaybackState('speaking');
    };
    utterance.onend = () => {
      utteranceRef.current = null;
      setPlaybackState('idle');
    };
    utterance.onerror = (event) => {
      utteranceRef.current = null;
      setPlaybackState('idle');
      if (event.error !== 'canceled' && event.error !== 'interrupted') {
        setAudioError('Speech synthesis could not start in this browser.');
      }
    };

    utteranceRef.current = utterance;
    setPlaybackState('speaking');
    window.speechSynthesis.speak(utterance);
  };

  const handlePause = () => {
    if (!supported || playbackState !== 'speaking') return;
    window.speechSynthesis.pause();
    setPlaybackState('paused');
  };

  const handleRateChange = (nextRate: number) => {
    const safeRate = clampSpeechRate(nextRate);
    setRate(safeRate);
    if (playbackState !== 'idle') {
      handleStop();
    }
  };

  if (!supported) {
    return (
      <span className="text-xs text-slate-400 whitespace-nowrap">
        Audio read-back unavailable
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {playbackState === 'idle' && (
        <button
          type="button"
          disabled={!script}
          onClick={handlePlayOrResume}
          aria-label="Listen to executive summary"
          className="px-3 py-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Volume2 className="h-3.5 w-3.5 text-blue-700" aria-hidden="true" />
          <span>Listen to Summary</span>
        </button>
      )}

      {playbackState === 'speaking' && (
        <>
          <button
            type="button"
            onClick={handlePause}
            aria-label="Pause summary read-back"
            className="px-3 py-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Pause className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Pause Audio</span>
          </button>
          <button
            type="button"
            onClick={handleStop}
            aria-label="Stop summary read-back"
            className="px-2.5 py-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Square className="h-3 w-3 fill-current" aria-hidden="true" />
            <span>Stop</span>
          </button>
        </>
      )}

      {playbackState === 'paused' && (
        <>
          <button
            type="button"
            onClick={handlePlayOrResume}
            aria-label="Resume summary read-back"
            className="px-3 py-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
            <span>Resume Audio</span>
          </button>
          <button
            type="button"
            onClick={handleStop}
            aria-label="Stop summary read-back"
            className="px-2.5 py-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Square className="h-3 w-3 fill-current" aria-hidden="true" />
            <span>Stop</span>
          </button>
        </>
      )}

      <select
        value={rate}
        onChange={(e) => handleRateChange(Number(e.target.value))}
        aria-label="Playback speed"
        className="h-[30px] px-2 text-xs font-mono tabular-nums text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
      >
        <option value={0.9}>0.9x</option>
        <option value={1}>1x</option>
        <option value={1.25}>1.25x</option>
        <option value={1.5}>1.5x</option>
      </select>

      {audioError && (
        <span role="status" className="text-xs text-amber-700">
          {audioError}
        </span>
      )}
    </div>
  );
}
