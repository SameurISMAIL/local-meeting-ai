import { useMemo } from 'react';
import type { MeetingAnalysis } from '../types/meeting';
import { buildPrintableMeetingReportData } from '../utils/printLogic';

interface MeetingPrintReportProps {
  meeting: MeetingAnalysis;
}

export function MeetingPrintReport({ meeting }: MeetingPrintReportProps) {
  const report = useMemo(
    () => buildPrintableMeetingReportData(meeting),
    [meeting]
  );

  const exportDate = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(new Date()),
    []
  );

  return (
    <section
      aria-label="Printable meeting transcript and action items report"
      data-testid="print-report"
      className="hidden print:block text-slate-900 bg-white space-y-6 text-[11pt] leading-snug"
    >
      {/* Document Header */}
      <header className="border-b-2 border-slate-900 pb-4 space-y-2">
        <div className="flex items-center justify-between text-[9pt] text-slate-600">
          <span className="font-bold tracking-tight text-slate-900 uppercase">
            Cadence · Meeting Export
          </span>
          <span className="font-mono tabular-nums">Exported {exportDate}</span>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {report.title}
        </h1>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9.5pt] text-slate-600">
          <span>{report.recordedAt}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            {report.durationLabel} duration
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            {report.participantCount} participants
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            {report.completedActionsCount} / {report.totalActionsCount} actions
            completed
          </span>
        </div>

        {report.participants.length > 0 && (
          <p className="text-[9.5pt] text-slate-700 pt-1">
            <span className="font-semibold text-slate-900">Participants: </span>
            {report.participants
              .map((p) => (p.role ? `${p.name} (${p.role})` : p.name))
              .join(' · ')}
          </p>
        )}
      </header>

      {/* Executive Summary & Decisions (if generated) */}
      {(report.executiveSummary || report.keyDecisions.length > 0) && (
        <section className="print-avoid-break border border-slate-300 rounded-lg p-4 space-y-3">
          <h2 className="print-heading-keep text-xs font-bold uppercase tracking-wider text-slate-700">
            Executive Summary &amp; Key Decisions
          </h2>
          {report.executiveSummary && (
            <p className="text-[10.5pt] leading-relaxed text-slate-800">
              {report.executiveSummary}
            </p>
          )}
          {report.keyDecisions.length > 0 && (
            <ul className="space-y-1 pt-2 border-t border-slate-200 text-[10pt] text-slate-800">
              {report.keyDecisions.map((decision, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="font-mono tabular-nums text-[9pt] text-slate-500 mt-0.5">
                    0{index + 1}.
                  </span>
                  <span>{decision}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Action Items */}
      <section className="space-y-2.5">
        <div className="print-heading-keep flex items-baseline justify-between border-b border-slate-300 pb-1.5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
            Action Items
          </h2>
          <span className="text-[9pt] font-mono tabular-nums text-slate-600">
            {report.completedActionsCount} / {report.totalActionsCount} done
          </span>
        </div>

        {report.actionItems.length === 0 ? (
          <p className="text-[10pt] text-slate-600 py-2">
            No action items recorded for this meeting.
          </p>
        ) : (
          <table className="w-full border-collapse text-[9.5pt]">
            <thead>
              <tr className="border-b border-slate-300 text-left text-[8.5pt] uppercase tracking-wide text-slate-600">
                <th className="py-1.5 pr-2 font-semibold w-16">Status</th>
                <th className="py-1.5 pr-3 font-semibold">Action Item</th>
                <th className="py-1.5 pr-3 font-semibold w-32">Owner</th>
                <th className="py-1.5 pr-2 font-semibold w-16">Priority</th>
                <th className="py-1.5 pr-2 font-semibold w-28">Due</th>
                <th className="py-1.5 font-semibold w-14 text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {report.actionItems.map((item) => (
                <tr key={item.id} className="print-avoid-break align-top">
                  <td className="py-2 pr-2 font-mono text-[8.5pt] whitespace-nowrap">
                    {item.completed ? '[✓] Done' : '[ ] Open'}
                  </td>
                  <td
                    className={`py-2 pr-3 ${
                      item.completed
                        ? 'line-through text-slate-500'
                        : 'text-slate-900 font-medium'
                    }`}
                  >
                    {item.task}
                  </td>
                  <td className="py-2 pr-3 text-slate-800">
                    {item.assigneeName}
                  </td>
                  <td className="py-2 pr-2 font-medium text-slate-800">
                    {item.priority}
                  </td>
                  <td className="py-2 pr-2 text-slate-700">{item.dueDate}</td>
                  <td className="py-2 text-right font-mono tabular-nums text-slate-700">
                    {item.timestampLabel}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Full Meeting Transcript */}
      <section className="space-y-2.5 pt-2">
        <div className="print-heading-keep flex items-baseline justify-between border-b border-slate-300 pb-1.5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
            Meeting Transcript
          </h2>
          <span className="text-[9pt] font-mono tabular-nums text-slate-600">
            {report.transcript.length} speaking turns
          </span>
        </div>

        {report.transcript.length === 0 ? (
          <p className="text-[10pt] text-slate-600 py-2">
            No transcript turns recorded for this meeting.
          </p>
        ) : (
          <div className="divide-y divide-slate-200">
            {report.transcript.map((entry) => (
              <article
                key={entry.id}
                className="print-avoid-break py-3 flex items-start gap-4"
              >
                <div className="w-24 shrink-0 font-mono tabular-nums text-[9pt] text-slate-600 pt-0.5">
                  {entry.startLabel} – {entry.endLabel}
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="text-[10pt]">
                      <span className="font-semibold text-slate-900">
                        {entry.speakerName}
                      </span>
                      {entry.speakerRole && (
                        <span className="text-slate-600">
                          {' '}
                          · {entry.speakerRole}
                        </span>
                      )}
                    </div>
                    {entry.emotionAnalyzed === false ? (
                      <span className="text-[8.5pt] text-slate-600">
                        Emotion not analyzed
                      </span>
                    ) : (
                      <span className="text-[8.5pt] font-mono tabular-nums text-slate-600">
                        {entry.emotion} ({entry.emotionIntensity}%)
                      </span>
                    )}
                  </div>

                  <p className="text-[10pt] leading-relaxed text-slate-900">
                    {entry.highlightParts ? (
                      <>
                        {entry.highlightParts.before}
                        <mark className="bg-amber-100 text-slate-950 px-0.5 border-b border-amber-500">
                          {entry.highlightParts.match}
                        </mark>
                        {entry.highlightParts.after}
                      </>
                    ) : (
                      entry.text
                    )}
                  </p>

                  {entry.emotionAnalyzed !== false && entry.facialCue && (
                    <p className="text-[8.5pt] text-slate-600">
                      Face cue: {entry.facialCue}
                    </p>
                  )}

                  {entry.linkedActionTask && (
                    <p className="text-[9pt] font-medium text-slate-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
                      Action: {entry.linkedActionTask}
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
