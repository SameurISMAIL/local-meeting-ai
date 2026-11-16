import { useState } from 'react';

interface ParticipantAvatarProps {
  name: string;
  imageUrl?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function ParticipantAvatar({
  name,
  imageUrl,
  size = 'md',
}: ParticipantAvatarProps) {
  const [failed, setFailed] = useState(false);

  if (!imageUrl || failed) {
    return (
      <div
        aria-label={name}
        className={`${SIZE_CLASSES[size]} shrink-0 rounded-lg border border-slate-200 bg-slate-100 text-slate-700 font-semibold flex items-center justify-center select-none`}
      >
        {getInitials(name)}
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={`Portrait of ${name}`}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${SIZE_CLASSES[size]} shrink-0 rounded-lg border border-slate-200 object-cover bg-slate-100`}
    />
  );
}
