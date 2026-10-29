import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('AI crawler groups retain the private API and vendor exclusions', () => {
  const robots = readFileSync(new URL('../public/robots.txt', import.meta.url), 'utf8');
  const groups = robots.split(/\n\s*\n/).filter(group => /User-agent:/i.test(group));
  const specific = groups.find(group => /User-agent: GPTBot/.test(group));
  assert.ok(specific, 'GPTBot group exists');
  assert.match(specific, /User-agent: ClaudeBot/);
  assert.match(specific, /Disallow: \/api\//);
  assert.match(specific, /Disallow: \/party\/vendor\//);
  assert.match(specific, /Allow: \/llms\.txt/);
});
