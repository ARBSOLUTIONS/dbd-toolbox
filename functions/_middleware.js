// Send old/alternate hosts to the canonical domain with a permanent redirect.
const REDIRECT_HOSTS = new Set(['dbd-toolbox.pages.dev', 'www.dbdtoolbox.wiki']);
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
