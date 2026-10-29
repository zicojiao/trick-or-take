import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeAnalytics,track,redactAnalyticsEvent} from '../public/party/analytics.mjs';

test('analytics initializes with cookies and sends a clean pageview and queued gameplay events',()=>{
 const calls=[];let config;
 track('room_created',{difficulty:'medium'});
 const sdk={init(token,options){assert.ok(token.startsWith('phc_'));config=options;},capture(event,props){calls.push({event,props});}};
 initializeAnalytics(sdk,{origin:'https://trickortake.com',pathname:'/'},{token:'phc_test_fixture',host:'https://eu.i.posthog.com'});
 assert.equal(config.api_host,'https://eu.i.posthog.com');assert.equal(config.persistence,'localStorage+cookie');
 assert.equal(config.autocapture,false);assert.equal(config.disable_session_recording,true);
 assert.deepEqual(calls.map(c=>c.event),['$pageview','room_created']);
 assert.equal(calls[0].props.$current_url,'https://trickortake.com/');
});

test('event URLs cannot include room codes, challenge IDs or campaign query data',()=>{
 const event={properties:{token:'public-token',$current_url:'https://trickortake.com/?room=001234&result=secret#fragment',$referrer:'https://other.test/path?name=alice',utm_source:'sensitive'},$set_once:{$initial_current_url:'https://trickortake.com/?room=001234'}};
 const cleaned=redactAnalyticsEvent(event);assert.equal(cleaned.properties.token,'public-token');
 assert.equal(cleaned.properties.$current_url,'https://trickortake.com/');assert.equal(cleaned.properties.$referrer,'https://other.test/path');
 assert.equal(cleaned.$set_once.$initial_current_url,'https://trickortake.com/');assert.equal(cleaned.properties.utm_source,undefined);
});
