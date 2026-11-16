import { Film, Plus, Users, X } from 'lucide-react';
import type { MeetingAnalysis, Participant } from '../types/meeting';
import { formatTimestamp } from '../utils/meetingLogic';
import { ParticipantAvatar } from './ParticipantAvatar';

interface SidebarProps {
  meetings: MeetingAnalysis[];
  activeView: 'new' | 'meeting';
  activeMeetingId: string;
  roster: Participant[];
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onSelectNewMeeting: () => void;
  onSelectMeeting: (id: string) => void;
}

export function Sidebar({
  meetings,
  activeView,
  activeMeetingId,
  roster,
  mobileOpen,
  onCloseMobile,
  onSelectNewMeeting,
  onSelectMeeting,
}: SidebarProps) {
  const sidebarBody = (
    <div className="flex h-full flex-col bg-white border-r border-slate-200">
      <div className="flex items-center justify-between px-5 h-16 border-b border-slate-200 shrink-0">
        <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
          Cadence
        </span>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation"
          className="lg:hidden p-2 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4 border-b border-slate-200">
        <button
          type="button"
          onClick={() => {
            onSelectNewMeeting();
            onCloseMobile();
          }}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>New Meeting</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <section aria-labelledby="sidebar-meetings-heading">
          <div className="flex items-center justify-between px-2 mb-2">
            <h2
              id="sidebar-meetings-heading"
              className="text-xs font-semibold text-slate-500 flex items-center gap-1.5"
            >
              <Film className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Meetings</span>
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              {meetings.length}
            </span>
          </div>

          <ul className="space-y-1">
            {meetings.map((meeting) => {
              const isSelected =
                activeView === 'meeting' && meeting.id === activeMeetingId;
              return (
                <li key={meeting.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectMeeting(meeting.id);
                      onCloseMobile();
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors border ${
                      isSelected
                        ? 'bg-slate-100 border-slate-300 text-slate-900'
                        : 'bg-transparent border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {meeting.title}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 font-mono tabular-nums">
                      <span>{formatTimestamp(meeting.durationSec)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{meeting.actionItems.length} tasks</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section
          aria-labelledby="sidebar-roster-heading"
          className="pt-4 border-t border-slate-200"
        >
          <div className="flex items-center justify-between px-2 mb-2">
            <h2
              id="sidebar-roster-heading"
              className="text-xs font-semibold text-slate-500 flex items-center gap-1.5"
            >
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Face Roster</span>
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              {roster.length}
            </span>
          </div>
          <ul className="space-y-1.5 px-1">
            {roster.map((person) => (
              <li
                key={person.id}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-md"
              >
                <ParticipantAvatar
                  name={person.name}
                  imageUrl={person.imageUrl}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-800 truncate">
                    {person.name}
                  </p>
                  {person.role && (
                    <p className="text-[11px] text-slate-500 truncate">
                      {person.role}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-[264px] shrink-0 h-screen sticky top-0 print:hidden">
        {sidebarBody}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[85vw] h-full z-10">
            {sidebarBody}
          </aside>
        </div>
      )}
    </>
  );
}
