import { useEffect, useMemo, useState } from 'react';
import { Menu, Plus } from 'lucide-react';
import {
  NewMeetingSetup,
  type ParticipantDraft,
} from './components/NewMeetingSetup';
import { PersonSummaryView } from './components/PersonSummaryView';
import { ReunionChatView } from './components/ReunionChatView';
import { Sidebar } from './components/Sidebar';
import { TranscriptView } from './components/TranscriptView';
import { SAMPLE_MEETINGS, SAMPLE_ROSTER } from './data/sampleMeetings';
import type {
  ActionItem,
  ActionPriority,
  ChatMessage,
  ChatScope,
  MeetingAnalysis,
  Participant,
  TranscriptEntry,
} from './types/meeting';
import { CookieRecoveryBanner } from './components/CookieRecoveryBanner';
import {
  addManualActionItem,
  formatTimestamp,
  toggleActionItemStatus,
} from './utils/meetingLogic';
import {
  apiFetch,
  calculateChunkRanges,
  isCookieCheckError,
  parseApiResponse,
} from './utils/apiClient';

type ActiveTab = 'transcript' | 'summary' | 'chat';

export default function App() {
  const [meetings, setMeetings] = useState<MeetingAnalysis[]>(SAMPLE_MEETINGS);
  const [roster, setRoster] = useState<Participant[]>(SAMPLE_ROSTER);
  const [activeView, setActiveView] = useState<'new' | 'meeting'>('meeting');
  const [activeMeetingId, setActiveMeetingId] = useState<string>(
    SAMPLE_MEETINGS[0].id
  );
  const [activeTab, setActiveTab] = useState<ActiveTab>('transcript');
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingLabel, setProcessingLabel] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverErrorIsCookieCheck, setServerErrorIsCookieCheck] =
    useState(false);
  const [chatScope, setChatScope] = useState<ChatScope>('current');
  const [chatByScope, setChatByScope] = useState<Record<string, ChatMessage[]>>(
    {}
  );

  const activeMeeting = useMemo(
    () => meetings.find((m) => m.id === activeMeetingId) ?? meetings[0],
    [meetings, activeMeetingId]
  );

  useEffect(() => {
    apiFetch('/api/health').catch(() => {
      // Background pre-warm only
    });
  }, []);

  const handleStartTranscription = async (payload: {
    title: string;
    participants: ParticipantDraft[];
    videoFile: File;
  }) => {
    setIsProcessing(true);
    setProcessingLabel('Checking preview session...');
    setServerError(null);
    setServerErrorIsCookieCheck(false);

    try {
      const healthRes = await apiFetch(
        '/api/health',
        {},
        {
          onServerStarting: () =>
            setProcessingLabel('Waking analysis server (starting up)...'),
        }
      );
      await parseApiResponse<{ ok: boolean }>(healthRes);

      setProcessingLabel('Transcribing locally...');
      const formData = new FormData();

      const chunkSizeBytes = 6 * 1024 * 1024;
      if (payload.videoFile.size > chunkSizeBytes) {
        const uploadId = `vid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const ranges = calculateChunkRanges(
          payload.videoFile.size,
          chunkSizeBytes
        );

        for (const range of ranges) {
          const pct = Math.round(((range.index + 1) / ranges.length) * 100);
          setProcessingLabel(`Uploading video (${pct}%)...`);

          const chunkForm = new FormData();
          chunkForm.append('uploadId', uploadId);
          chunkForm.append('chunkIndex', String(range.index));
          chunkForm.append('totalChunks', String(ranges.length));
          chunkForm.append(
            'chunk',
            payload.videoFile.slice(range.start, range.end),
            `chunk-${range.index}`
          );

          const chunkResponse = await apiFetch(
            '/api/meetings/upload-chunk',
            {
              method: 'POST',
              body: chunkForm,
            },
            {
              onServerStarting: () =>
                setProcessingLabel('Reconnecting to analysis server...'),
            }
          );
          await parseApiResponse<{ ok: boolean }>(chunkResponse);
        }

        setProcessingLabel('Transcribing locally...');
        formData.append('uploadId', uploadId);
        formData.append('totalChunks', String(ranges.length));
        formData.append(
          'videoMimeType',
          payload.videoFile.type || 'video/mp4'
        );
      } else {
        formData.append('video', payload.videoFile);
      }

      const response = await apiFetch(
        '/api/meetings/transcribe',
        {
          method: 'POST',
          body: formData,
        },
        {
          onServerStarting: () =>
            setProcessingLabel('Waiting for local transcription service...'),
        }
      );

      const data = await parseApiResponse<{
        durationSec?: number;
        transcript?: MeetingAnalysis['transcript'];
        actionItems?: MeetingAnalysis['actionItems'];
      }>(response);

      const cleanParticipants: Participant[] = payload.participants.map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role,
        imageUrl: p.imageUrl,
      }));

      const newMeeting: MeetingAnalysis = {
        id: `mtg-${Date.now()}`,
        title: payload.title,
        recordedAt: 'Just now',
        durationSec: Number(data.durationSec || 60),
        videoUrl: URL.createObjectURL(payload.videoFile),
        participants: cleanParticipants,
        transcript: Array.isArray(data.transcript) ? data.transcript : [],
        actionItems: Array.isArray(data.actionItems) ? data.actionItems : [],
        summary: null,
        stage: 'transcript_ready',
      };

      setRoster(cleanParticipants);
      setMeetings((prev) => [newMeeting, ...prev]);
      setActiveMeetingId(newMeeting.id);
      setActiveView('meeting');
      setActiveTab('transcript');
      setActiveEntryId(newMeeting.transcript[0]?.id ?? null);

    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Unable to process meeting video.';
      setServerError(msg);
      setServerErrorIsCookieCheck(isCookieCheckError(err));
    } finally {
      setIsProcessing(false);
      setProcessingLabel('');
    }
  };

  const handleCompleteLiveMeeting = async (payload: {
    title: string;
    participants: ParticipantDraft[];
    durationSec: number;
    videoUrl?: string;
    transcript: TranscriptEntry[];
    actionItems: ActionItem[];
  }) => {
    const cleanParticipants: Participant[] = payload.participants.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      imageUrl: p.imageUrl,
    }));

    const newMeeting: MeetingAnalysis = {
      id: `mtg-${Date.now()}`,
      title: payload.title,
      recordedAt: 'Live · Just now',
      durationSec: Math.max(1, payload.durationSec),
      videoUrl: payload.videoUrl,
      participants: cleanParticipants,
      transcript: payload.transcript,
      actionItems: payload.actionItems,
      summary: null,
      stage: 'transcript_ready',
    };

    setRoster(cleanParticipants);
    setMeetings((prev) => [newMeeting, ...prev]);
    setActiveMeetingId(newMeeting.id);
    setActiveView('meeting');
    setActiveTab('transcript');
    setActiveEntryId(newMeeting.transcript[0]?.id ?? null);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  const handleToggleAction = (actionId: string) => {
    if (!activeMeeting) return;
    setMeetings((prev) =>
      prev.map((m) =>
        m.id === activeMeeting.id
          ? {
              ...m,
              actionItems: toggleActionItemStatus(m.actionItems, actionId),
            }
          : m
      )
    );
  };

  const handleAddManualAction = (params: {
    entryId: string;
    taskText: string;
    assigneeId: string;
    assigneeName: string;
    priority: ActionPriority;
    dueDate: string;
  }) => {
    if (!activeMeeting) return;
    setMeetings((prev) =>
      prev.map((m) => {
        if (m.id !== activeMeeting.id) return m;
        const updated = addManualActionItem(
          m.transcript,
          m.actionItems,
          params
        );
        return {
          ...m,
          transcript: updated.entries,
          actionItems: updated.actionItems,
        };
      })
    );
  };

  const handleJumpToTranscript = (entryId: string, _timestampSec: number) => {
    setActiveTab('transcript');
    setActiveEntryId(entryId);
    setTimeout(() => {
      const el = document.getElementById(`entry-${entryId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 60);
  };

  const completedTasksCount = activeMeeting
    ? activeMeeting.actionItems.filter((a) => a.completed).length
    : 0;

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <Sidebar
        meetings={meetings}
        activeView={activeView}
        activeMeetingId={activeMeeting?.id ?? ''}
        roster={roster}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        onSelectNewMeeting={() => {
          setServerError(null);
          setActiveView('new');
          window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
        }}
        onSelectMeeting={(id) => {
          setServerError(null);
          setActiveMeetingId(id);
          setActiveView('meeting');
          setActiveTab('transcript');
          window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
        }}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-30 print:hidden">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            >
              <Menu className="h-5 w-5" />
            </button>
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-2 text-sm min-w-0"
            >
              <span className="text-slate-500 whitespace-nowrap">Meetings</span>
              <span className="text-slate-300" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-slate-900 truncate">
                {activeView === 'new'
                  ? 'New Meeting Analysis'
                  : activeMeeting?.title || 'Overview'}
              </span>
            </nav>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {activeView === 'meeting' ? (
              <button
                type="button"
                onClick={() => {
                  setServerError(null);
                  setActiveView('new');
                  window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
                }}
                className="px-3.5 py-2 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Analyze Video</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setActiveView('meeting');
                  window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
                }}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Back to Meetings
              </button>
            )}
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-4 sm:p-8 max-w-6xl w-full mx-auto print:p-0 print:max-w-none">
          {activeView === 'new' ? (
            <NewMeetingSetup
              initialParticipants={roster}
              isProcessing={isProcessing}
              processingLabel={processingLabel}
              serverError={serverError}
              isCookieError={serverErrorIsCookieCheck}
              onCookiesVerified={() => {
                setServerError(null);
                setServerErrorIsCookieCheck(false);
              }}
              onStartTranscription={handleStartTranscription}
              onCompleteLiveMeeting={handleCompleteLiveMeeting}
            />
          ) : activeMeeting ? (
            <div className="space-y-6">
              {/* Meeting Title & Clean Unboxed Metadata */}
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-5 print:hidden">
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                    {activeMeeting.title}
                  </h1>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
                    <span>{activeMeeting.recordedAt}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {formatTimestamp(activeMeeting.durationSec)} duration
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {activeMeeting.participants.length} participants
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {completedTasksCount} / {activeMeeting.actionItems.length}{' '}
                      actions done
                    </span>
                  </div>
                </div>

                {/* Two-Stage Segmented Switcher */}
                <div
                  role="tablist"
                  aria-label="Meeting analysis stages"
                  className="inline-flex items-center p-1 bg-slate-200/70 rounded-lg shrink-0 self-start md:self-auto"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'transcript'}
                    onClick={() => setActiveTab('transcript')}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      activeTab === 'transcript'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    1. Transcript &amp; Action Highlights
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'summary'}
                    onClick={() => setActiveTab('summary')}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      activeTab === 'summary'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    2. Per-Person Tasks &amp; Summary
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'chat'}
                    onClick={() => setActiveTab('chat')}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      activeTab === 'chat'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    3. Reunion Q&amp;A
                  </button>
                </div>
              </div>

              {serverError &&
                (serverErrorIsCookieCheck ? (
                  <div className="print:hidden">
                    <CookieRecoveryBanner
                      message={serverError}
                      onCookiesVerified={() => {
                        setServerError(null);
                        setServerErrorIsCookieCheck(false);
                      }}
                    />
                  </div>
                ) : (
                  <div
                    role="alert"
                    className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 print:hidden"
                  >
                    {serverError}
                  </div>
                ))}

              {activeTab === 'transcript' ? (
                <TranscriptView
                  meeting={activeMeeting}
                  activeEntryId={activeEntryId}
                  onSelectEntry={(entryId) => setActiveEntryId(entryId)}
                  onAddManualAction={handleAddManualAction}
                  onOpenSummaryTab={() => setActiveTab('summary')}
                />
              ) : activeTab === 'summary' ? (
                <PersonSummaryView
                  meeting={activeMeeting}
                  onToggleAction={handleToggleAction}
                  onJumpToTranscript={handleJumpToTranscript}
                />
              ) : (
                <ReunionChatView
                  meetings={meetings}
                  activeMeeting={activeMeeting}
                  scope={chatScope}
                  messages={
                    chatByScope[
                      chatScope === 'all' ? 'all-reunions' : activeMeeting.id
                    ] ?? []
                  }
                  onChangeScope={setChatScope}
                  onAppendMessages={(scopeKey, newMessages) =>
                    setChatByScope((prev) => ({
                      ...prev,
                      [scopeKey]: [...(prev[scopeKey] ?? []), ...newMessages],
                    }))
                  }
                  onClearThread={(scopeKey) =>
                    setChatByScope((prev) => ({
                      ...prev,
                      [scopeKey]: [],
                    }))
                  }
                />
              )}
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
