// Send old/alternate hosts to the canonical domain with a permanent redirect.
const REDIRECT_HOSTS = new Set(['www.dbdtoolbox.wiki']) // TODO re-add 'dbd-toolbox.pages.dev' once dbdtoolbox.wiki DNS is delegated to Cloudflare;
const NEW_HOST = 'dbdtoolbox.wiki';

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (REDIRECT_HOSTS.has(url.hostname)) {
    url.hostname = NEW_HOST;
    url.protocol = 'https:';
    url.port = '';
    return Response.redirect(url.toString(), 301);
  }
  return next();
}
