// Optional operator-owned analytics; no telemetry is enabled in a fresh clone.
const CONFIG=globalThis.TRICK_OR_TAKE_CONFIG||{};
const queue = []; let client = null;

// Room and challenge links carry identifiers in the URL. Keep page paths but
// remove query strings and fragments from SDK-created URL properties.
export function redactAnalyticsEvent(event) {
  if (!event) return null;
  function clean(object) {
    if (!object || typeof object !== 'object' || Array.isArray(object)) return;
    for (const [key,value] of Object.entries(object)) {
      if (/^(?:\$initial_)?(?:utm_|gclid|fbclid|msclkid)/i.test(key)) {delete object[key]; continue;}
      if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
        try {const url = new URL(value); url.search = ''; url.hash = ''; object[key] = url.href;} catch {delete object[key];}
      } else if (value && typeof value === 'object') clean(value);
    }
  }
  clean(event.properties); clean(event.$set); clean(event.$set_once);
  return event;
}
export function track(event, properties = {}) {
  if (client) {try {client.capture(event,properties);} catch { /* Analytics never blocks the game. */ }}
  else if (queue.length < 100) queue.push([event,properties]);
}
export function initializeAnalytics(sdk, location = globalThis.location, config = CONFIG) {
  if (!sdk || client || !/^phc_/.test(config.token||'')) return;
  sdk.init(config.token, {
    api_host: config.host||'https://eu.i.posthog.com', persistence: 'localStorage+cookie',
    autocapture: false, capture_pageview: false, capture_pageleave: false,
    disable_session_recording: true, capture_performance: false,
    person_profiles: 'identified_only', before_send: redactAnalyticsEvent,
  });
  client = sdk;
  track('$pageview', {'$current_url': location.origin + location.pathname, page:location.pathname});
  for (const [event,properties] of queue.splice(0)) track(event,properties);
}
// Do not send local development and automated test traffic to production.
if (typeof window !== 'undefined' && /^phc_/.test(CONFIG.token||'')) {
  void import('./vendor/posthog-1.441.2.mjs')
    .then(module => initializeAnalytics(module.default))
    .catch(() => {queue.length = 0;});
}
