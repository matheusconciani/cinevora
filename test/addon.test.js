const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanMovieName, inferYear, isVideoFile } = require('../addon');

test('cleanMovieName removes extension and normalizes separators', () => {
  assert.equal(cleanMovieName('Meu.Filme.2024.mkv'), 'Meu Filme 2024');
});

test('inferYear finds a four-digit year', () => {
  assert.equal(inferYear('Meu.Filme.2024.mkv'), 2024);
  assert.equal(inferYear('Meu Filme'), null);
});

test('isVideoFile recognizes MIME type and extension', () => {
  assert.equal(isVideoFile({ mimeType: 'video/mp4', name: 'filme' }), true);
  assert.equal(isVideoFile({ mimeType: 'application/pdf', name: 'filme.mp4' }), true);
  assert.equal(isVideoFile({ mimeType: 'application/pdf', name: 'filme.pdf' }), false);
});
