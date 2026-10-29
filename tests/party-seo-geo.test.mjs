import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gameJsonLd, ogImageUrl, stringifyJsonLd} from '../public/party/seo.mjs';
import {renderSitemap} from '../scripts/generate-sitemap.mjs';
import {SUPPORTED_LANGS, PAGE_META, publicUrl} from '../public/party/locale.mjs';
import {renderPolicyPage} from '../server/policy-page.mjs';

const root = new URL('..', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('GEO text briefs describe the live game and point at each other', () => {
  for (const file of ['public/llms.txt', 'public/llms-full.txt', 'public/full.txt']) {
    const text = read(file);
    assert.match(text, /Trick or Take/);
    assert.match(text, /trickortake\.com/);
    assert.match(text, /60/);
    assert.doesNotMatch(text, /Sneak a Treat/i);
  }
  assert.match(read('public/llms.txt'), /llms-full\.txt/);
  assert.match(read('public/llms-full.txt'), /full\.txt/);
  assert.equal(read('public/full.txt'), read('public/llms-full.txt'));
});

test('robots allow rendering resources and sitemap covers canonical pages', () => {
  const robots = read('public/robots.txt');
  assert.match(robots, /Sitemap: https:\/\/trickortake\.com\/sitemap\.xml/);
  assert.match(robots, /Allow: \/llms\.txt/);
  assert.match(robots, /GPTBot/);
  assert.doesNotMatch(robots, /Disallow: \/party\//);
  const sitemap = read('public/sitemap.xml');
  for (const path of ['<loc>https://trickortake.com</loc>', '<loc>https://trickortake.com/zh</loc>', '/zh/privacy', '/zh/terms', '<loc>https://trickortake.com/privacy</loc>', '<loc>https://trickortake.com/terms</loc>', '/og/default.png?lang=en']) {
    assert.match(sitemap, new RegExp(path.replace(/[?./]/g, '\\$&')));
  }
  assert.doesNotMatch(sitemap, /<loc>[^<]*\?lang=/);
  assert.match(sitemap, /hreflang="x-default"/);
});

test('generated sitemap has complete reciprocal language groups without private or duplicate URLs', () => {
  const sitemap = read('public/sitemap.xml');
  assert.equal(sitemap, renderSitemap(), 'Run npm run sitemap after changing the locale registry');
  const entries = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(match => match[1]);
  assert.equal(entries.length, SUPPORTED_LANGS.length * 3);
  const urls = new Set();
  for (const entry of entries) {
    const url = entry.match(/<loc>([^<]+)<\/loc>/)[1];
    assert.ok(!urls.has(url), url); urls.add(url);
    assert.doesNotMatch(url, /[?]|\.txt$|\/api\//);
    const page = url.endsWith('/privacy') ? 'privacy' : url.endsWith('/terms') ? 'terms' : '';
    for (const lang of SUPPORTED_LANGS) {
      assert.ok(entry.includes(`hreflang="${PAGE_META[lang].htmlLang}" href="${publicUrl('https://trickortake.com', lang, page)}"`), url + ' -> ' + lang);
    }
    assert.ok(entry.includes(`hreflang="x-default" href="${publicUrl('https://trickortake.com', 'en', page)}"`));
  }
});

test('home metadata includes hreflang, OG image, JSON-LD and LLM discovery links', () => {
  const html = read('public/party/index.html');
  assert.match(html, /rel="canonical" href="https:\/\/trickortake\.com"/);
  assert.match(html, /hreflang="zh-CN" href="https:\/\/trickortake\.com\/zh"/);
  assert.match(html, /hreflang="en"/);
  assert.match(html, /hreflang="zh-CN"/);
  assert.match(html, /hreflang="x-default"/);
  assert.match(html, /og\/default\.png\?lang=en&amp;v=3/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /"@type":"VideoGame"/);
  assert.match(html, /href="\/llms\.txt"/);
  assert.match(html, /max-image-preview:large/);
});

test('JSON-LD stays valid JSON and never embeds raw angle brackets', () => {
  const data = gameJsonLd('https://trickortake.com', 'en');
  const raw = stringifyJsonLd(data);
  assert.doesNotMatch(raw, /</);
  const parsed = JSON.parse(raw);
  assert.equal(parsed['@graph'][0]['@type'], 'VideoGame');
  assert.equal(parsed['@graph'][2]['@type'], 'FAQPage');
  assert.equal(parsed['@graph'][2].mainEntity.length, 9);
  assert.equal(ogImageUrl('https://trickortake.com', 'zh', 'default'), 'https://trickortake.com/og/default.png?lang=zh&v=3');
});

test('policy pages expose full social metadata and PostHog disclosure', () => {
  const html = renderPolicyPage('privacy', 'en', 'https://trickortake.com');
  assert.match(html, /og:image/);
  assert.match(html, /twitter:card/);
  assert.match(html, /og\/default\.png\?lang=en&amp;v=3|og\/default\.png\?lang=en&v=3/);
  assert.match(html, /posthog\.com\/privacy/i);
  assert.match(html, /hreflang="x-default"/);
  assert.match(html, /Updated 29 October 2026/);
});
