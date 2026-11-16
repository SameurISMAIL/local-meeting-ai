import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CameraOff,
  CheckSquare,
  Loader2,
  Mic,
  MicOff,
  Radio,
  Square,
  Video,
} from 'lucide-react';
import type { ActionItem, TranscriptEntry } from '../types/meeting';
import type { ParticipantDraft } from './NewMeetingSetup';
import { ParticipantAvatar } from './ParticipantAvatar';
import { EmotionSignal } from './EmotionSignal';
import { CookieRecoveryBanner } from './CookieRecoveryBanner';
import {
  apiFetch,
  isCookieCheckError,
  parseApiResponse,
} from '../utils/apiClient';
import {
  mergeLiveChunkResults,
  pickSupportedRecorderMimeType,
} from '../utils/liveSessionLogic';
import { formatTimestamp, splitTextAroundHighlight } from '../utils/meetingLogic';

const LIVE_SEGMENT_MS = 6000;

interface LiveCameraRecorderProps {
  title: string;
  participants: ParticipantDraft[];
  onValidateBeforeStart: () => string | null;
  onCompleteLiveMeeting: (payload: {
    title: string;
    participants: ParticipantDraft[];
    durationSec: number;
    videoUrl?: string;
    transcript: TranscriptEntry[];
    actionItems: ActionItem[];
  }) => Promise<void>;
}

