export const SUPPORTED_LANGS = Object.freeze([
  'en', 'zh', 'zh-tw', 'es', 'ja', 'ko', 'fr', 'de', 'pt', 'ru', 'it', 'id'
]);

export const LANGUAGES_INFO = Object.freeze({
  en: { code: 'en', name: 'English', native: 'English', flag: '🇺🇸', htmlLang: 'en', locale: 'en_US' },
  zh: { code: 'zh', name: 'Chinese (Simplified)', native: '简体中文', flag: '🇨🇳', htmlLang: 'zh-CN', locale: 'zh_CN' },
  'zh-tw': { code: 'zh-tw', name: 'Chinese (Traditional)', native: '繁體中文', flag: '🇭🇰', htmlLang: 'zh-TW', locale: 'zh_TW' },
  es: { code: 'es', name: 'Spanish', native: 'Español', flag: '🇪🇸', htmlLang: 'es', locale: 'es_ES' },
  ja: { code: 'ja', name: 'Japanese', native: '日本語', flag: '🇯🇵', htmlLang: 'ja', locale: 'ja_JP' },
  ko: { code: 'ko', name: 'Korean', native: '한국어', flag: '🇰🇷', htmlLang: 'ko', locale: 'ko_KR' },
  fr: { code: 'fr', name: 'French', native: 'Français', flag: '🇫🇷', htmlLang: 'fr', locale: 'fr_FR' },
  de: { code: 'de', name: 'German', native: 'Deutsch', flag: '🇩🇪', htmlLang: 'de', locale: 'de_DE' },
  pt: { code: 'pt', name: 'Portuguese', native: 'Português', flag: '🇧🇷', htmlLang: 'pt', locale: 'pt_BR' },
  ru: { code: 'ru', name: 'Russian', native: 'Русский', flag: '🇷🇺', htmlLang: 'ru', locale: 'ru_RU' },
  it: { code: 'it', name: 'Italian', native: 'Italiano', flag: '🇮🇹', htmlLang: 'it', locale: 'it_IT' },
  id: { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia', flag: '🇮🇩', htmlLang: 'id', locale: 'id_ID' },
});

export const PAGE_META = Object.freeze({
  en: {title:'Trick or Take · Halloween candy game',description:'Play Trick or Take solo or with friends. Take candy, dodge Lily, and see how much you can collect in 60 seconds.',locale:'en_US',htmlLang:'en'},
  zh: {title:'Trick or Take · 万圣节偷糖挑战',description:'选择简单、中等或困难，独自偷糖或和朋友开麦 PK。她回头时别动，游戏结束后由你决定是否把成绩加入排行榜。',locale:'zh_CN',htmlLang:'zh-CN'},
  'zh-tw': {title:'Trick or Take · 萬聖節偷糖挑戰',description:'選擇簡單、中等或困難，獨自偷糖或和朋友開麥 PK。她回頭時別動，遊戲結束後由你決定是否把成績加入排行榜。',locale:'zh_TW',htmlLang:'zh-TW'},
  es: {title:'Trick or Take · Juego de caramelos de Halloween',description:'Juega a Trick or Take en solitario o con amigos. Roba caramelos, esquiva a Lily y descubre cuántos puedes conseguir en 60 segundos.',locale:'es_ES',htmlLang:'es'},
  ja: {title:'Trick or Take · ハロウィンお菓子泥棒ゲーム',description:'Trick or Takeを1人または友達とプレイ！リリーに見つからずにお菓子を盗み、60秒でどれだけ集められるか挑戦しよう。',locale:'ja_JP',htmlLang:'ja'},
  ko: {title:'Trick or Take · 할로윈 사탕 훔치기 게임',description:'혼자 또는 친구들과 함께 Trick or Take를 즐겨보세요. 릴리의 눈을 피해 사탕을 훔치고 60초 동안 얼마나 모을 수 있는지 도전하세요.',locale:'ko_KR',htmlLang:'ko'},
  fr: {title:'Trick or Take · Jeu de bonbons d\'Halloween',description:'Jouez à Trick or Take en solo ou avec des amis. Volez des bonbons, esquivez Lily et voyez combien vous pouvez en récolter en 60 secondes.',locale:'fr_FR',htmlLang:'fr'},
  de: {title:'Trick or Take · Halloween-Süßigkeiten-Spiel',description:'Spiele Trick or Take solo oder mit Freunden. Schnapp dir Süßigkeiten, weiche Lily aus und sammle so viele wie möglich in 60 Sekunden.',locale:'de_DE',htmlLang:'de'},
  pt: {title:'Trick or Take · Jogo de doces de Halloween',description:'Jogue Trick or Take sozinho ou com amigos. Pegue doces, desvie de Lily e veja quantos consegue coletar em 60 segundos.',locale:'pt_BR',htmlLang:'pt'},
  ru: {title:'Trick or Take · Хэллоуинская игра с конфетами',description:'Играйте в Trick or Take в одиночку или с друзьями. Воруйте конфеты, уворачивайтесь от Лили и соберите как можно больше за 60 секунд.',locale:'ru_RU',htmlLang:'ru'},
  it: {title:'Trick or Take · Gioco di caramelle di Halloween',description:'Gioca a Trick or Take da solo o con gli amici. Prendi le caramelle, schiva Lily e scopri quante riesci a raccoglierne in 60 secondi.',locale:'it_IT',htmlLang:'it'},
  id: {title:'Trick or Take · Game Permen Halloween',description:'Mainkan Trick or Take sendiri atau bersama teman. Ambil permen, hindari Lily, dan kumpulkan sebanyak mungkin dalam 60 detik.',locale:'id_ID',htmlLang:'id'},
});

const langsPattern = SUPPORTED_LANGS.filter(l => l !== 'en').join('|');
const PAGE_REGEX = new RegExp(`^\\/(?:(${langsPattern})\\/?)?(?:(privacy|terms)\\b)?\\/?$`, 'i');

export function requestLanguage(url) {
  const parsed = new URL(url, 'https://trickortake.com');
  const path = parsed.pathname.toLowerCase();
  for (const lang of SUPPORTED_LANGS) {
    if (lang === 'en') continue;
    if (path === `/${lang}` || path.startsWith(`/${lang}/`)) return lang;
  }
  return 'en';
}

export function languagePath(lang = 'en', page = '') {
  const name = String(page || '').replace(/^\//, '');
  const normalized = String(lang || 'en').toLowerCase();
  if (normalized && normalized !== 'en' && SUPPORTED_LANGS.includes(normalized)) {
    return name ? `/${normalized}/${name}` : `/${normalized}`;
  }
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
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const match = path.match(PAGE_REGEX);
  if (!match) return null;
  const lang = match[1]?.toLowerCase() || 'en';
  const page = match[2]?.toLowerCase() || 'home';
  return { lang, page };
}
