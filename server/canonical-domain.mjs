// Redirect public aliases only: local development and preview hosts keep working.
export function canonicalRedirect(request) {
  const target = new URL(request.url);
  if (!['www.trickortake.com','candy.convoai.workers.dev'].includes(target.hostname)) return null;
  target.protocol = 'https:';
  target.host = 'trickortake.com';
  return Response.redirect(target.toString(), 308);
}
