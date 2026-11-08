import { useMemo, useState } from 'react';
import { iconSrc } from '../lib/format.js';
import { analysePatch, wordDiff, VERDICTS, LEVELS } from '../lib/patchImpact.js';
import { ScoreBadge, Slot } from './BuildCard.jsx';

const FILTERS = [
  ['all', 'All'],
  ['buff', '▲ Buffs'],
  ['nerf', '▼ Nerfs'],
  ['mixed', '◆ Mixed'],
  ['rework', '↻ Reworks'],
];

function patchTitle(r) {
  if (!r) return 'No patch data yet';
  return r.fromPatch && r.toPatch && r.fromPatch !== r.toPatch ? `Patch ${r.fromPatch} → ${r.toPatch}` : `Update on patch ${r.toPatch ?? '?'}`;
}

function ImpactMeter({ level, verdict }) {
  return (
    <span className={`impact-meter v-${verdict}`} title={`${LEVELS[level]} impact`}>
      {[1, 2, 3].map((n) => (
        <i key={n} className={n <= level ? 'on' : ''} />
      ))}
      <span>{LEVELS[level]}</span>
    </span>
  );
}

function Diff({ before, after }) {
  const parts = useMemo(() => wordDiff(before, after), [before, after]);
  return (
    <p className="diff-text">
      {parts.map((p, i) =>
        p.type === 'same' ? (
          <span key={i}>{p.text}</span>
        ) : p.type === 'del' ? (
          <del key={i}>{p.text}</del>
        ) : (
          <ins key={i}>{p.text}</ins>
        ),
      )}
    </p>
  );
}

function PerkChange({ change, onShowBuild }) {
  const [open, setOpen] = useState(false);
  const { judgement: j, perk } = change;
  const v = VERDICTS[j.verdict];
  return (
    <article className={`card perk-change v-${j.verdict}`}>
      <header className="perk-change-head">
        {perk ? <img src={iconSrc(perk.icon)} alt="" loading="lazy" /> : <div className="slot-empty" />}
        <div className="grow">
          <h3>{change.name}</h3>
          <div className="muted small">
            {change.role === 'killer' ? 'Killer perk' : 'Survivor perk'}
            {perk ? ` · ${perk.owner?.name ?? 'General'}` : ''}
          </div>
        </div>
        <div className="perk-change-verdict">
          <span className={`verdict v-${j.verdict}`}>
            {v.icon} {v.label}
          </span>
          <ImpactMeter level={j.level} verdict={j.verdict} />
        </div>
      </header>

      {j.changes.length > 0 && (
        <ul className="num-changes">
          {j.changes.map((c, i) => (
            <li key={i} className={c.good ? 'good' : 'bad'}>
              <span>{c.good ? '▲' : '▼'}</span>
              <span className="num-change-text">
                {c.pre}{' '}
                <b>
                  <s>{c.from}</s> → {c.to}
                </b>{' '}
                {c.post}
              </span>
              <em>
                {c.pct > 0 ? '+' : ''}
                {c.pct}%
              </em>
            </li>
          ))}
        </ul>
      )}

      <p className="small perk-change-usage">
        {change.builds.length ? (
          <>
            Used in <strong>{change.builds.length}</strong> build{change.builds.length === 1 ? '' : 's'}
            {change.handPicked ? ` (${change.handPicked} hand-picked)` : ''}:{' '}
            {change.builds.slice(0, 4).map((b, i) => (
              <span key={b.id}>
                {i > 0 && ', '}
                <button className="link-button small" onClick={() => onShowBuild(b)}>
                  {b.name}
                </button>
              </span>
            ))}
            {change.builds.length > 4 && ` +${change.builds.length - 4} more`}
          </>
        ) : (
          <span className="muted">Not used in any build on this site.</span>
        )}
      </p>

      <button className="link-button small" onClick={() => setOpen(!open)}>
        {open ? 'Hide text changes ▴' : 'Show exact text changes ▾'}
      </button>
      {open && <Diff before={change.before} after={change.after} />}
    </article>
  );
}

function AffectedBuild({ entry, onShow }) {
  const { build, score, perks } = entry;
  const tone = score > 0.05 ? 'buff' : score < -0.05 ? 'nerf' : perks.some((p) => p.judgement.verdict === 'rework') ? 'rework' : 'mixed';
  const label = { buff: 'Stronger', nerf: 'Weaker', rework: 'Needs a look', mixed: 'About the same' }[tone];
  return (
    <button className={`affected-build v-${tone}`} onClick={() => onShow(build)}>
      <ScoreBadge score={build.rating?.score ?? 0} community={build.rating?.community} />
      <div className="grow">
        <strong>{build.name}</strong>
        <div className="muted small">
          {build.type === 'auto' ? 'Auto-generated' : 'Hand-picked'} · {build.role === 'killer' ? build.killer ?? 'Any killer' : 'Survivor'}
        </div>
        <div className="affected-perks small">
          {perks.map((p) => (
            <span key={p.id} className={`verdict mini v-${p.judgement.verdict}`}>
              {VERDICTS[p.judgement.verdict].icon} {p.name}
            </span>
          ))}
        </div>
      </div>
      <span className={`verdict v-${tone}`}>{label}</span>
    </button>
  );
}

