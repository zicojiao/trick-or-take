import {canonicalRedirect} from "../server/canonical-domain.mjs";
import {legacyLanguageRedirect} from "../server/legacy-language.mjs";
import {renderPolicyPage} from "../server/policy-page.mjs";
import {handlePartyRequest} from "../server/party-service.mjs";
import { MESSAGES } from "../public/party/messages.mjs";
import { publicPage, publicUrl, languagePath } from "../public/party/locale.mjs";

import {shareMeta,challengeUrl} from "../public/party/share-meta.mjs";
import {gameJsonLd, stringifyJsonLd, ogImageUrl} from "../public/party/seo.mjs";
import {getSharedResult} from "../server/sharing.mjs";
import {renderOgPng} from "../server/og-image.mjs";

const worker = {
  async fetch(request, env, ctx) {
    const redirected = canonicalRedirect(request);
    if (redirected) return redirected;
    const legacyLanguage = legacyLanguageRedirect(request);
    if (legacyLanguage) return legacyLanguage;
    const url = new URL(request.url);
    if(url.pathname.startsWith('/api/party/')) {
      const action=url.pathname.slice('/api/party/'.length);
      return handlePartyRequest(request,env,action);
    }
    if(url.pathname==='/config.js') {
      const config={token:env.POSTHOG_PROJECT_TOKEN||'',host:env.POSTHOG_HOST||'https://eu.i.posthog.com'};
      return new Response('globalThis.TRICK_OR_TAKE_CONFIG='+JSON.stringify(config).replace(/</g,'\\u003c')+';', {headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store'}});
    }
    const page = publicPage(url.pathname);
    if(page && page.page !== 'home' && ['GET','HEAD'].includes(request.method)) {
      return new Response(request.method==='HEAD'?null:renderPolicyPage(page.page,page.lang,url.origin),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','content-language':page.lang==='zh'?'zh-CN':'en'}});
    }
    const image = /^\/og\/(default|[a-f0-9]{24})\.png$/.exec(url.pathname);
    if(image && ['GET','HEAD'].includes(request.method)) {
      const lang = url.searchParams.get('lang') === 'zh' ? 'zh' : 'en';
      const result = image[1] === 'default' ? null : await getSharedResult(env.DB,image[1]);
      if(image[1] !== 'default' && !result) return new Response('Challenge not found',{status:404});
      const png = await renderOgPng(env,url.origin,lang,result);
      return new Response(request.method === 'HEAD' ? null : png,{headers:{'content-type':'image/png','cache-control':'public, max-age=86400','x-content-type-options':'nosniff'}});
    }
    if (["/party", "/party/"].includes(url.pathname)) {
      url.pathname = "/";
      return Response.redirect(url.toString(), 308);
    }
    if (page?.page === 'home' && env.ASSETS) {
      const target = new URL(request.url);
      target.pathname = "/party/";
      const headers = new Headers(request.headers);
      headers.delete("if-none-match"); headers.delete("if-modified-since");
      const response = await env.ASSETS.fetch(new Request(target, {...request, headers, method:request.method}));
      const lang = page.lang;
      const id=url.searchParams.get('result');
      let result=null;
      if(id && /^[a-f0-9]{24}$/.test(id)) result=await getSharedResult(env.DB,id).catch(()=>null);
      const meta = shareMeta(lang,result);
      const canonical=result?challengeUrl(url.origin,result.id,lang):publicUrl(url.origin,lang);
      const imageUrl=ogImageUrl(url.origin,lang,result?.id||'default');
      const hreflangEn=result?challengeUrl(url.origin,result.id,'en'):publicUrl(url.origin,'en');
      const hreflangZh=result?challengeUrl(url.origin,result.id,'zh'):publicUrl(url.origin,'zh');
      const jsonLd=stringifyJsonLd(gameJsonLd(url.origin,lang,result));
      const localized = new HTMLRewriter()
        .on('[data-i18n]', {element(e) {const key=e.getAttribute('data-i18n');const copy=MESSAGES[lang][key];if(copy !== undefined)e.setInnerContent(copy);}})
        .on('[data-placeholder]', {element(e) {const key=e.getAttribute('data-placeholder');const copy=MESSAGES[lang][key];if(copy !== undefined)e.setAttribute('placeholder',copy);}})
        .on('[data-aria]', {element(e) {const key=e.getAttribute('data-aria');const copy=MESSAGES[lang][key];if(copy !== undefined)e.setAttribute('aria-label',copy);}})
        .on('[data-title]', {element(e) {const key=e.getAttribute('data-title');const copy=MESSAGES[lang][key];if(copy !== undefined)e.setAttribute('title',copy);}})
        .on('#brand-link', {element(e) {e.setAttribute('href', languagePath(lang));}})
        .on('#home-link-home-how,#home-link-faq', {element(e) {e.setAttribute('href', languagePath(lang) + '#' + e.getAttribute('id').replace('home-link-',''));}})
        .on('#home-link-privacy,#home-link-terms', {element(e) {e.setAttribute('href', languagePath(lang, e.getAttribute('id').replace('home-link-','')));}})
        .on("html", {element(e) {e.setAttribute("lang", lang === "zh" ? "zh-CN" : "en");}})
        .on("title", {element(e) {e.setInnerContent(meta.title);}})
        .on('meta[name="description"],meta[property="og:description"],meta[name="twitter:description"]', {element(e) {e.setAttribute("content",meta.description);}})
        .on('meta[property="og:title"],meta[name="twitter:title"]', {element(e) {e.setAttribute("content",meta.title);}})
        .on('meta[property="og:locale"]', {element(e) {e.setAttribute("content",meta.locale);}})
        .on('meta[property="og:url"]', {element(e) {e.setAttribute('content',canonical);}})
        .on('link[rel="canonical"]', {element(e) {e.setAttribute('href',canonical);}})
        .on('#hreflang-en', {element(e) {e.setAttribute('href',hreflangEn);}})
        .on('#hreflang-zh', {element(e) {e.setAttribute('href',hreflangZh);}})
        .on('#hreflang-default', {element(e) {e.setAttribute('href',hreflangEn);}})
        .on('meta[property="og:image"],meta[name="twitter:image"]', {element(e) {e.setAttribute('content',imageUrl);}})
        .on('meta[property="og:image:alt"],meta[name="twitter:image:alt"]', {element(e) {e.setAttribute('content',meta.alt);}})
        // Insert as HTML so quotes stay intact; stringifyJsonLd already escapes "<".
        .on('#json-ld', {element(e) {e.setInnerContent(jsonLd, {html: true});}})
        .transform(response);
      const output = new Response(localized.body, localized);
      output.headers.set("cache-control", "private, no-store");
      output.headers.delete("etag"); output.headers.delete("last-modified");
      return output;
    }
    return env.ASSETS.fetch(request);
  },
};

export default worker;
