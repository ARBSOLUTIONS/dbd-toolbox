// Google Search Console verification file.
// Cloudflare Pages normally redirects "/name.html" to "/name" (308), and Google
// wants the file at the exact .html URL. This tiny Pages Function serves it
// directly at that URL with status 200.
const TOKEN = 'google95867161d26e0fbb.html';

export function onRequest() {
  return new Response(`google-site-verification: ${TOKEN}`, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
