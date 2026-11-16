import {
  AlertCircle,
  CheckCircle2,
  Compass,
  Eye,
  Flame,
  Handshake,
  HelpCircle,
  Minus,
} from 'lucide-react';
import type { EmotionLabel } from '../types/meeting';

interface EmotionSignalProps {
  emotion: EmotionLabel;
  intensity?: number;
  showIntensity?: boolean;
}

const EMOTION_CONFIG: Record<
  EmotionLabel,
  { textColor: string; Icon: typeof CheckCircle2 }
> = {
  Confident: { textColor: 'text-emerald-700', Icon: CheckCircle2 },
  Focused: { textColor: 'text-blue-700', Icon: Eye },
  Enthusiastic: { textColor: 'text-indigo-700', Icon: Flame },
  Supportive: { textColor: 'text-teal-700', Icon: Handshake },
  Concerned: { textColor: 'text-amber-700', Icon: AlertCircle },
  Hesitant: { textColor: 'text-orange-700', Icon: HelpCircle },
  Frustrated: { textColor: 'text-red-700', Icon: Compass },
  Neutral: { textColor: 'text-slate-600', Icon: Minus },
};

export function EmotionSignal({
  emotion,
  intensity,
  showIntensity = false,
}: EmotionSignalProps) {
  const config = EMOTION_CONFIG[emotion] ?? EMOTION_CONFIG.Neutral;
  const Icon = config.Icon;

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap shrink-0">
      <Icon className={`h-3.5 w-3.5 ${config.textColor}`} aria-hidden="true" />
      <span className={config.textColor}>{emotion}</span>
      {showIntensity && typeof intensity === 'number' && (
        <span className="font-mono tabular-nums text-slate-400">
          {intensity}%
        </span>
      )}
    </span>
  );
}
