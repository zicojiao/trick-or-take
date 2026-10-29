import {PAGE_META, publicUrl} from './locale.mjs';
import {MESSAGES} from './messages.mjs';
import {shareMeta, challengeUrl} from './share-meta.mjs';

export const SITE_ORIGIN = 'https://trickortake.com';
export const OG_VERSION = '3';

export function ogImageUrl(origin = SITE_ORIGIN, lang = 'en', resultId = 'default') {
  const url = new URL(`/og/${resultId || 'default'}.png`, origin);
  url.searchParams.set('lang', lang === 'zh' ? 'zh' : 'en');
  url.searchParams.set('v', OG_VERSION);
  return url.href;
}

export function absolutePage(origin, path = '/', lang = 'en') {
  return publicUrl(origin, lang, path === '/' ? '' : path);
}

/** JSON-LD for the home/game document. Safe for crawlers and generative engines. */
export function gameJsonLd(origin = SITE_ORIGIN, lang = 'en', result = null) {
  const meta = shareMeta(lang, result);
  const m = MESSAGES[lang === 'zh' ? 'zh' : 'en'];
  const url = result ? challengeUrl(origin, result.id, lang) : absolutePage(origin, '/', lang);
  const image = ogImageUrl(origin, lang, result?.id || 'default');
  const game = {
    '@type': 'VideoGame',
    '@id': `${SITE_ORIGIN}/#game`,
    name: m.brand,
    alternateName: lang === 'zh'
      ? ['Trick or Take', '万圣节偷糖', '万圣节糖果游戏']
      : ['Trick or Take', 'Halloween candy game', 'Halloween candy heist'],
    description: PAGE_META[lang === 'zh' ? 'zh' : 'en'].description,
    url: absolutePage(origin, '/', 'en'),
    image,
    screenshot: image,
    inLanguage: ['en', 'zh-CN'],
    genre: ['Casual', 'Party', 'Halloween', 'Reflex'],
    gamePlatform: ['Web browser', 'Mobile web'],
    applicationCategory: 'GameApplication',
    operatingSystem: 'Any',
    isAccessibleForFree: true,
    offers: {'@type': 'Offer', price: '0', priceCurrency: 'USD', availability: 'https://schema.org/InStock'},
    author: {'@type': 'Organization', name: 'Trick or Take', url: SITE_ORIGIN},
    publisher: {'@type': 'Organization', name: 'Trick or Take', url: SITE_ORIGIN},
    playMode: ['SinglePlayer', 'MultiPlayer'],
    numberOfPlayers: {'@type': 'QuantitativeValue', minValue: 1, maxValue: 6},
  };
  const webPage = {
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: meta.title,
    description: meta.description,
    inLanguage: lang === 'zh' ? 'zh-CN' : 'en',
    isPartOf: {'@type': 'WebSite', '@id': `${SITE_ORIGIN}/#website`, name: m.brand, url: SITE_ORIGIN},
    primaryImageOfPage: {'@type': 'ImageObject', url: image, width: 1200, height: 630},
    about: {'@id': `${SITE_ORIGIN}/#game`},
  };
  const faq = {
    '@type': 'FAQPage',
    '@id': `${SITE_ORIGIN}/#faq`,
    inLanguage: lang === 'zh' ? 'zh-CN' : 'en',
    mainEntity: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => ({
      '@type': 'Question',
      name: m[`faqQ${i}`],
      acceptedAnswer: {'@type': 'Answer', text: m[`faqA${i}`]},
    })),
  };
  return {
    '@context': 'https://schema.org',
    '@graph': [game, webPage, faq],
  };
}

export function stringifyJsonLd(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
