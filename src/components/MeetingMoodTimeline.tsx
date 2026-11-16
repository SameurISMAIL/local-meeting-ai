import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { EmotionLabel, Participant, TranscriptEntry } from '../types/meeting';
import { buildMoodTimelineData } from '../utils/meetingLogic';

interface MeetingMoodTimelineProps {
  participants: Participant[];
  transcript: TranscriptEntry[];
  durationSec: number;
}

const SERIES_COLORS = [
  '#1D4ED8', // Cobalt Blue
  '#0F766E', // Deep Teal
  '#D97706', // Warm Amber
  '#6D28D9', // Indigo Violet
  '#DC2626', // Crimson
  '#0369A1', // Cerulean
  '#4D7C0F', // Olive Green
  '#BE185D', // Berry
];

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    dataKey?: string;
    name?: string;
    value?: number;
    color?: string;
    payload?: {
      bucketIndex: number;
      rangeLabel: string;
    };
  }>;
  bucketEmotions: Record<number, Record<string, EmotionLabel[]>>;
}

function MoodTooltip({ active, payload, bucketEmotions }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const first = payload[0];
  const bucketIndex = first?.payload?.bucketIndex ?? 0;
  const rangeLabel = first?.payload?.rangeLabel ?? '';

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm px-3.5 py-2.5 text-xs space-y-1.5 min-w-[200px]">
      <p className="font-mono tabular-nums font-semibold text-slate-900 border-b border-slate-100 pb-1">
        Window {rangeLabel}
      </p>
      <ul className="space-y-1">
        {payload.map((entry) => {
          const participantId = String(entry.dataKey ?? '');
          const emotions = bucketEmotions[bucketIndex]?.[participantId] ?? [];
          return (
            <li
              key={participantId}
              className="flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: entry.color }}
                  aria-hidden="true"
                />
                <span className="font-medium text-slate-800 truncate">
                  {entry.name}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 font-mono tabular-nums">
                <span className="font-semibold text-slate-900">
                  {entry.value}%
                </span>
                {emotions.length > 0 && (
                  <span className="font-sans text-slate-500">
                    ({emotions.join(', ')})
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function MeetingMoodTimeline({
  participants,
  transcript,
  durationSec,
}: MeetingMoodTimelineProps) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const analyzedTranscript = useMemo(
    () => transcript.filter((entry) => entry.emotionAnalyzed !== false),
    [transcript]
  );

  const { points, overallAverages, bucketEmotions } = useMemo(
    () => buildMoodTimelineData(participants, analyzedTranscript, durationSec, 5),
    [participants, analyzedTranscript, durationSec]
  );

  const toggleParticipantSeries = (participantId: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(participantId)) {
        next.delete(participantId);
      } else if (next.size < participants.length - 1) {
        next.add(participantId);
      }
      return next;
    });
  };

  return (
    <section
      aria-labelledby="mood-timeline-heading"
      data-testid="meeting-mood-timeline"
      className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
        <div>
          <h2
            id="mood-timeline-heading"
            className="text-base font-semibold text-slate-900"
          >
            Meeting Mood Timeline
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {analyzedTranscript.length === 0
              ? 'Emotion and attention are not analyzed in the local transcription stage.'
              : 'Average observed facial emotion intensity (%) across meeting time windows per participant.'}
          </p>
        </div>

        {hiddenIds.size > 0 && (
          <button
            type="button"
            onClick={() => setHiddenIds(new Set())}
            className="text-xs font-medium text-blue-700 hover:underline self-start sm:self-auto whitespace-nowrap"
          >
            Show all participants
          </button>
        )}
      </div>

      {/* Interactive Participant Legend with Overall Averages */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {participants.map((person, index) => {
          const color = SERIES_COLORS[index % SERIES_COLORS.length];
          const avg = overallAverages[person.id];
          const isHidden = hiddenIds.has(person.id);

          return (
            <button
              key={person.id}
              type="button"
              aria-pressed={!isHidden}
              onClick={() => toggleParticipantSeries(person.id)}
              className={`px-3 py-1.5 inline-flex items-center gap-2 text-xs rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                isHidden
                  ? 'bg-slate-50 border-slate-200 text-slate-400'
                  : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50'
              }`}
            >
              <span
                className="h-2.5 w-2.5 rounded-xs shrink-0"
                style={{
                  backgroundColor: isHidden ? '#CBD5E1' : color,
                }}
                aria-hidden="true"
              />
              <span className="font-medium">{person.name}</span>
              <span className="font-mono tabular-nums text-slate-500">
                {avg !== null ? `${avg}% avg` : 'No turns'}
              </span>
            </button>
          );
        })}
      </div>

      {analyzedTranscript.length === 0 ? (
        <div className="h-56 flex items-center justify-center border border-dashed border-slate-200 rounded-lg text-sm text-slate-500">
          No transcript emotion observations available yet to plot the mood
          timeline.
        </div>
      ) : (
        <div className="h-[260px] w-full pt-2">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart
              data={points}
              margin={{ top: 10, right: 16, left: -12, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#E2E8F0"
              />
              <XAxis
                dataKey="bucketLabel"
                tick={{ fontSize: 12, fill: '#64748B', fontFamily: 'IBM Plex Mono, monospace' }}
                axisLine={{ stroke: '#CBD5E1' }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(val) => `${val}%`}
                tick={{ fontSize: 12, fill: '#64748B', fontFamily: 'IBM Plex Mono, monospace' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={<MoodTooltip bucketEmotions={bucketEmotions} />}
              />
              {participants.map((person, index) => {
                if (hiddenIds.has(person.id)) return null;
                const color = SERIES_COLORS[index % SERIES_COLORS.length];
                return (
                  <Line
                    key={person.id}
                    type="monotone"
                    dataKey={person.id}
                    name={person.name}
                    stroke={color}
                    strokeWidth={2.25}
                    connectNulls
                    dot={{ r: 4, fill: color, strokeWidth: 2, stroke: '#FFFFFF' }}
                    activeDot={{ r: 6, fill: color, strokeWidth: 2, stroke: '#FFFFFF' }}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