export default function PatchNotes({ data, builds, onShowBuild }) {
  const records = useMemo(() => {
    const list = data.patchNotes?.length ? data.patchNotes : data.changes ? [data.changes] : [];
    return list;
  }, [data]);
  const [index, setIndex] = useState(0);
  const [filter, setFilter] = useState('all');
  const record = records[index];
  const analysis = useMemo(() => analysePatch(record, data, builds), [record, data, builds]);
  const shown = analysis.perks.filter((p) => filter === 'all' || p.judgement.verdict === filter);

  const other = record
    ? [
        ['🔪', 'New killers', record.killers?.added ?? []],
        ['🏃', 'New survivors', record.survivors?.added ?? []],
        ['✖', 'Removed perks', record.perks?.removed ?? []],
        ['🔦', 'Changed items', record.items?.changed ?? []],
        ['🔧', 'Changed add-ons', record.addons?.changed ?? []],
        ['🧩', 'New add-ons', record.addons?.added ?? []],
        ['🕯️', 'New offerings', record.offerings?.added ?? []],
        ['🕯️', 'Changed offerings', record.offerings?.changed ?? []],
      ].filter(([, , list]) => list.length)
    : [];

  const history = data.patchHistory ?? [];

  return (
    <section className="patch-notes">
      <div className="patch-hero card">
        <div>
          <p className="eyebrow">📜 Patch notes</p>
          <h2>{patchTitle(record)}</h2>
          <p className="muted small">
            {record?.date ? `Detected ${new Date(record.date).toLocaleDateString()}. ` : ''}
            Buffs and nerfs are estimated by comparing the old and new perk text: durations, cooldowns, percentages and
            other numbers. Always check the exact text changes.
          </p>
        </div>
        {records.length > 1 && (
          <select value={index} onChange={(e) => setIndex(Number(e.target.value))} aria-label="Choose an update">
            {records.map((r, i) => (
              <option key={r.date ?? i} value={i}>
                {patchTitle(r)} · {r.date ? new Date(r.date).toLocaleDateString() : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="patch-stats">
        <div className="stat v-buff">
          <strong>{analysis.counts.buff}</strong>
          <span>Buffs</span>
        </div>
        <div className="stat v-nerf">
          <strong>{analysis.counts.nerf}</strong>
          <span>Nerfs</span>
        </div>
        <div className="stat v-rework">
          <strong>{analysis.counts.rework + analysis.counts.mixed}</strong>
          <span>Reworks / mixed</span>
        </div>
        <div className="stat v-new">
          <strong>{analysis.newPerks.length}</strong>
          <span>New perks</span>
        </div>
        <div className="stat">
          <strong>{analysis.builds.length}</strong>
          <span>Builds affected</span>
        </div>
      </div>

      {analysis.builds.length > 0 && (
        <>
          <h2 className="section-title">Impact on builds</h2>
          <p className="muted small">The builds on this site that use a changed perk, hand-picked builds first.</p>
          <div className="affected-list">
            {analysis.builds.slice(0, 12).map((e) => (
              <AffectedBuild key={e.build.id} entry={e} onShow={onShowBuild} />
            ))}
          </div>
          {analysis.builds.length > 12 && (
            <p className="muted small">+{analysis.builds.length - 12} more builds use a changed perk.</p>
          )}
        </>
      )}

      <h2 className="section-title">Perk changes</h2>
      {analysis.perks.length > 0 ? (
        <>
          <div className="segmented patch-filter">
            {FILTERS.map(([id, label]) => (
              <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="perk-change-grid">
            {shown.map((c) => (
              <PerkChange key={`${c.role}:${c.id}`} change={c} onShowBuild={onShowBuild} />
            ))}
          </div>
          {!shown.length && <p className="muted">No perk changes of this kind in this update.</p>}
        </>
      ) : (
        <p className="muted card empty-note">
          No perk balance changes in this update. From now on, every patch is tracked automatically with buffs, nerfs and
          their impact on builds.
        </p>
      )}

      {analysis.newPerks.length > 0 && (
        <>
          <h2 className="section-title">New perks</h2>
          <div className="slots new-perk-slots">
            {analysis.newPerks.map((p) => (
              <Slot key={p.id} entity={p} showOwner />
            ))}
          </div>
        </>
      )}

      {other.length > 0 && (
        <>
          <h2 className="section-title">Other changes</h2>
          <div className="other-changes">
            {other.map(([icon, label, list]) => (
              <details key={label} className="card">
                <summary>
                  <span aria-hidden="true">{icon}</span> {label} <span className="count">{list.length}</span>
                </summary>
                <p className="small muted">{list.join(', ')}</p>
              </details>
            ))}
          </div>
        </>
      )}

      {history.length > 0 && (
        <>
          <h2 className="section-title">Patch timeline</h2>
          <ol className="patch-timeline">
            {history.slice(0, 12).map((h, i) => (
              <li key={h.version} className={i === 0 ? 'current' : ''}>
                <strong>{h.version}</strong>
                <span className="muted small">
                  {new Date(`${h.date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
