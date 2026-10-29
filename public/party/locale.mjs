export const PAGE_META = Object.freeze({
  en: {title:'Trick or Take · Halloween candy game',description:'Play Trick or Take solo or with friends. Take candy, dodge Lily, and see how much you can collect in 60 seconds.',locale:'en_US'},
  zh: {title:'Trick or Take · 万圣节偷糖挑战',description:'选择简单、中等或困难，独自偷糖或和朋友开麦 PK。她回头时别动，游戏结束后由你决定是否把成绩加入排行榜。',locale:'zh_CN'},
});

const PAGE = /^\/(?:zh\/?)?(?:privacy|terms)?\/?$/;

export function requestLanguage(url) {
  const parsed = new URL(url, 'https://trickortake.com');
  return /^\/zh(?:\/|$)/.test(parsed.pathname) ? 'zh' : 'en';
}

export function languagePath(lang = 'en', page = '') {
  const name = String(page || '').replace(/^\//, '');
  if (lang === 'zh') return name ? `/zh/${name}` : '/zh';
  return name ? `/${name}` : '/';
}

/** English home is the bare origin, with no trailing slash and no lang query. */
export function publicUrl(origin, lang = 'en', page = '', params) {
  const path = languagePath(lang, page);
  const base = String(origin).replace(/\/$/, '');
  const url = new URL(base + (path === '/' ? '/' : path));
  const search = params instanceof URLSearchParams ? params : new URLSearchParams(params || '');
  for (const [key, value] of search) if (key !== 'lang' && value !== '') url.searchParams.append(key, value);
  if (url.pathname === '/' && !url.search && !url.hash) return base;
  return url.href;
}

export function publicPage(pathname) {
  if (!PAGE.test(pathname)) return null;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const zh = path === '/zh' || path.startsWith('/zh/');
  const rest = zh ? path.slice(3) || '/' : path;
  if (rest === '/') return {lang: zh ? 'zh' : 'en', page: 'home'};
  if (rest === '/privacy' || rest === '/terms') return {lang: zh ? 'zh' : 'en', page: rest.slice(1)};
  return null;
}
