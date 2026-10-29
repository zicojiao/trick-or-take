import test from 'node:test';
import assert from 'node:assert/strict';
import {legacyLanguageRedirect} from '../server/legacy-language.mjs';

test('legacy locale links redirect to path languages without losing a room or challenge', () => {
  const cases = [
    ['/?lang=zh', 'https://trickortake.com/zh'],
    ['/?lang=en', 'https://trickortake.com/'],
    ['/privacy?lang=zh', 'https://trickortake.com/zh/privacy'],
    ['/terms?lang=en', 'https://trickortake.com/terms'],
    ['/?lang=zh&room=123456', 'https://trickortake.com/zh?room=123456'],
    ['/zh?lang=en&result=0123456789abcdef01234567', 'https://trickortake.com/zh?result=0123456789abcdef01234567'],
  ];
  for (const [path, target] of cases) {
    const response = legacyLanguageRedirect(new Request('https://trickortake.com' + path));
    assert.equal(response?.status, 308, path);
    assert.equal(response?.headers.get('location'), target, path);
  }
  assert.equal(legacyLanguageRedirect(new Request('https://trickortake.com/zh')), null);
  assert.equal(legacyLanguageRedirect(new Request('https://trickortake.com/?room=123456')), null);
});
