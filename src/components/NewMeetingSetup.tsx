import { useRef, useState } from 'react';
import {
  AlertCircle,
  Loader2,
  Trash2,
  Upload,
  UserPlus,
  Video,
} from 'lucide-react';
import type { ActionItem, Participant, TranscriptEntry } from '../types/meeting';
import {
  validateMeetingSubmission,
  validateParticipantInput,
} from '../utils/meetingLogic';
import {
  validateLiveSessionStart,
  type VideoSourceMode,
} from '../utils/liveSessionLogic';
import { ParticipantAvatar } from './ParticipantAvatar';
import { CookieRecoveryBanner } from './CookieRecoveryBanner';
import { LiveCameraRecorder } from './LiveCameraRecorder';

export interface ParticipantDraft extends Participant {
  file?: File;
}

interface NewMeetingSetupProps {
  initialParticipants: Participant[];
  isProcessing: boolean;
  processingLabel: string;
  serverError: string | null;
  isCookieError?: boolean;
  onCookiesVerified?: () => void;
  onStartTranscription: (payload: {
    title: string;
    participants: ParticipantDraft[];
    videoFile: File;
  }) => Promise<void>;
  onCompleteLiveMeeting: (payload: {
    title: string;
    participants: ParticipantDraft[];
    durationSec: number;
    videoUrl?: string;
    transcript: TranscriptEntry[];
    actionItems: ActionItem[];
  }) => Promise<void>;
}

