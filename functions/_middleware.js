// Send visitors and crawlers from the old pages.dev address to the own domain (301 keeps Google rankings).
// Only the production host; preview deployments (<hash>.dbd-toolbox.pages.dev) keep working.
const OLD_HOST = 'dbd-toolbox.pages.dev';
const NEW_HOST = 'dbdtoolbox.wiki';

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (url.hostname === OLD_HOST) {
    url.hostname = NEW_HOST;
    url.protocol = 'https:';
    url.port = '';
    return Response.redirect(url.toString(), 301);
  }
  return next();
}
