/** "3 days ago", "5 hours ago", ... */
export function timeAgo(iso) {
  if (!iso) return 'never';
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [name, size] of units) {
    const n = Math.floor(seconds / size);
    if (n >= 1) return `${n} ${name}${n > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}

export function ageInDays(iso) {
  return iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : Infinity;
}

/** Prefer the locally cached icon, fall back to the wiki URL. */
export function iconSrc(icon) {
  return icon?.local || icon?.remote || '';
}

/** "in 3 hours", "in 2 days", "now" */
export function timeUntil(iso) {
  if (!iso) return '';
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  if (seconds <= 60) return 'now';
  const units = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [name, size] of units) {
    const n = Math.floor(seconds / size);
    if (n >= 1) return `in ${n} ${name}${n > 1 ? 's' : ''}`;
  }
  return 'now';
}

/** "2026-11-24" -> "Tue 24 Nov" */
export function shortDate(isoDay) {
  return new Date(`${isoDay}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}
