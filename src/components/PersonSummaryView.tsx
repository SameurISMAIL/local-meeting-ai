import { useMemo } from 'react';
import { Check, Printer } from 'lucide-react';
import type { MeetingAnalysis } from '../types/meeting';
import {
  aggregateParticipantMetrics,
  formatTimestamp,
} from '../utils/meetingLogic';
import { triggerBrowserPrint } from '../utils/printLogic';
import { EmotionSignal } from './EmotionSignal';
import { MeetingMoodTimeline } from './MeetingMoodTimeline';
import { MeetingPrintReport } from './MeetingPrintReport';
import { ParticipantAvatar } from './ParticipantAvatar';
import { SummaryAudioPlayer } from './SummaryAudioPlayer';

interface PersonSummaryViewProps {
  meeting: MeetingAnalysis;
  onToggleAction: (actionId: string) => void;
  onJumpToTranscript: (entryId: string, timestampSec: number) => void;
}

export function PersonSummaryView({
  meeting,
  onToggleAction,
  onJumpToTranscript,
}: PersonSummaryViewProps) {
  const metricsByPerson = useMemo(
    () =>
      aggregateParticipantMetrics(
        meeting.participants,
        meeting.transcript,
        meeting.actionItems
      ),
    [meeting.participants, meeting.transcript, meeting.actionItems]
  );

  const handlePrintExport = () => {
    triggerBrowserPrint(meeting.title);
  };

  const hasPrintableContent =
    meeting.transcript.length > 0 || meeting.actionItems.length > 0;

  if (!meeting.summary) {
    return (
      <>
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-4 print:hidden">
          <div className="max-w-md mx-auto space-y-2">
            <h2 className="text-lg font-semibold text-slate-900">
              Local summary is a later stage
            </h2>
            <p className="text-sm text-slate-600">
              This stage only transcribes speech locally. Summaries and action
              extraction are not available yet, and no cloud AI service is used.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {hasPrintableContent && (
              <button
                type="button"
                onClick={handlePrintExport}
                aria-label="Export meeting transcript and action items as PDF"
                data-testid="export-pdf-button"
                className="px-4 py-2.5 inline-flex items-center gap-2 text-sm font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors whitespace-nowrap"
              >
                <Printer className="h-4 w-4 text-slate-600" aria-hidden="true" />
                <span>Export PDF</span>
              </button>
            )}
          </div>
        </div>
        <MeetingPrintReport meeting={meeting} />
      </>
    );
  }

  return (
    <>
      <div className="space-y-6 print:hidden">
        {/* Executive Summary & Decisions */}
        <section
          aria-labelledby="exec-summary-heading"
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2
              id="exec-summary-heading"
              className="text-base font-semibold text-slate-900"
            >
              Meeting Executive Summary
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <SummaryAudioPlayer
                meetingId={meeting.id}
                executiveSummary={meeting.summary.executiveSummary}
                keyDecisions={meeting.summary.keyDecisions}
              />
              <button
                type="button"
                onClick={handlePrintExport}
                aria-label="Export meeting transcript and action items as PDF"
                data-testid="export-pdf-button"
                className="px-3 py-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Printer className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
                <span>Export PDF</span>
              </button>
            </div>
          </div>

        <p className="text-sm leading-relaxed text-slate-700 max-w-4xl">
          {meeting.summary.executiveSummary}
        </p>

        {meeting.summary.keyDecisions.length > 0 && (
          <div className="pt-4 border-t border-slate-200">
            <h3 className="text-xs font-semibold text-slate-500 mb-2.5">
              Key Decisions
            </h3>
            <ul className="space-y-1.5">
              {meeting.summary.keyDecisions.map((decision, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2.5 text-sm text-slate-800"
                >
                  <span className="font-mono tabular-nums text-xs text-slate-400 mt-0.5">
                    0{idx + 1}.
                  </span>
                  <span>{decision}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Meeting Mood Timeline (Recharts) */}
      <MeetingMoodTimeline
        participants={meeting.participants}
        transcript={meeting.transcript}
        durationSec={meeting.durationSec}
      />

      {/* Per-Person Tasks, Actions & Facial Emotions */}
      <section aria-labelledby="person-breakdown-heading" className="space-y-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2
            id="person-breakdown-heading"
            className="text-base font-semibold text-slate-900"
          >
            Tasks, Actions &amp; Facial Emotions by Participant
          </h2>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {meeting.participants.length} participants
          </span>
        </div>

        <div className="space-y-4">
          {meeting.participants.map((person) => {
            const metrics = metricsByPerson[person.id];
            const personSummary = meeting.summary?.personSummaries.find(
              (ps) =>
                ps.participantId === person.id ||
                ps.participantName.toLowerCase() === person.name.toLowerCase()
            );
            const personActions = meeting.actionItems.filter(
              (a) => a.assigneeId === person.id
            );

            return (
              <article
                key={person.id}
                data-testid={`person-card-${person.id}`}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden"
              >
                {/* Participant Header */}
                <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <ParticipantAvatar
                      name={person.name}
                      imageUrl={person.imageUrl}
                      size="lg"
                    />
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-slate-900 truncate">
                        {person.name}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        {person.role && (
                          <>
                            <span>{person.role}</span>
                            <span aria-hidden="true">·</span>
                          </>
                        )}
                        <span className="font-mono tabular-nums">
                          {formatTimestamp(metrics?.speakingSeconds ?? 0)} talk time (
                          {metrics?.speakingSharePercent ?? 0}%)
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {metrics?.turnCount ?? 0} turns
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:items-end gap-1 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">
                        Dominant face emotion:
                      </span>
                      <EmotionSignal
                        emotion={
                          personSummary?.dominantEmotion ??
                          metrics?.dominantEmotion ??
                          'Neutral'
                        }
                      />
                    </div>
                    <p className="text-xs text-slate-500">
                      Trajectory:{' '}
                      <span className="font-medium text-slate-700">
                        {personSummary?.emotionTrajectory ||
                          (metrics?.emotionSequence.length
                            ? metrics.emotionSequence.join(' → ')
                            : 'Neutral')}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Two-Column Body: Facial Observation & Contribution vs Tasks & Actions */}
                <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
                  <div className="lg:col-span-5 p-5 space-y-4">
                    <div>
                      <h4 className="text-xs font-semibold text-slate-500 mb-1">
                        Facial Emotion Analysis
                      </h4>
                      <p className="text-sm text-slate-700 leading-relaxed">
                        {personSummary?.facialObservation ||
                          'Observed speaking turns captured from video frames.'}
                      </p>
                    </div>
                    <div className="pt-3 border-t border-slate-100">
                      <h4 className="text-xs font-semibold text-slate-500 mb-1">
                        Key Contribution
                      </h4>
                      <p className="text-sm text-slate-700 leading-relaxed">
                        {personSummary?.contributionSummary ||
                          'Contributed during the recorded session.'}
                      </p>
                    </div>
                  </div>

                  <div className="lg:col-span-7 p-5 space-y-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <h4 className="text-xs font-semibold text-slate-500">
                        Tasks &amp; Action Summary
                      </h4>
                      <span className="text-xs font-mono tabular-nums text-slate-500">
                        {metrics?.completedActions ?? 0} /{' '}
                        {metrics?.totalActions ?? 0} done
                      </span>
                    </div>

                    {personSummary?.actionSummary && (
                      <p className="text-sm text-slate-700 leading-relaxed">
                        {personSummary.actionSummary}
                      </p>
                    )}

                    {personActions.length === 0 ? (
                      <p className="text-xs text-slate-500 py-2">
                        No tasks assigned to {person.name} in this meeting.
                      </p>
                    ) : (
                      <ul className="divide-y divide-slate-100 border-t border-slate-200">
                        {personActions.map((item) => (
                          <li
                            key={item.id}
                            className="py-3 flex items-start justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                          >
                            <div className="flex items-start gap-2.5 min-w-0">
                              <button
                                type="button"
                                role="checkbox"
                                aria-checked={item.completed}
                                aria-label={`Mark "${item.task}" as ${
                                  item.completed ? 'incomplete' : 'complete'
                                }`}
                                onClick={() => onToggleAction(item.id)}
                                className={`mt-0.5 h-4.5 w-4.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                  item.completed
                                    ? 'bg-emerald-600 border-emerald-600 text-white'
                                    : 'bg-white border-slate-300 hover:border-blue-600'
                                }`}
                              >
                                {item.completed && (
                                  <Check className="h-3 w-3" aria-hidden="true" />
                                )}
                              </button>
                              <div className="min-w-0">
                                <p
                                  className={`text-sm font-medium ${
                                    item.completed
                                      ? 'line-through text-slate-400'
                                      : 'text-slate-900'
                                  }`}
                                >
                                  {item.task}
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                                  <span
                                    className={
                                      item.priority === 'High'
                                        ? 'font-medium text-red-700'
                                        : item.priority === 'Medium'
                                          ? 'font-medium text-amber-700'
                                          : 'text-slate-600'
                                    }
                                  >
                                    {item.priority} priority
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span>Due {item.dueDate}</span>
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                onJumpToTranscript(
                                  item.sourceEntryId,
                                  item.timestampSec
                                )
                              }
                              aria-label={`View transcript at ${formatTimestamp(
                                item.timestampSec
                              )}`}
                              className="px-2 py-1 text-xs font-mono tabular-nums text-slate-600 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 rounded transition-colors whitespace-nowrap shrink-0"
                            >
                              {formatTimestamp(item.timestampSec)}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
      </div>
      <MeetingPrintReport meeting={meeting} />
    </>
  );
}