export function LiveCameraRecorder({
  title,
  participants,
  onValidateBeforeStart,
  onCompleteLiveMeeting,
}: LiveCameraRecorderProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [hasVideoTrack, setHasVideoTrack] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [camDisabled, setCamDisabled] = useState(false);
  const [isOpeningDevices, setIsOpeningDevices] = useState(false);

  const [isLive, setIsLive] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isSegmentPending, setIsSegmentPending] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  const [liveTranscript, setLiveTranscript] = useState<TranscriptEntry[]>([]);
  const [liveActions, setLiveActions] = useState<ActionItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errorIsCookieCheck, setErrorIsCookieCheck] = useState(false);

  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isLiveRef = useRef(false);
  const liveSessionIdRef = useRef<string | null>(null);
  const masterRecorderRef = useRef<MediaRecorder | null>(null);
  const fullChunksRef = useRef<Blob[]>([]);
  const segmentRecorderRef = useRef<MediaRecorder | null>(null);
  const segmentTimerRef = useRef<number | null>(null);
  const elapsedTimerRef = useRef<number | null>(null);
  const sessionStartMsRef = useRef<number>(0);
  const chunkSequenceRef = useRef<number>(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const actionsRef = useRef<ActionItem[]>([]);
  const streamEndRef = useRef<HTMLDivElement>(null);

  const participantsById = new Map(participants.map((p) => [p.id, p]));

  useEffect(() => {
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [liveTranscript.length]);

  useEffect(() => {
    return () => {
      isLiveRef.current = false;
      if (segmentTimerRef.current) window.clearTimeout(segmentTimerRef.current);
      if (elapsedTimerRef.current) window.clearInterval(elapsedTimerRef.current);
      try {
        if (segmentRecorderRef.current?.state === 'recording') {
          segmentRecorderRef.current.stop();
        }
      } catch {
        // Ignore cleanup errors
      }
      try {
        if (masterRecorderRef.current?.state === 'recording') {
          masterRecorderRef.current.stop();
        }
      } catch {
        // Ignore cleanup errors
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const handleOpenDevices = async () => {
    setError(null);
    setErrorIsCookieCheck(false);
    setIsOpeningDevices(true);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          'Camera and microphone capture is unavailable in this browser context.'
        );
      }

      let mediaStream: MediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
      } catch {
        // Fallback to audio-only if camera hardware is unavailable
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true,
        });
      }

      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = mediaStream;
      setStream(mediaStream);
      setHasVideoTrack(mediaStream.getVideoTracks().length > 0);
      setMicMuted(false);
      setCamDisabled(false);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Permission denied or no camera/microphone detected.';
      setError(
        `Unable to access camera or microphone: ${msg}. You can grant permissions in your browser or switch to Upload Video File.`
      );
    } finally {
      setIsOpeningDevices(false);
    }
  };

  const handleCloseDevices = () => {
    if (isLiveRef.current) return;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    setHasVideoTrack(false);
  };

  const toggleMic = () => {
    if (!streamRef.current) return;
    const nextMuted = !micMuted;
    streamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setMicMuted(nextMuted);
  };

  const toggleCamera = () => {
    if (!streamRef.current) return;
    const nextDisabled = !camDisabled;
    streamRef.current.getVideoTracks().forEach((track) => {
      track.enabled = !nextDisabled;
    });
    setCamDisabled(nextDisabled);
  };

  const enqueueSegmentUpload = (
    segmentBlob: Blob,
    offsetSec: number,
    mimeType: string
  ) => {
    if (segmentBlob.size < 2048) return;
    const seq = (chunkSequenceRef.current += 1);

    queueRef.current = queueRef.current.then(async () => {
      if (!liveSessionIdRef.current) return;
      setIsSegmentPending(true);
      try {
        const formData = new FormData();
        formData.append('liveSessionId', liveSessionIdRef.current);
        formData.append('offsetSec', String(offsetSec));
        formData.append('chunkMimeType', mimeType || 'video/webm');
        formData.append('chunk', segmentBlob, `live-seg-${seq}.webm`);

        const response = await apiFetch('/api/meetings/transcribe-live-chunk', {
          method: 'POST',
          body: formData,
        });
        const data = await parseApiResponse<{
          transcript?: TranscriptEntry[];
          actionItems?: ActionItem[];
        }>(response);

        const merged = mergeLiveChunkResults(
          transcriptRef.current,
          actionsRef.current,
          {
            transcript: Array.isArray(data.transcript) ? data.transcript : [],
            actionItems: Array.isArray(data.actionItems) ? data.actionItems : [],
          },
          offsetSec,
          seq
        );
        transcriptRef.current = merged.transcript;
        actionsRef.current = merged.actionItems;
        setLiveTranscript(merged.transcript);
        setLiveActions(merged.actionItems);
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Live segment transcription encountered an issue.';
        setError(msg);
        setErrorIsCookieCheck(isCookieCheckError(err));
      } finally {
        setIsSegmentPending(false);
      }
    });
  };

  const startNextSegmentCycle = (activeStream: MediaStream, mimeType: string) => {
    if (!isLiveRef.current) return;

    const segmentStartOffsetSec = Math.max(
      0,
      Math.round((Date.now() - sessionStartMsRef.current) / 1000)
    );
    const segmentParts: Blob[] = [];
    const options = mimeType ? { mimeType } : undefined;
    const recorder = new MediaRecorder(activeStream, options);
    segmentRecorderRef.current = recorder;

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        segmentParts.push(ev.data);
      }
    };

    recorder.onstop = () => {
      const resolvedMime =
        recorder.mimeType || mimeType || (hasVideoTrack ? 'video/webm' : 'audio/webm');
      const segmentBlob = new Blob(segmentParts, { type: resolvedMime });
      enqueueSegmentUpload(segmentBlob, segmentStartOffsetSec, resolvedMime);

      if (isLiveRef.current && streamRef.current) {
        startNextSegmentCycle(streamRef.current, mimeType);
      }
    };

    recorder.start();
    segmentTimerRef.current = window.setTimeout(() => {
      if (recorder.state === 'recording') {
        recorder.stop();
      }
    }, LIVE_SEGMENT_MS);
  };

  const handleStartLive = async () => {
    const validationErr = onValidateBeforeStart();
    if (validationErr) {
      setError(validationErr);
      setErrorIsCookieCheck(false);
      return;
    }

    if (!streamRef.current) {
      setError('Open your camera and microphone before starting live transcription.');
      setErrorIsCookieCheck(false);
      return;
    }

    setError(null);
    setErrorIsCookieCheck(false);

    try {
      const healthRes = await apiFetch('/api/health');
      await parseApiResponse<{ ok: boolean }>(healthRes);

      const initRes = await apiFetch('/api/meetings/live-session/init', {
        method: 'POST',
      });
      const initData = await parseApiResponse<{ liveSessionId: string }>(initRes);

      liveSessionIdRef.current = initData.liveSessionId;
      transcriptRef.current = [];
      actionsRef.current = [];
      chunkSequenceRef.current = 0;
      queueRef.current = Promise.resolve();
      fullChunksRef.current = [];
      setLiveTranscript([]);
      setLiveActions([]);
      setElapsedSec(0);

      const hasVideo = streamRef.current.getVideoTracks().length > 0;
      const mimeType =
        typeof MediaRecorder !== 'undefined' &&
        typeof MediaRecorder.isTypeSupported === 'function'
          ? hasVideo
            ? pickSupportedRecorderMimeType(MediaRecorder.isTypeSupported)
            : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
              ? 'audio/webm;codecs=opus'
              : 'audio/webm'
          : '';

      const masterRecorder = new MediaRecorder(
        streamRef.current,
        mimeType ? { mimeType } : undefined
      );
      masterRecorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          fullChunksRef.current.push(ev.data);
        }
      };
      masterRecorderRef.current = masterRecorder;
      masterRecorder.start(1000);

      isLiveRef.current = true;
      sessionStartMsRef.current = Date.now();
      setIsLive(true);

      elapsedTimerRef.current = window.setInterval(() => {
        setElapsedSec(
          Math.max(0, Math.round((Date.now() - sessionStartMsRef.current) / 1000))
        );
      }, 1000);

      startNextSegmentCycle(streamRef.current, mimeType);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Unable to start live transcription.';
      setError(msg);
      setErrorIsCookieCheck(isCookieCheckError(err));
    }
  };

  const handleStopAndSave = async () => {
    if (!isLiveRef.current) return;
    isLiveRef.current = false;
    setIsLive(false);
    setIsFinalizing(true);

    if (segmentTimerRef.current) {
      window.clearTimeout(segmentTimerRef.current);
      segmentTimerRef.current = null;
    }
    if (elapsedTimerRef.current) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }

    const totalDurationSec = Math.max(
      1,
      Math.round((Date.now() - sessionStartMsRef.current) / 1000)
    );

    const stopMasterPromise = new Promise<string | undefined>((resolve) => {
      const master = masterRecorderRef.current;
      if (!master || master.state === 'inactive') {
        resolve(undefined);
        return;
      }
      master.onstop = () => {
        if (fullChunksRef.current.length === 0) {
          resolve(undefined);
          return;
        }
        const fullBlob = new Blob(fullChunksRef.current, {
          type: master.mimeType || (hasVideoTrack ? 'video/webm' : 'audio/webm'),
        });
        resolve(URL.createObjectURL(fullBlob));
      };
      master.stop();
    });

    if (segmentRecorderRef.current?.state === 'recording') {
      segmentRecorderRef.current.stop();
    }

    const recordedVideoUrl = await stopMasterPromise;
    await queueRef.current;

    const sessionId = liveSessionIdRef.current;
    liveSessionIdRef.current = null;
    if (sessionId) {
      apiFetch('/api/meetings/live-session/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ liveSessionId: sessionId }),
      }).catch(() => {});
    }

    // Stop live hardware stream cleanly after saving
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    setHasVideoTrack(false);

    try {
      await onCompleteLiveMeeting({
        title: title.trim(),
        participants,
        durationSec: totalDurationSec,
        videoUrl: hasVideoTrack ? recordedVideoUrl : undefined,
        transcript: transcriptRef.current,
        actionItems: actionsRef.current,
      });
    } finally {
      setIsFinalizing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Left: Live Camera / Mic Preview & Controls */}
        <div className="lg:col-span-6 flex flex-col justify-between bg-slate-950 rounded-xl overflow-hidden border border-slate-200 min-h-[280px]">
          <div className="relative flex-1 flex items-center justify-center bg-slate-950">
            {stream ? (
              hasVideoTrack ? (
                <video
                  ref={previewVideoRef}
                  autoPlay
                  muted
                  playsInline
                  aria-label="Live camera preview"
                  className={`w-full h-full max-h-[300px] object-cover ${
                    camDisabled ? 'opacity-20' : 'opacity-100'
                  }`}
                />
              ) : (
                <div className="p-8 text-center space-y-2">
                  <Mic className="h-8 w-8 text-blue-400 mx-auto" aria-hidden="true" />
                  <p className="text-sm font-medium text-white">
                    Microphone Active (Audio-Only Mode)
                  </p>
                  <p className="text-xs text-slate-400">
                    No camera detected; live audio transcription is ready.
                  </p>
                </div>
              )
            ) : (
              <div className="p-8 text-center space-y-3">
                <div className="h-11 w-11 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300 mx-auto">
                  <Video className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-white">
                    Camera &amp; Microphone Standby
                  </p>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto">
                    Open your camera and microphone to record. Only speech is
                    transcribed locally in this stage.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleOpenDevices}
                  disabled={isOpeningDevices || isFinalizing}
                  className="px-4 py-2 inline-flex items-center gap-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 rounded-lg transition-colors whitespace-nowrap"
                >
                  {isOpeningDevices ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>Open Camera &amp; Mic</span>
                </button>
              </div>
            )}

            {/* Live Recording Telemetry Overlay (only while active) */}
            {isLive && (
              <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-black/75 text-white text-xs font-medium">
                  <span
                    className="h-2 w-2 rounded-full bg-red-500 animate-pulse"
                    aria-hidden="true"
                  />
                  <span>Live Recording</span>
                  <span className="font-mono tabular-nums text-slate-300">
                    {formatTimestamp(elapsedSec)}
                  </span>
                </div>
                {isSegmentPending && (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-black/75 text-slate-200 text-xs">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    <span>Transcribing segment...</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Hardware & Live Session Bar */}
          {stream && (
            <div className="px-4 py-3 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleMic}
                  aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
                  className={`px-3 py-1.5 inline-flex items-center gap-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    micMuted
                      ? 'bg-red-950 text-red-200 border border-red-800'
                      : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {micMuted ? (
                    <MicOff className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Mic className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>{micMuted ? 'Mic Muted' : 'Mic On'}</span>
                </button>

                {hasVideoTrack && (
                  <button
                    type="button"
                    onClick={toggleCamera}
                    aria-label={camDisabled ? 'Turn camera on' : 'Turn camera off'}
                    className={`px-3 py-1.5 inline-flex items-center gap-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      camDisabled
                        ? 'bg-amber-950 text-amber-200 border border-amber-800'
                        : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    {camDisabled ? (
                      <CameraOff className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>{camDisabled ? 'Camera Off' : 'Camera On'}</span>
                  </button>
                )}

                {!isLive && !isFinalizing && (
                  <button
                    type="button"
                    onClick={handleCloseDevices}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors whitespace-nowrap"
                  >
                    Close Devices
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {!isLive ? (
                  <button
                    type="button"
                    onClick={handleStartLive}
                    disabled={isFinalizing}
                    className="px-4 py-2 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    {isFinalizing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Radio className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>
                      {isFinalizing
                        ? 'Finalizing Meeting...'
                        : 'Start Live Transcription'}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStopAndSave}
                    className="px-4 py-2 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <Square className="h-3 w-3 fill-current" aria-hidden="true" />
                    <span>Stop &amp; Save Meeting</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Real-Time Transcript & Highlighted Actions Feed */}
        <div className="lg:col-span-6 bg-slate-50 border border-slate-200 rounded-xl flex flex-col min-h-[280px] max-h-[360px]">
          <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between gap-3 rounded-t-xl">
            <h3 className="text-xs font-semibold text-slate-900">
              Live Transcript &amp; Action Stream
            </h3>
            <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-500">
              <span>{liveTranscript.length} turns</span>
              <span aria-hidden="true">·</span>
              <span>{liveActions.length} actions</span>
            </div>
          </div>

          <div
            data-testid="live-transcript-stream"
            className="flex-1 overflow-y-auto p-4 space-y-3"
          >
            {liveTranscript.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8 space-y-1.5">
                <p className="text-xs font-medium text-slate-700">
                  {isLive
                    ? 'Listening and watching live video...'
                    : 'No live transcript turns yet'}
                </p>
                <p className="text-xs text-slate-500 max-w-xs">
                  {isLive
                    ? 'Audio segments are transcribed locally every 6 seconds. Speaker identity and camera analysis are not available yet.'
                    : 'Open your microphone and start live transcription to see recognized speech here.'}
                </p>
              </div>
            ) : (
              liveTranscript.map((entry) => {
                const speaker = participantsById.get(entry.speakerId);
                const highlightParts = splitTextAroundHighlight(
                  entry.text,
                  entry.highlightedPhrase
                );
                return (
                  <article
                    key={entry.id}
                    className="bg-white border border-slate-200 rounded-lg p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <ParticipantAvatar
                          name={entry.speakerName}
                          imageUrl={speaker?.imageUrl}
                          size="sm"
                        />
                        <span className="text-xs font-semibold text-slate-900 truncate">
                          {entry.speakerName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {entry.emotionAnalyzed === false ? (
                          <span className="text-[11px] text-slate-500">
                            Camera analysis not available yet
                          </span>
                        ) : (
                          <EmotionSignal
                            emotion={entry.emotion}
                            intensity={entry.emotionIntensity}
                            showIntensity
                          />
                        )}
                        <span className="text-[11px] font-mono tabular-nums text-slate-500">
                          {formatTimestamp(entry.startSec)}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-800 leading-relaxed">
                      {highlightParts ? (
                        <>
                          {highlightParts.before}
                          <mark className="bg-amber-100 text-slate-950 px-1 py-0.5 rounded font-medium">
                            {highlightParts.match}
                          </mark>
                          {highlightParts.after}
                        </>
                      ) : (
                        entry.text
                      )}
                    </p>

                    {entry.actionItemId && (
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-800">
                        <CheckSquare className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span>Action highlighted automatically</span>
                      </div>
                    )}
                  </article>
                );
              })
            )}
            <div ref={streamEndRef} />
          </div>
        </div>
      </div>

      {error &&
        (errorIsCookieCheck ? (
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
            className="flex items-center gap-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ))}
    </div>
  );
}
