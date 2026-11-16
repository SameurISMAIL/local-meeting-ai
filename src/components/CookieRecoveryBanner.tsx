import { useState } from 'react';
import {
  AlertCircle,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { apiFetch, parseApiResponse } from '../utils/apiClient';

interface CookieRecoveryBannerProps {
  message: string;
  onCookiesVerified?: () => void;
}

export function CookieRecoveryBanner({
  message,
  onCookiesVerified,
}: CookieRecoveryBannerProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const handleAllowCookies = async () => {
    setIsChecking(true);
    setStatusNote(null);
    try {
      if (typeof document.requestStorageAccess === 'function') {
        await document.requestStorageAccess();
      }
      const res = await apiFetch('/api/health');
      await parseApiResponse<{ ok: boolean }>(res);
      setStatusNote('Session cookie verified. You can retry your action now.');
      onCookiesVerified?.();
    } catch {
      setStatusNote(
        'Browser still blocked iframe cookies. Click "Open in New Tab" to run the app with first-party cookies.'
      );
    } finally {
      setIsChecking(false);
    }
  };

  const currentHref =
    typeof window !== 'undefined' ? window.location.href : '#';

  return (
    <div
      role="alert"
      className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg p-3.5 space-y-2.5"
    >
      <div className="flex items-start gap-2 font-medium">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-700" aria-hidden="true" />
        <span>{message}</span>
      </div>

      {statusNote && (
        <p className="text-xs text-slate-700 bg-white border border-red-200 rounded-md px-2.5 py-1.5">
          {statusNote}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={handleAllowCookies}
          disabled={isChecking}
          className="px-3 py-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 rounded-md transition-colors whitespace-nowrap"
        >
          {isChecking ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span>Allow Preview Cookies</span>
        </button>

        <a
          href={currentHref}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 rounded-md transition-colors whitespace-nowrap"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Open in New Tab</span>
        </a>

        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-3 py-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-md transition-colors whitespace-nowrap"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Reload Preview</span>
        </button>
      </div>
    </div>
  );
}
