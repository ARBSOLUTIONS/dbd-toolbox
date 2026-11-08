// Where the app gets its data:
// - Local mode (npm run dev / npm start): from the local server (/api/...).
//   You can refresh data with the button.
// - Public static mode (npm run build:static, used for the website): from
//   pre-built JSON files. Data is updated by GitHub Actions, not by visitors.
export const STATIC = import.meta.env.VITE_STATIC === '1';
export const SITE_NAME = 'DBD-Toolbox';

export function loadData() {
  return fetch(STATIC ? '/data/app-data.json' : '/api/data').then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });
}

/** Auto-update status: live from the server, or the snapshot made at build time. */
export function loadAutoStatus() {
  return fetch(STATIC ? '/data/status.json' : '/api/auto-update').then((r) => r.json());
}
