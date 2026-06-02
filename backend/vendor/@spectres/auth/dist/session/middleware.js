import crypto from 'node:crypto';

const DEFAULT_CONFIG = {
  secret: 'change-me',
  cookieName: '__spectres_session',
  maxAge: 86400,
};

let config = { ...DEFAULT_CONFIG };

export function configureSession(opts) {
  config = { ...config, ...opts };
}

function sign(value, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(value);
  return hmac.digest('base64url');
}

function encrypt(text, secret) {
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text, secret) {
  try {
    const key = crypto.createHash('sha256').update(secret).digest();
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

export function createSession(res, user) {
  const payload = JSON.stringify(user);
  const encrypted = encrypt(payload, config.secret);
  const sig = sign(encrypted, config.secret);
  const cookieValue = `${encrypted}.${sig}`;

  const cookieOpts = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: config.maxAge * 1000,
    path: '/',
  };

  res.cookie(config.cookieName, cookieValue, cookieOpts);
  res.cookie('accessToken', 'true', { ...cookieOpts, httpOnly: false });
}

export function getSession(req) {
  let raw = req.headers.cookie
    ?.split(';')
    .map(c => c.trim())
    .find(c => c.startsWith(`${config.cookieName}=`))
    ?.split('=')
    .slice(1)
    .join('=');

  if (!raw) return null;

  try { raw = decodeURIComponent(raw); } catch { return null; }

  const parts = raw.split('.');
  if (parts.length !== 2) return null;

  const [encrypted, sig] = parts;
  const expectedSig = sign(encrypted, config.secret);

  if (sig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    return null;
  }

  const decrypted = decrypt(encrypted, config.secret);
  if (!decrypted) return null;

  try {
    return JSON.parse(decrypted);
  } catch {
    return null;
  }
}

export function clearSession(res) {
  res.clearCookie(config.cookieName, { path: '/' });
  res.clearCookie('accessToken', { path: '/' });
}
