const assert = require('node:assert/strict')
const { test } = require('node:test')
const { notebookBrowserUrl } = require('../desktop/electron/notebook-browser.cjs')

test('Notebook opens its owned local browser route without embedded or private parameters', () => {
  assert.equal(notebookBrowserUrl({ frameUrl: 'http://127.0.0.1:8030/?easylabModule=labnotebook&codexIab=1&private=value', port: 8030, serverOwned: true }), 'http://127.0.0.1:8030/')
})

test('other modules, external frames and an unowned server cannot open a browser route', () => {
  for (const frameUrl of [
    'http://127.0.0.1:8030/?easylabModule=cdna',
    'http://127.0.0.1:8031/?easylabModule=labnotebook',
    'https://example.com/?easylabModule=labnotebook',
    'file:///tmp/notebook.html?easylabModule=labnotebook',
    'http://127.0.0.1:8030/other?easylabModule=labnotebook',
    'http://user@127.0.0.1:8030/?easylabModule=labnotebook',
    'not a URL',
  ]) assert.throws(() => notebookBrowserUrl({ frameUrl, port: 8030, serverOwned: true }))
  assert.throws(() => notebookBrowserUrl({ frameUrl: 'http://127.0.0.1:8030/?easylabModule=labnotebook', port: 8030, serverOwned: false }))
})
