export function buildAuthorizeSnippet(origin, slug) {
  return `curl -X POST ${origin}/api/authorize \\
  -H "Content-Type: application/json" \\
  -H "X-Api-Key: <API_KEY>" \\
  -d '{"appSlug":"${slug}","user":{"sub":"<oidc-sub>","email":"<email>"},"groups":["<group>"]}'`
}
