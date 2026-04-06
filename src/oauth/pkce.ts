import { createHash, randomBytes } from 'node:crypto';

function base64Url(value) {
  return value.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function generatePkcePair() {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash('sha256').update(verifier).digest());
  const state = base64Url(randomBytes(16));
  return { verifier, challenge, state, method: 'S256' };
}

export function buildAuthorizationUrl({
  authorizeUrl,
  clientId,
  redirectUri,
  scope = '',
  state,
  codeChallenge,
  codeChallengeMethod = 'S256',
  extraParams = {},
}) {
  const url = new URL(authorizeUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', codeChallengeMethod);
  if (scope) url.searchParams.set('scope', scope);
  for (const [key, value] of Object.entries(extraParams)) {
    if (value != null) url.searchParams.set(key, String(value));
  }
  return url.toString();
}
