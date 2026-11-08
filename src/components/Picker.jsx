import { useMemo, useRef, useState } from 'react';
import { iconSrc } from '../lib/format.js';
import { makeQuery } from '../lib/search.js';

/**
 * Search box with a dropdown list of matching options (perks, items, add-ons...).
 * `options` = array of objects with name/icon/description. `onPick` gets the chosen object.
 */
export default function Picker({ options, value, onPick, placeholder = 'Search…', allowClear = true }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const blurTimer = useRef();

  const matches = useMemo(() => {
    const q = makeQuery(query);
    const rank = (o) => Math.min(q.rank(o.name), q.rank(o.character ?? '') + 3);
    return options
      .map((o) => ({ o, r: rank(o) }))
      .filter(({ r }) => r !== Infinity)
      .sort((a, b) => {
        // Pinned options (e.g. favourite perks) first, then the best name matches.
        if (!!a.o.pinned !== !!b.o.pinned) return a.o.pinned ? -1 : 1;
        return a.r - b.r || a.o.name.localeCompare(b.o.name);
      })
      .map(({ o }) => o)
      .slice(0, 40);
  }, [options, query]);

  function pick(o) {
    onPick(o);
    setQuery('');
    setOpen(false);
  }

  return (
    <div className="picker">
      {value && !open ? (
        <button className="picker-value" onClick={() => setOpen(true)} title={value.description}>
          <img src={iconSrc(value.icon ?? value.portrait)} alt="" />
          <span>{value.name}</span>
          {allowClear && (
            <span
              className="picker-clear"
              role="button"
              title="Remove"
              onClick={(e) => {
                e.stopPropagation();
                onPick(null);
              }}
            >
              ×
            </span>
          )}
        </button>
      ) : (
        <input
          type="search"
          autoFocus={open}
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => (blurTimer.current = setTimeout(() => setOpen(false), 150))}
        />
      )}
      {open && (
        <ul className="picker-list" onMouseDown={() => clearTimeout(blurTimer.current)}>
          {matches.length === 0 && <li className="muted small">No matches</li>}
          {matches.map((o) => (
            <li key={o.id + (o.killer ?? o.itemType ?? '')} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)}>
              <img src={iconSrc(o.icon ?? o.portrait)} alt="" loading="lazy" />
              <div>
                <div>
                  {o.pinned && <span className="pin">★ </span>}
                  {o.name}
                </div>
                {o.character && <div className="muted small">{o.character}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
