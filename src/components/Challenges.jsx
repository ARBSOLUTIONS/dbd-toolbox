import { useMemo, useRef, useState } from 'react';
import { Slot } from './BuildCard.jsx';
import { KINDS, DIFFICULTIES, generateChallenge, dailyChallenge, weeklyChallenge, resolveChallenge } from '../lib/challenges.js';
import { localDay, isoWeek } from '../lib/random.js';
import { timeAgo } from '../lib/format.js';

function ChallengeCard({ challenge, data, children, highlight }) {
  const ch = useMemo(() => resolveChallenge(challenge, data), [challenge, data]);
  const r = ch.resolved;
  return (
    <article className={`card challenge-card diff-${ch.difficulty} ${highlight ?? ''}`}>
      <header className="build-head">
        <div>
          {ch.label && <div className="challenge-label">{ch.label}</div>}
          <h3>{ch.title}</h3>
          <div className="badges">
            <span className={`badge badge-diff-${ch.difficulty}`}>{DIFFICULTIES[ch.difficulty]}</span>
            <span className="badge">{KINDS[ch.kind]}</span>
            <span className="badge">{ch.role === 'killer' ? ch.killer : 'Survivor'}</span>
          </div>
        </div>
        <div className="points" title="Challenge points">
          {ch.points}
          <span>pts</span>
        </div>
      </header>

      <p className="why">{ch.description}</p>
      <p className="objective">
        🎯 <strong>Objective:</strong> {ch.objective}
      </p>

      {r.perks.length > 0 ? (
        <div className="slots">
          {r.perks.map((p, i) => (
            <Slot key={i} entity={p} fallback={ch.perks[i]} />
          ))}
        </div>
      ) : (
        <p className="muted small">No perks.</p>
      )}
      {(r.item || r.killer || r.character || r.addons.length > 0) && (
        <div className="slots slots-small">
          {ch.role === 'survivor' && r.character && <Slot entity={r.character} />}
          {r.item && <Slot entity={r.item} />}
          {ch.role === 'killer' && r.killer && <Slot entity={r.killer} />}
          {r.addons.map((a) => (
            <Slot key={a.id} entity={a} />
          ))}
        </div>
      )}
      {children && <div className="challenge-actions">{children}</div>}
    </article>
  );
}

export default function Challenges({ data, curated, store }) {
  const [role, setRole] = useState('any');
  const [difficulty, setDifficulty] = useState('any');
  const [kind, setKind] = useState('any');
  const [current, setCurrent] = useState(null);
  const [message, setMessage] = useState(null);
  const fileInput = useRef();

  const daily = useMemo(() => dailyChallenge(data, curated, localDay()), [data, curated]);
  const weekly = useMemo(() => weeklyChallenge(data, curated, isoWeek()), [data, curated]);

  const generate = () => setCurrent(generateChallenge(data, curated, { role, difficulty, kind }));

  const status = (id) => store.isKnown(id);
  const acceptButton = (ch) => {
    const s = status(ch.id);
    if (s === 'completed') return <span className="done-label">✓ Completed</span>;
    if (s === 'failed') return <span className="muted small">Failed</span>;
    if (s) return <span className="muted small">In your active challenges</span>;
    return <button onClick={() => store.accept(ch)}>Accept challenge</button>;
  };

  async function onImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      store.importText(await file.text());
      setMessage('Challenges imported.');
    } catch (err) {
      setMessage(`Could not import: ${err.message}`);
    }
    e.target.value = '';
  }

  const s = store.stats;

  return (
    <section className="challenges">
      <div className="challenge-stats card">
        <div>
          <strong>{s.points}</strong>
          <span>points</span>
        </div>
        <div>
          <strong>{s.completed}</strong>
          <span>completed</span>
        </div>
        <div>
          <strong>{store.active.length}</strong>
          <span>active</span>
        </div>
        <div>
          <strong>
            {store.achievements.filter((a) => a.unlocked).length}/{store.achievements.length}
          </strong>
          <span>achievements</span>
        </div>
        <div className="grow" />
        <button onClick={store.exportFile}>Export</button>
        <button onClick={() => fileInput.current.click()}>Import</button>
        <input ref={fileInput} type="file" accept="application/json" hidden onChange={onImport} />
      </div>
      {message && <p className="small">{message}</p>}

      <h3 className="section-title">Daily & weekly</h3>
      <div className="build-grid">
        <ChallengeCard challenge={daily} data={data} highlight="is-daily">
          {acceptButton(daily)}
        </ChallengeCard>
        <ChallengeCard challenge={weekly} data={data} highlight="is-weekly">
          {acceptButton(weekly)}
        </ChallengeCard>
      </div>

      <h3 className="section-title">Challenge generator</h3>
      <div className="toolbar">
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="any">Any role</option>
          <option value="survivor">Survivor</option>
          <option value="killer">Killer</option>
        </select>
        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
          <option value="any">Any difficulty</option>
          {Object.entries(DIFFICULTIES).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="any">Any kind</option>
          {Object.entries(KINDS).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <button className="primary" onClick={generate}>
          🎲 {current ? 'Reroll' : 'Generate challenge'}
        </button>
      </div>
      {current && (
        <div className="build-grid">
          <ChallengeCard challenge={current} data={data}>
            {acceptButton(current)}
            <button onClick={generate}>🎲 Reroll</button>
          </ChallengeCard>
        </div>
      )}

      <h3 className="section-title">Active challenges ({store.active.length})</h3>
      {store.active.length ? (
        <div className="build-grid">
          {store.active.map((ch) => (
            <ChallengeCard key={ch.id} challenge={ch} data={data}>
              <button className="ok" onClick={() => store.finish(ch.id, 'completed')}>
                ✓ Completed
              </button>
              <button onClick={() => store.finish(ch.id, 'failed')}>✗ Failed</button>
              <button className="link-button" onClick={() => store.abandon(ch.id)}>
                Remove
              </button>
            </ChallengeCard>
          ))}
        </div>
      ) : (
        <p className="muted">No active challenges. Generate one above, or take the daily challenge.</p>
      )}

      {store.history.length > 0 && (
        <>
          <h3 className="section-title">History</h3>
          <ul className="history">
            {store.history.slice(0, 30).map((h) => (
              <li key={h.challenge.id + h.finishedAt}>
                <span className={h.status === 'completed' ? 'pro-mark' : 'con-mark'}>
                  {h.status === 'completed' ? '✓' : '✗'}
                </span>
                <strong>{h.challenge.title}</strong>
                <span className="muted small">
                  {' '}
                  · {h.challenge.role === 'killer' ? h.challenge.killer : 'Survivor'} ·{' '}
                  {DIFFICULTIES[h.challenge.difficulty]} · {timeAgo(h.finishedAt)}
                </span>
                {h.status === 'completed' && <span className="history-points">+{h.challenge.points}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
