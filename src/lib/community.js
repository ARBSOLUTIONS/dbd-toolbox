// Talks to the community builds API (/api/community/...). The same paths work
// locally (dev server) and on the live site (Cloudflare Pages Function + D1).

async function call(path, options = {}) {
  const res = await fetch(`/api/community${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export const fetchCommunityBuilds = ({ role, killer, sort }) => {
  const q = new URLSearchParams({ sort: sort || 'top' });
  if (role) q.set('role', role);
  if (killer) q.set('killer', killer);
  return call(`/builds?${q}`).then((r) => r.builds);
};

export const shareBuild = (build) => call('/builds', { method: 'POST', body: JSON.stringify(build) }).then((r) => r.build);
export const voteOnBuild = (id, value) => call(`/builds/${encodeURIComponent(id)}/vote`, { method: 'POST', body: JSON.stringify({ value }) });
export const reportCommunityBuild = (id) => call(`/builds/${encodeURIComponent(id)}/report`, { method: 'POST', body: '{}' });

/** Converts an API build into the shape BuildCard understands. */
export function toBuildCardShape(b) {
  return {
    ...b,
    type: 'community',
    why: b.description,
    itemAddons: b.role === 'survivor' ? b.addons : undefined,
    addons: b.role === 'killer' ? b.addons : undefined,
  };
}
