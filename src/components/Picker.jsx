import { useMemo, useRef, useState } from 'react';
import { iconSrc } from '../lib/format.js';

/**
 * Search box with a dropdown list of matching options (perks, items, add-ons...).
 * `options` = array of objects with name/icon/description. `onPick` gets the chosen object.
 */
export default function Picker({ options, value, onPick, placeholder = 'Search…', allowClear = true }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const blurTimer = useRef();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options
      .filter((o) => !q || o.name.toLowerCase().includes(q) || (o.character ?? '').toLowerCase().includes(q))
      .sort((a, b) => {
        // Names that start with the query first.
        const as = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bs = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        return as - bs || a.name.localeCompare(b.name);
      })
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
                <div>{o.name}</div>
                {o.character && <div className="muted small">{o.character}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
