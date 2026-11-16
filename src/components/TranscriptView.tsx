import { useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookmarkPlus,
  CheckSquare,
  Search,
} from 'lucide-react';
import type {
  ActionPriority,
  MeetingAnalysis,
  Participant,
} from '../types/meeting';
import {
  filterTranscriptEntries,
  formatTimestamp,
  splitTextAroundHighlight,
} from '../utils/meetingLogic';
import { EmotionSignal } from './EmotionSignal';
import { ParticipantAvatar } from './ParticipantAvatar';

interface TranscriptViewProps {
  meeting: MeetingAnalysis;
  activeEntryId: string | null;
  onSelectEntry: (entryId: string, seekSec: number) => void;
  onAddManualAction: (params: {
    entryId: string;
    taskText: string;
    assigneeId: string;
    assigneeName: string;
    priority: ActionPriority;
    dueDate: string;
  }) => void;
  onOpenSummaryTab: () => void;
}

export function TranscriptView({
  meeting,
  activeEntryId,
  onSelectEntry,
  onAddManualAction,
  onOpenSummaryTab,
}: TranscriptViewProps) {
  const [participantFilter, setParticipantFilter] = useState('all');
  const [emotionFilter, setEmotionFilter] = useState('all');
  const [actionOnly, setActionOnly] = useState(false);
  const [query, setQuery] = useState('');

  // Manual action item tagging drawer state
  const [taggingEntryId, setTaggingEntryId] = useState<string | null>(null);
  const [tagTaskText, setTagTaskText] = useState('');
  const [tagAssigneeId, setTagAssigneeId] = useState(
    meeting.participants[0]?.id ?? ''
  );
  const [tagPriority, setTagPriority] = useState<ActionPriority>('Medium');
  const [tagDueDate, setTagDueDate] = useState('This week');

  const videoRef = useRef<HTMLVideoElement>(null);

  const participantById = useMemo(() => {
    const map = new Map<string, Participant>();
    for (const p of meeting.participants) {
      map.set(p.id, p);
    }
    return map;
  }, [meeting.participants]);

  const actionById = useMemo(() => {
    const map = new Map(meeting.actionItems.map((a) => [a.id, a]));
    return map;
  }, [meeting.actionItems]);

  const availableEmotions = useMemo(() => {
    return Array.from(
      new Set(
        meeting.transcript
          .filter((entry) => entry.emotionAnalyzed !== false)
          .map((entry) => entry.emotion)
      )
    );
  }, [meeting.transcript]);

  const filteredEntries = useMemo(
    () =>
      filterTranscriptEntries(meeting.transcript, {
        participantId: participantFilter,
        emotion: emotionFilter,
        actionOnly,
        query,
      }),
    [meeting.transcript, participantFilter, emotionFilter, actionOnly, query]
  );

  const handleTimestampClick = (entryId: string, startSec: number) => {
    onSelectEntry(entryId, startSec);
    if (videoRef.current) {
      videoRef.current.currentTime = startSec;
      videoRef.current.play().catch(() => {
        // Autoplay may be blocked; seeking still works cleanly
      });
    }
  };

  const handleSaveManualAction = (entryId: string) => {
    if (!tagTaskText.trim()) return;
    const assignee =
      participantById.get(tagAssigneeId) ?? meeting.participants[0];
    if (!assignee) return;

    onAddManualAction({
      entryId,
      taskText: tagTaskText.trim(),
      assigneeId: assignee.id,
      assigneeName: assignee.name,
      priority: tagPriority,
      dueDate: tagDueDate.trim() || 'This week',
    });

    setTaggingEntryId(null);
    setTagTaskText('');
  };

  return (
    <div className="space-y-6">
      {/* Local-only stage status */}
      {meeting.stage === 'transcript_ready' && (
        <div className="bg-white border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Local transcription ready
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Speech was transcribed on this PC. Speaker identification,
              emotion analysis, action extraction, summaries, and chat are not
              part of this stage.
            </p>
          </div>
        </div>
      )}

      {/* Video Player or Speaker & Emotion Timeline Scrubber */}
      <section
        aria-label="Meeting media timeline"
        className="bg-white border border-slate-200 rounded-xl overflow-hidden"
      >
        {meeting.videoUrl ? (
          <div className="bg-slate-950">
            <video
              ref={videoRef}
              src={meeting.videoUrl}
              controls
              className="w-full max-h-[340px] object-contain mx-auto"
            />
          </div>
        ) : (
          <div className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <span className="text-xs font-semibold text-slate-700">
                Speaker &amp; Facial Emotion Timeline
              </span>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                Total duration {formatTimestamp(meeting.durationSec)}
              </span>
            </div>
            <div className="flex items-stretch gap-1 h-10 rounded-lg overflow-hidden bg-slate-100 p-1 border border-slate-200">
              {meeting.transcript.map((entry) => {
                const duration = Math.max(10, entry.endSec - entry.startSec);
                const isSelected = activeEntryId === entry.id;
                const hasAction = Boolean(entry.actionItemId);
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => handleTimestampClick(entry.id, entry.startSec)}
                    style={{ flexGrow: duration }}
                    title={`${formatTimestamp(entry.startSec)} · ${entry.speakerName} (${entry.emotion})`}
                    aria-label={`Jump to ${entry.speakerName} at ${formatTimestamp(entry.startSec)}, ${entry.emotion}`}
                    className={`min-w-[20px] rounded-md px-1.5 text-[11px] font-medium truncate transition-colors flex items-center justify-center ${
                      isSelected
                        ? 'bg-blue-700 text-white'
                        : hasAction
                          ? 'bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-300'
                          : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
                    }`}
                  >
                    <span className="truncate">
                      {entry.speakerName.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search
              className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search dialogue or facial cues..."
              aria-label="Search transcript or facial cues"
              className="w-full h-9 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-blue-600"
            />
          </div>

          <select
            value={participantFilter}
            onChange={(e) => setParticipantFilter(e.target.value)}
            aria-label="Filter by participant"
            className="h-9 px-3 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-blue-600"
          >
            <option value="all">All Participants</option>
            {meeting.participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            value={emotionFilter}
            onChange={(e) => setEmotionFilter(e.target.value)}
            aria-label="Filter by facial emotion"
            className="h-9 px-3 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-blue-600"
          >
            <option value="all">All Emotions</option>
            {availableEmotions.map((emo) => (
              <option key={emo} value={emo}>
                {emo}
              </option>
            ))}
          </select>

          <button
            type="button"
            aria-pressed={actionOnly}
            onClick={() => setActionOnly((v) => !v)}
            className={`h-9 px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              actionOnly
                ? 'bg-amber-50 border-amber-400 text-amber-900'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Action Items Only</span>
          </button>
        </div>

        <div className="flex items-center justify-between lg:justify-end gap-3 text-xs text-slate-500 font-mono tabular-nums shrink-0">
          <span>
            {filteredEntries.length} / {meeting.transcript.length} turns
          </span>
          {meeting.summary && (
            <button
              type="button"
              onClick={onOpenSummaryTab}
              className="inline-flex items-center gap-1 font-sans font-semibold text-blue-700 hover:text-blue-800 whitespace-nowrap"
            >
              <span>Per-Person Summary</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Transcript Stream */}
      <section
        aria-label="Meeting transcript and analysis details"
        className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200"
      >
        {filteredEntries.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm font-medium text-slate-900">
              No transcript entries match your current filters.
            </p>
            <button
              type="button"
              onClick={() => {
                setParticipantFilter('all');
                setEmotionFilter('all');
                setActionOnly(false);
                setQuery('');
              }}
              className="text-xs font-semibold text-blue-700 hover:underline"
            >
              Reset transcript filters
            </button>
          </div>
        ) : (
          filteredEntries.map((entry) => {
            const participant = participantById.get(entry.speakerId);
            const linkedAction = entry.actionItemId
              ? actionById.get(entry.actionItemId)
              : undefined;
            const split = splitTextAroundHighlight(
              entry.text,
              entry.highlightedPhrase
            );
            const isActive = activeEntryId === entry.id;
            const isTagging = taggingEntryId === entry.id;

            return (
              <article
                key={entry.id}
                id={`entry-${entry.id}`}
                className={`p-4 sm:p-5 transition-colors ${
                  isActive ? 'bg-blue-50/40' : 'hover:bg-slate-50/60'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start gap-4">
                  {/* Timestamp + Speaker Identity */}
                  <div className="flex items-center justify-between md:justify-start md:w-56 shrink-0 gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        handleTimestampClick(entry.id, entry.startSec)
                      }
                      aria-label={`Jump to ${formatTimestamp(entry.startSec)}`}
                      className="text-xs font-mono tabular-nums text-slate-500 hover:text-blue-700 font-medium px-2 py-1 rounded bg-slate-100 hover:bg-blue-50 transition-colors shrink-0"
                    >
                      {formatTimestamp(entry.startSec)}
                    </button>

                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <ParticipantAvatar
                        name={entry.speakerName}
                        imageUrl={participant?.imageUrl}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {entry.speakerName}
                        </p>
                        {participant?.role && (
                          <p className="text-xs text-slate-500 truncate">
                            {participant.role}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Dialogue + Highlighted Action + Facial Emotion */}
                  <div className="flex-1 min-w-0 space-y-2.5">
                    <p className="text-[15px] leading-relaxed text-slate-800">
                      {split ? (
                        <>
                          {split.before}
                          <mark className="bg-amber-100/90 text-slate-950 font-medium border-b-2 border-amber-500 px-1 py-0.5 rounded-xs">
                            {split.match}
                          </mark>
                          {split.after}
                        </>
                      ) : (
                        entry.text
                      )}
                    </p>

                    {/* Facial/emotion analysis is not part of local stage 1. */}
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
                      {entry.emotionAnalyzed === false ? (
                        <span>Camera and emotion analysis are not available yet.</span>
                      ) : (
                        <>
                          <EmotionSignal
                            emotion={entry.emotion}
                            intensity={entry.emotionIntensity}
                            showIntensity
                          />
                          <span aria-hidden="true">·</span>
                          <span>Face cue: {entry.facialCue}</span>
                        </>
                      )}
                    </div>

                    {/* Linked Extracted Action Item */}
                    {linkedAction && (
                      <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-xs bg-amber-50/60 border border-amber-200/80 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckSquare
                            className="h-3.5 w-3.5 text-amber-700 shrink-0"
                            aria-hidden="true"
                          />
                          <span className="font-medium text-slate-900">
                            Action: {linkedAction.task}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-600 shrink-0">
                          <span>Owner: {linkedAction.assigneeName}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            Due {linkedAction.dueDate}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-medium text-slate-800">
                            {linkedAction.priority}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Manual Tag Action Control */}
                    {!linkedAction && !isTagging && (
                      <div>
                        <button
                          type="button"
                          onClick={() => {
                            setTaggingEntryId(entry.id);
                            setTagAssigneeId(
                              participant?.id ??
                                meeting.participants[0]?.id ??
                                ''
                            );
                            setTagTaskText(entry.text.slice(0, 90));
                          }}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-blue-700 transition-colors"
                        >
                          <BookmarkPlus
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                          <span>Highlight as action item</span>
                        </button>
                      </div>
                    )}

                    {isTagging && (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                          <input
                            type="text"
                            value={tagTaskText}
                            onChange={(e) => setTagTaskText(e.target.value)}
                            placeholder="Action item description..."
                            aria-label="Action item description"
                            className="sm:col-span-6 h-9 px-2.5 text-xs bg-white border border-slate-300 rounded-md text-slate-900"
                          />
                          <select
                            value={tagAssigneeId}
                            onChange={(e) => setTagAssigneeId(e.target.value)}
                            aria-label="Assign action item to participant"
                            className="sm:col-span-3 h-9 px-2 text-xs bg-white border border-slate-300 rounded-md text-slate-800"
                          >
                            {meeting.participants.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                          <select
                            value={tagPriority}
                            onChange={(e) =>
                              setTagPriority(e.target.value as ActionPriority)
                            }
                            aria-label="Action item priority"
                            className="sm:col-span-3 h-9 px-2 text-xs bg-white border border-slate-300 rounded-md text-slate-800"
                          >
                            <option value="High">High priority</option>
                            <option value="Medium">Medium priority</option>
                            <option value="Low">Low priority</option>
                          </select>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <input
                            type="text"
                            value={tagDueDate}
                            onChange={(e) => setTagDueDate(e.target.value)}
                            placeholder="Due date (e.g. Friday)"
                            aria-label="Action item due date"
                            className="h-8 px-2.5 text-xs bg-white border border-slate-300 rounded-md text-slate-900 w-44"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setTaggingEntryId(null)}
                              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveManualAction(entry.id)}
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-md"
                            >
                              Save Action
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
