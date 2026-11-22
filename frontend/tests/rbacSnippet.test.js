import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildAuthorizeSnippet } from '../src/lib/rbacSnippet.js'

test('integration snippet targets the app authorize endpoint and includes the app slug', () => {
  const snippet = buildAuthorizeSnippet('http://spectres:3331', 'thoth')

  assert.match(snippet, /curl -X POST http:\/\/spectres:3331\/api\/authorize/)
  assert.match(snippet, /X-Api-Key: <API_KEY>/)
  assert.match(snippet, /"appSlug":"thoth"/)
  assert.match(snippet, /"groups":\["<group>"\]/)
})
