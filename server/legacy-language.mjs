import {publicPage, publicUrl} from '../public/party/locale.mjs';

// Old shared and indexed links used ?lang=en|zh. Keep their room/result
// parameters while moving the language onto the canonical URL path.
export function legacyLanguageRedirect(request) {
  if (!['GET', 'HEAD'].includes(request.method)) return null;
  const url = new URL(request.url);
  const page = publicPage(url.pathname);
  const requested = url.searchParams.get('lang');
  if (!page || !['en', 'zh'].includes(requested)) return null;
  url.searchParams.delete('lang');
  const target = publicUrl(url.origin, page.lang === 'zh' ? 'zh' : requested,
    page.page === 'home' ? '' : page.page, url.searchParams);
  return Response.redirect(target, 308);
}
