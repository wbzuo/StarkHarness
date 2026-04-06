import { createServer } from 'node:http';

export async function exchangeAuthorizationCode({
  tokenUrl,
  clientId,
  clientSecret = null,
  code,
  redirectUri,
  codeVerifier,
}) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });
  if (clientSecret) body.set('client_secret', clientSecret);

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    throw new Error(`oauth token exchange failed: ${response.status}`);
  }
  return response.json();
}

export async function refreshAccessToken({
  tokenUrl,
  clientId,
  clientSecret = null,
  refreshToken,
}) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
  });
  if (clientSecret) body.set('client_secret', clientSecret);

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    throw new Error(`oauth refresh failed: ${response.status}`);
  }
  return response.json();
}

export async function waitForOAuthCode({ host = '127.0.0.1', port = 0, timeoutMs = 120000 } = {}) {
  let resolver;
  let rejecter;
  const result = new Promise((resolve, reject) => {
    resolver = resolve;
    rejecter = reject;
  });

  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://${host}:${boundPort}`);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Authentication complete. You can return to StarkHarness.');
    resolver({ code, state });
    server.close();
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const boundPort = server.address().port;
  const redirectUri = `http://${host}:${boundPort}/callback`;
  const timer = setTimeout(() => {
    rejecter(new Error('oauth callback timeout'));
    server.close();
  }, timeoutMs);

  return {
    redirectUri,
    promise: result.finally(() => clearTimeout(timer)),
    close: () => {
      clearTimeout(timer);
      server.close();
    },
  };
}