export function NewMeetingSetup({
  initialParticipants,
  isProcessing,
  processingLabel,
  serverError,
  isCookieError = false,
  onCookiesVerified,
  onStartTranscription,
  onCompleteLiveMeeting,
}: NewMeetingSetupProps) {
  const [title, setTitle] = useState('');
  const [participants, setParticipants] = useState<ParticipantDraft[]>(
    initialParticipants.map((p) => ({ ...p }))
  );

  // Add Participant form state
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newPhotoFile, setNewPhotoFile] = useState<File | null>(null);
  const [newPhotoPreview, setNewPhotoPreview] = useState<string>('');
  const [participantError, setParticipantError] = useState<string | null>(null);

  // Video source mode & state
  const [sourceMode, setSourceMode] = useState<VideoSourceMode>('upload');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string>('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setParticipantError('Select an image file (JPG, PNG, WebP) for the face photo.');
      return;
    }
    if (newPhotoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(newPhotoPreview);
    }
    setNewPhotoFile(file);
    setNewPhotoPreview(URL.createObjectURL(file));
    setParticipantError(null);
  };

  const handleAddParticipant = () => {
    const check = validateParticipantInput(newName, Boolean(newPhotoPreview));
    if (!check.valid) {
      setParticipantError(check.error ?? 'Invalid participant details.');
      return;
    }

    const created: ParticipantDraft = {
      id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: newName.trim(),
      role: newRole.trim() || undefined,
      imageUrl: newPhotoPreview,
      file: newPhotoFile ?? undefined,
    };

    setParticipants((prev) => [...prev, created]);
    setNewName('');
    setNewRole('');
    setNewPhotoFile(null);
    setNewPhotoPreview('');
    setParticipantError(null);
    if (photoInputRef.current) {
      photoInputRef.current.value = '';
    }
  };

  const handleRemoveParticipant = (id: string) => {
    setParticipants((prev) => prev.filter((p) => p.id !== id));
  };

  const handleVideoSelect = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      setSubmitError('Please select a valid video file (.mp4, .webm, .mov).');
      return;
    }
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
    }
    setVideoFile(file);
    setVideoPreviewUrl(URL.createObjectURL(file));
    setSubmitError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateMeetingSubmission(
      title,
      participants,
      Boolean(videoFile)
    );
    if (!check.valid) {
      setSubmitError(check.error ?? 'Check required fields.');
      return;
    }
    if (!videoFile) return;

    setSubmitError(null);
    await onStartTranscription({
      title: title.trim(),
      participants,
      videoFile,
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          New Meeting Analysis
        </h1>
        <p className="mt-1.5 text-sm text-slate-600 max-w-2xl">
          Stage 1 transcribes speech locally on this PC. Speaker identification,
          face analysis, action extraction, summaries, and chat are planned for
          later stages and are not processed yet.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {/* Step 1: Participant Face Photos & Names */}
        <section
          aria-labelledby="step-participants-heading"
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2
                id="step-participants-heading"
                className="text-base font-semibold text-slate-900"
              >
                01. Participant Face Photos &amp; Names
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                These photos stay in the app and are not sent to the local
                transcription service in this stage.
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {participants.length} registered
            </span>
          </div>

          {/* Add Participant Row */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end pt-1">
            <div className="md:col-span-4">
              <label
                htmlFor="participant-name-input"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Participant Name
              </label>
              <input
                id="participant-name-input"
                type="text"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (participantError) setParticipantError(null);
                }}
                placeholder="e.g. Amine Mansouri"
                className="w-full h-10 px-3 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
              />
            </div>

            <div className="md:col-span-3">
              <label
                htmlFor="participant-role-input"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Role (Optional)
              </label>
              <input
                id="participant-role-input"
                type="text"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                placeholder="e.g. Tech Lead"
                className="w-full h-10 px-3 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
              />
            </div>

            <div className="md:col-span-3">
              <span className="block text-xs font-medium text-slate-700 mb-1">
                Face Reference Photo
              </span>
              <div className="flex items-center gap-2">
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  aria-label="Face Reference Photo file"
                  onChange={(e) => handlePhotoSelect(e.target.files?.[0])}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="w-full h-10 px-3 inline-flex items-center justify-center gap-2 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {newPhotoFile ? newPhotoFile.name : 'Upload Photo'}
                  </span>
                </button>
                {newPhotoPreview && (
                  <img
                    src={newPhotoPreview}
                    alt="Selected participant preview"
                    className="h-10 w-10 rounded-lg object-cover border border-slate-200 shrink-0"
                  />
                )}
              </div>
            </div>

            <div className="md:col-span-2">
              <button
                type="button"
                onClick={handleAddParticipant}
                className="w-full h-10 px-3 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors whitespace-nowrap"
              >
                <UserPlus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>Add Person</span>
              </button>
            </div>
          </div>

          {participantError && (
            <div
              role="alert"
              className="flex items-center gap-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
            >
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{participantError}</span>
            </div>
          )}

          {/* Registered Participants List */}
          {participants.length === 0 ? (
            <div className="border border-dashed border-slate-300 rounded-lg p-6 text-center text-sm text-slate-500">
              No participants added yet. Enter a name and upload a clear portrait
              photo above.
            </div>
          ) : (
            <ul
              data-testid="participant-roster-list"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100"
            >
              {participants.map((person) => (
                <li
                  key={person.id}
                  className="flex items-center justify-between gap-2.5 p-2.5 rounded-lg bg-slate-50"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ParticipantAvatar
                      name={person.name}
                      imageUrl={person.imageUrl}
                      size="md"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {person.name}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {person.role || 'Participant'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveParticipant(person.id)}
                    aria-label={`Remove ${person.name}`}
                    className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-white transition-colors shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Step 2: Meeting Video Upload or Live Mic/Camera */}
        <section
          aria-labelledby="step-video-heading"
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2
                id="step-video-heading"
                className="text-base font-semibold text-slate-900"
              >
                02. Meeting Video Source &amp; Pipeline Settings
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Upload a recorded meeting video or open your microphone &amp; camera
                for live transcription.
              </p>
            </div>

            <div
              role="group"
              aria-label="Meeting video input mode"
              className="inline-flex items-center p-1 bg-slate-100 rounded-lg shrink-0 self-start sm:self-auto"
            >
              <button
                type="button"
                aria-pressed={sourceMode === 'upload'}
                disabled={isProcessing}
                onClick={() => {
                  setSourceMode('upload');
                  setSubmitError(null);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  sourceMode === 'upload'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Upload Video File
              </button>
              <button
                type="button"
                aria-pressed={sourceMode === 'live'}
                disabled={isProcessing}
                onClick={() => {
                  setSourceMode('live');
                  setSubmitError(null);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  sourceMode === 'live'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Live Mic &amp; Camera
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="meeting-title-input"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Meeting or Reunion Title
            </label>
            <input
              id="meeting-title-input"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (submitError) setSubmitError(null);
              }}
              placeholder="e.g. Weekly Engineering Sync — Sprint 18"
              className="w-full h-10 px-3 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
            />
          </div>

          {sourceMode === 'upload' ? (
            <div>
              <span className="block text-xs font-medium text-slate-700 mb-1">
                Meeting Video File
              </span>
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                aria-label="Meeting Video File input"
                onChange={(e) => handleVideoSelect(e.target.files?.[0])}
                className="hidden"
              />
              <div className="border border-dashed border-slate-300 rounded-xl p-5 bg-slate-50/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-600 shrink-0">
                    <Video className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {videoFile ? videoFile.name : 'No video selected'}
                    </p>
                    <p className="text-xs text-slate-500 font-mono tabular-nums">
                      {videoFile
                        ? `${(videoFile.size / (1024 * 1024)).toFixed(2)} MB`
                        : 'MP4, WebM, or MOV up to 250 MB'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="px-4 py-2 text-xs font-semibold text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  {videoFile ? 'Replace Video' : 'Select Video File'}
                </button>
              </div>

              {videoPreviewUrl && (
                <div className="mt-3 rounded-lg overflow-hidden border border-slate-200 bg-slate-950 max-h-64">
                  <video
                    src={videoPreviewUrl}
                    controls
                    className="w-full max-h-64 object-contain"
                  />
                </div>
              )}
            </div>
          ) : (
            <LiveCameraRecorder
              title={title}
              participants={participants}
              onValidateBeforeStart={() => {
                const check = validateLiveSessionStart(title, participants);
                return check.valid ? null : (check.error ?? 'Check required fields.');
              }}
              onCompleteLiveMeeting={onCompleteLiveMeeting}
            />
          )}

          <div className="pt-1 text-xs text-slate-600">
            Local summaries and action extraction are planned for a later
            stage. This stage only transcribes speech on this PC.
          </div>

          {sourceMode === 'upload' && (
            <>
              {(submitError || serverError) &&
                (!submitError && isCookieError && serverError ? (
                  <CookieRecoveryBanner
                    message={serverError}
                    onCookiesVerified={onCookiesVerified}
                  />
                ) : (
                  <div
                    role="alert"
                    className="flex items-center gap-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{submitError || serverError}</span>
                  </div>
                ))}

              <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-200">
                <p className="text-xs text-slate-500">
                  Stage 1 transcribes speech locally; other analysis features
                  will be added in later stages.
                </p>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-5 py-2.5 inline-flex items-center gap-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  {isProcessing && (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  )}
                  <span>
                    {isProcessing
                      ? processingLabel
                      : 'Transcribe & Highlight Actions'}
                  </span>
                </button>
              </div>
            </>
          )}
        </section>
      </form>
    </div>
  );
}
