import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Loader2,
  MessageSquare,
  RotateCcw,
  Send,
} from 'lucide-react';
import type {
  ChatMessage,
  ChatScope,
  MeetingAnalysis,
} from '../types/meeting';
import {
  buildMeetingsContextPayload,
  buildReunionChatSystemInstruction,
  formatChatHistoryForGemini,
  validateChatInput,
} from '../utils/chatLogic';
import {
  apiFetch,
  isCookieCheckError,
  parseApiResponse,
} from '../utils/apiClient';
import { CookieRecoveryBanner } from './CookieRecoveryBanner';

interface ReunionChatViewProps {
  meetings: MeetingAnalysis[];
  activeMeeting: MeetingAnalysis;
  scope: ChatScope;
  messages: ChatMessage[];
  onChangeScope: (nextScope: ChatScope) => void;
  onAppendMessages: (scopeKey: string, newMessages: ChatMessage[]) => void;
  onClearThread: (scopeKey: string) => void;
}

function getCurrentTimeLabel(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(
    now.getMinutes()
  ).padStart(2, '0')}`;
}

export function ReunionChatView({
  meetings,
  activeMeeting,
  scope,
  messages,
  onChangeScope,
  onAppendMessages,
  onClearThread,
}: ReunionChatViewProps) {
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorIsCookieCheck, setErrorIsCookieCheck] = useState(false);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const localChatReady = false;

  const scopeKey = scope === 'all' ? 'all-reunions' : activeMeeting.id;

  const starterQuestions = useMemo(() => {
    const firstPerson = activeMeeting.participants[0]?.name ?? 'the team';
    const secondPerson = activeMeeting.participants[1]?.name;
    return [
      `Who owns high-priority tasks in "${activeMeeting.title}" and when are they due?`,
      `Which moments showed concern or hesitation on camera?`,
      secondPerson
        ? `Compare ${firstPerson} and ${secondPerson}'s facial emotions and action items.`
        : `Summarize ${firstPerson}'s facial emotion trajectory and commitments.`,
      meetings.length > 1
        ? `What open action items remain across all recorded meetings?`
        : `What decisions were finalized before closing the meeting?`,
    ];
  }, [activeMeeting, meetings.length]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isSending]);

  const sendQuestion = async (questionText: string) => {
    if (!localChatReady) {
      setError('Local meeting chat is planned for a later stage.');
      return;
    }

    const check = validateChatInput(questionText);
    if (!check.valid) {
      setError(check.error ?? 'Enter a question.');
      return;
    }

    const trimmed = questionText.trim();
    const userMsg: ChatMessage = {
      id: `msg-u-${Date.now()}`,
      role: 'user',
      text: trimmed,
      timestamp: getCurrentTimeLabel(),
    };

    const historyForGemini = formatChatHistoryForGemini(messages);
    const contextPayload = buildMeetingsContextPayload(
      meetings,
      activeMeeting.id,
      scope
    );
    const systemInstruction =
      buildReunionChatSystemInstruction(contextPayload);

    setError(null);
    setErrorIsCookieCheck(false);
    setInput('');
    onAppendMessages(scopeKey, [userMsg]);
    setIsSending(true);

    try {
      const response = await apiFetch('/api/meetings/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: historyForGemini,
          systemInstruction,
        }),
      });

      const data = await parseApiResponse<{ reply?: string }>(response);

      const replyText = String(data.reply ?? '').trim();
      if (!replyText) {
        throw new Error('Gemini returned an empty response.');
      }

      const assistantMsg: ChatMessage = {
        id: `msg-m-${Date.now()}`,
        role: 'model',
        text: replyText,
        timestamp: getCurrentTimeLabel(),
      };
      onAppendMessages(scopeKey, [assistantMsg]);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Unable to reach the Reunion Q&A assistant.';
      setError(msg);
      setErrorIsCookieCheck(isCookieCheckError(err));
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSending) return;
    await sendQuestion(input);
  };

  return (
    <section
      aria-labelledby="reunion-chat-heading"
      className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col"
    >
      {/* Header */}
      <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2
            id="reunion-chat-heading"
            className="text-base font-semibold text-slate-900"
          >
            Reunion Q&amp;A Assistant
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Local meeting chat is planned for a later stage. No cloud AI service
            is used.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div
            role="group"
            aria-label="Conversation scope"
            className="inline-flex items-center p-1 bg-slate-100 rounded-lg"
          >
            <button
              type="button"
              aria-pressed={scope === 'current'}
              onClick={() => onChangeScope('current')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                scope === 'current'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Current Meeting
            </button>
            <button
              type="button"
              aria-pressed={scope === 'all'}
              onClick={() => onChangeScope('all')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                scope === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Meetings ({meetings.length})
            </button>
          </div>

          {messages.length > 0 && (
            <button
              type="button"
              disabled={!localChatReady || isSending}
              onClick={() => {
                setError(null);
                onClearThread(scopeKey);
              }}
              aria-label="Clear conversation thread"
              className="px-3 py-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Clear Thread</span>
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Thread */}
      <div
        data-testid="chat-thread"
        className="h-[420px] overflow-y-auto p-5 space-y-4 bg-slate-50/50"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-xl mx-auto space-y-4">
            <div className="h-10 w-10 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-blue-700">
              <MessageSquare className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900">
                Ask anything about{' '}
                {scope === 'all'
                  ? `your ${meetings.length} recorded meetings`
                  : activeMeeting.title}
              </p>
              <p className="text-xs text-slate-500">
                Responses cite speakers, timestamps, action deadlines, and
                observed facial cues.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full pt-2">
              {starterQuestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={!localChatReady || isSending}
                  onClick={() => sendQuestion(q)}
                  className="text-left p-3 text-xs text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg transition-colors leading-relaxed"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] sm:max-w-[75%] rounded-xl px-4 py-3 space-y-1 ${
                      isUser
                        ? 'bg-blue-700 text-white'
                        : 'bg-white border border-slate-200 text-slate-800'
                    }`}
                  >
                    <div
                      className={`flex items-center justify-between gap-4 text-[11px] ${
                        isUser ? 'text-blue-100' : 'text-slate-400'
                      }`}
                    >
                      <span className="font-semibold">
                        {isUser ? 'You' : 'Reunion Analyst'}
                      </span>
                      <span className="font-mono tabular-nums">
                        {msg.timestamp}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {msg.text}
                    </p>
                  </div>
                </div>
              );
            })}

            {isSending && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 inline-flex items-center gap-2 text-xs text-slate-600">
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin text-blue-700"
                    aria-hidden="true"
                  />
                  <span>Reviewing meeting records...</span>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={threadEndRef} />
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mx-5 mt-3">
          {errorIsCookieCheck ? (
            <CookieRecoveryBanner
              message={error}
              onCookiesVerified={() => {
                setError(null);
                setErrorIsCookieCheck(false);
              }}
            />
          ) : (
            <div
              role="alert"
              className="flex items-center gap-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
            >
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={handleSubmit}
        className="p-4 bg-white border-t border-slate-200 flex items-center gap-3"
        noValidate
      >
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (error) setError(null);
          }}
          placeholder={`Ask a question about ${
            scope === 'all' ? 'any recorded reunion...' : activeMeeting.title
          }...`}
          aria-label="Ask a question about the reunions"
          disabled={!localChatReady || isSending}
          className="flex-1 h-10 px-3.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-blue-600"
        />
        <button
          type="submit"
          disabled={isSending}
          className="h-10 px-4 inline-flex items-center gap-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          {isSending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span>Send</span>
        </button>
      </form>
    </section>
  );
}
