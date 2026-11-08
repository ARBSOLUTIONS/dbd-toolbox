import { useCallback, useEffect, useState } from 'react';
import { timeAgo, ageInDays, timeUntil, shortDate } from '../lib/format.js';
import { STATIC, loadAutoStatus } from '../lib/api.js';

/**
 * Shows how old the data is, the predicted next patch, the automatic-update
 * status, and a "Refresh data" button. It also notices refreshes started
 * automatically by the server and reloads the data when they finish.
 */
export default function DataStatus({ meta, onRefreshed }) {
  const [status, setStatus] = useState(null);
  const [auto, setAuto] = useState(null);
  const running = status?.running;

  const loadAuto = useCallback(() => {
    loadAutoStatus()
      .then(setAuto)
      .catch(() => {});
  }, []);

  // Fast polling while a refresh runs; slow polling otherwise (to catch automatic ones).
  useEffect(() => {
    if (STATIC) return undefined; // the public site has no server to ask
    let wasRunning = running;
    const poll = async () => {
      try {
        const s = await fetch('/api/refresh').then((r) => r.json());
        setStatus(s);
        if (wasRunning && !s.running) {
          loadAuto();
          if (!s.error) onRefreshed();
        }
        wasRunning = s.running;
      } catch {
        /* server restarting: try again next tick */
      }
    };
    poll();
    const timer = setInterval(poll, running ? 1500 : 60_000);
    return () => clearInterval(timer);
  }, [running, onRefreshed, loadAuto]);

  // Auto-update status (next check, prediction): load now and every 10 minutes.
  useEffect(() => {
    loadAuto();
    const timer = setInterval(loadAuto, 10 * 60_000);
    return () => clearInterval(timer);
  }, [loadAuto]);

  async function startRefresh() {
    const res = await fetch('/api/refresh', { method: 'POST' });
    if (res.ok || res.status === 409) setStatus({ running: true, log: ['Starting...'] });
  }

  const old = ageInDays(meta?.fetchedAt) > 14;
  const lastLine = status?.log?.[status.log.length - 1];

  const autoText = !auto
    ? null
    : STATIC
      ? 'Updates automatically after each patch'
      : !auto.enabled
      ? 'Auto-update off'
      : `Auto-update on · next check ${timeUntil(auto.nextCheck)}`;
  const autoTitle = auto
    ? [
        auto.lastCheck && `Last check ${timeAgo(auto.lastCheck)}: ${auto.lastResult?.why ?? ''}.`,
        `Normally every ${auto.hours} hours; on predicted patch days every hour.`,
        auto.checkEveryHoursNow < auto.hours &&
          `Right now: checking every ${auto.checkEveryHoursNow} hour(s) (patch window).`,
        auto.followUpAt && `Follow-up refresh ${timeUntil(auto.followUpAt)} (the wiki is still being updated).`,
      ]
        .filter(Boolean)
        .join('\n')
    : undefined;

  // Next expected patches: announced on the wiki, or predicted from the patch rhythm.
  const prediction = auto?.prediction;
  const predictions = prediction?.predictions ?? [];
  const [next, second] = predictions;
  const predictionTitle = prediction
    ? [
        ...predictions.map(
          (p) => `${shortDate(p.date)}: ${p.label}${p.source === 'pattern' ? ` (${p.confidence} confidence)` : ''}`,
        ),
        '',
        prediction.lastPatch &&
          `Last patch: ${prediction.lastPatch.version} on ${shortDate(prediction.lastPatch.date)}.`,
        `${Math.round(prediction.weekdayShare * 100)}% of recent patches came out on a ${prediction.usualWeekday}, ` +
          `about every ${Math.round(prediction.medianDays)} days.`,
        'On these days the app checks the wiki every hour.',
      ]
        .filter((x) => x !== null && x !== undefined && x !== false)
        .join('\n')
    : undefined;
  const nameOf = (p) => (p.source === 'announced' ? ` ${p.label.split(' (')[0]}` : '');

  return (
    <div className={`data-status ${old ? 'is-old' : ''}`}>
      {meta ? (
        <span title={new Date(meta.fetchedAt).toLocaleString()}>
          Patch <strong>{meta.patch ?? '?'}</strong> · data fetched <strong>{timeAgo(meta.fetchedAt)}</strong>
          {old && ' — consider refreshing'}
        </span>
      ) : meta === null ? (
        <span>No data yet — click “Refresh data”.</span>
      ) : null /* still loading */}
      {next && (
        <span className="auto-status prediction" title={predictionTitle}>
          Next patch ≈ <strong>{shortDate(next.date)}</strong>
          {next.source === 'announced' ? nameOf(next) : ' (likely)'}
          {second && ` · ${shortDate(second.date)}${nameOf(second)}`}
        </span>
      )}
      {autoText && (
        <span className="auto-status" title={autoTitle}>
          {autoText}
        </span>
      )}
      {!STATIC && (
        <button onClick={startRefresh} disabled={running}>
          {running ? 'Refreshing…' : 'Refresh data'}
        </button>
      )}
      {running && (
        <span className="muted small">
          {status?.reason?.startsWith('auto') ? 'Automatic update: ' : ''}
          {lastLine}
        </span>
      )}
      {status?.error && !running && <span className="error small">{status.error}</span>}
    </div>
  );
}
