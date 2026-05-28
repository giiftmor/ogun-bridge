import crypto from 'node:crypto';
import { createRoleMapper } from '../user/mapper.js';
import { createSession, getSession, clearSession } from '../session/middleware.js';

let _roleMapper = () => ({ role: 'viewer', groups: [], mfa_enrolled: false });

function getCookie(req, name) {
  if (req.cookies && typeof req.cookies === 'object' && req.cookies[name] !== undefined) {
    return req.cookies[name];
  }
  const raw = req.headers?.cookie || '';
  if (!raw) return undefined;
  for (const c of raw.split(';')) {
    const trimmed = c.trim();
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = decodeURIComponent(trimmed.substring(0, eqIdx)).trim();
    if (key === name) {
      return decodeURIComponent(trimmed.substring(eqIdx + 1));
    }
  }
  return undefined;
}

function getCallbackParams(req) {
  if (req.query && typeof req.query === 'object' && Object.keys(req.query).length > 0) {
    return req.query;
  }
  const url = req.url || '';
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return {};
  const searchParams = new URLSearchParams(url.substring(qIndex));
  const params = {};
  for (const [key, value] of searchParams) {
    params[key] = value;
  }
  return params;
}

export function createProvider(options) {
  if (options.roleMapping) {
    _roleMapper = createRoleMapper(options.roleMapping);
  }

  let endpointsPromise = null;

  async function getEndpoints() {
    const configUrl = `${options.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
    const res = await fetch(configUrl);
    if (!res.ok) {
      const base = options.issuer.replace(/\/$/, '');
      const issuerOrigin = new URL(options.issuer).origin;
      return {
        authorize: `${base}/authorize/`,
        token: `${issuerOrigin}/application/o/token/`,
        userinfo: `${issuerOrigin}/application/o/userinfo/`,
        endSession: `${base}/end-session/`,
      };
    }
    const config = await res.json();
    return {
      authorize: config.authorization_endpoint,
      token: config.token_endpoint,
      userinfo: config.userinfo_endpoint,
      endSession: config.end_session_endpoint,
    };
  }

  function getEndpointsCached() {
    if (!endpointsPromise) {
      endpointsPromise = getEndpoints();
    }
    return endpointsPromise;
  }

  function middleware() {
    return async (req, res, next) => {
      const session = getSession(req);
      if (session) {
        req.user = session;
        return next();
      }
      res.status(401).json({ error: 'Unauthorized', message: 'No valid session' });
    };
  }

  function requireRole(...roles) {
    return (req, res, next) => {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: 'Unauthorized', message: 'No authenticated user' });
        return;
      }
      if (!roles.includes(user.role)) {
        res.status(403).json({ error: 'Forbidden', message: `Requires one of roles: ${roles.join(', ')}` });
        return;
      }
      next();
    };
  }

  async function loginRedirect(req, res) {
    const state = crypto.randomBytes(32).toString('hex');
    const nonce = crypto.randomBytes(32).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    const eps = await getEndpointsCached();

    console.log('[OIDC] loginRedirect', { issuer: options.issuer, redirectUri: options.redirectUri });

    const authUrl = `${eps.authorize}?response_type=code&client_id=${encodeURIComponent(options.clientId)}&redirect_uri=${encodeURIComponent(options.redirectUri)}&scope=openid%20email%20profile%20spectres_role&state=${state}&nonce=${nonce}&code_challenge=${codeChallenge}&code_challenge_method=S256`;

    const cookieOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600000,
      path: '/',
    };
    res.cookie('oidc_state', state, cookieOpts);
    res.cookie('oidc_nonce', nonce, cookieOpts);
    res.cookie('oidc_verifier', codeVerifier, cookieOpts);

    res.redirect(authUrl);
  }

  async function callbackHandler(req, res, opts = {}) {
    const state = getCookie(req, 'oidc_state');
    const nonce = getCookie(req, 'oidc_nonce');
    const codeVerifier = getCookie(req, 'oidc_verifier');

    if (!state || !nonce || !codeVerifier) {
      console.error('[OIDC] Missing OIDC state cookies', {
        state: !!state, nonce: !!nonce, verifier: !!codeVerifier,
      });
      return res.redirect('/login?error=callback_failed_cookies');
    }

    const clearOpts = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' };
    res.clearCookie('oidc_state', clearOpts);
    res.clearCookie('oidc_nonce', clearOpts);
    res.clearCookie('oidc_verifier', clearOpts);

    const params = getCallbackParams(req);
    const returnedState = params.state;
    const code = params.code;

    if (returnedState && returnedState !== state) {
      console.error('[OIDC] State mismatch', { expected: state, returned: returnedState });
      return res.redirect('/login?error=state_mismatch');
    }

    if (!code) {
      console.error('[OIDC] Missing authorization code');
      return res.redirect('/login?error=missing_code');
    }

    const eps = await getEndpointsCached();

    const bodyParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: options.redirectUri,
      client_id: options.clientId,
      client_secret: options.clientSecret,
      code_verifier: codeVerifier,
    });

    console.log('[OIDC] Token exchange', { tokenUrl: eps.token });

    const tokenRes = await fetch(eps.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams,
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('[OIDC] Token exchange failed', { status: tokenRes.status, error: err });
      return res.redirect('/login?error=token_exchange');
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const idToken = tokenData.id_token;

    if (!accessToken) {
      console.error('[OIDC] No access_token in response');
      return res.redirect('/login?error=no_access_token');
    }

    let userinfoClaims = {};
    let idTokenClaims = {};

    const userinfoRes = await fetch(eps.userinfo, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (userinfoRes.ok) {
      userinfoClaims = await userinfoRes.json();
      console.log('[OIDC] Userinfo claims keys:', Object.keys(userinfoClaims), 'has_spectres_role:', 'spectres_role' in userinfoClaims);
    } else {
      console.warn('[OIDC] Userinfo failed', { status: userinfoRes.status });
    }

    console.log('[OIDC] Token response keys:', Object.keys(tokenData), 'has_id_token:', !!idToken);

    if (idToken) {
      try {
        const payload = idToken.split('.')[1];
        const padded = payload.padEnd(payload.length + (4 - payload.length % 4) % 4, '=');
        idTokenClaims = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
        console.log('[OIDC] Decoded id_token claims keys:', Object.keys(idTokenClaims), 'has_spectres_role:', 'spectres_role' in idTokenClaims);
      } catch (e) {
        console.error('[OIDC] Failed to decode id_token', String(e));
        return res.redirect('/login?error=token_decode_failed');
      }
    }

    const claims = { ...userinfoClaims, ...idTokenClaims };

    console.log('[OIDC] spectres_role value:', claims.spectres_role, 'type:', typeof claims.spectres_role);

    const { role, groups, mfa_enrolled } = _roleMapper(claims);

    const user = {
      id: claims.sub || '',
      email: claims.email || '',
      name: claims.name || '',
      username: claims.preferred_username || '',
      role,
      groups,
      mfa_enrolled,
      provider: 'oidc',
    };

    console.log('[OIDC] Login successful', { email: user.email, role: user.role });
    createSession(res, user);

    if (opts.onAuthorize && typeof opts.onAuthorize === 'function') {
      try {
        await opts.onAuthorize({
          sub: user.id,
          email: user.email,
          accessToken,
          role: user.role,
          groups: user.groups,
        });
      } catch (err) {
        console.error('[OIDC] onAuthorize hook failed', err);
      }
    }

    res.redirect('/');
  }

  function logout(req, res) {
    clearSession(res);
    const base = options.issuer.replace(/\/$/, '');
    res.redirect(`${base}/end-session/`);
  }

  return { middleware, requireRole, loginRedirect, callbackHandler, logout };
}
