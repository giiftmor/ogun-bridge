import crypto from 'node:crypto';
const DEFAULT_HEADER = 'x-api-key';
export function apiKeyMiddleware(config, store) {
    const headerName = config.headerName || DEFAULT_HEADER;
    return async (req, res, next) => {
        const key = req.headers[headerName.toLowerCase()];
        if (!key) {
            res.status(401).json({ error: 'Unauthorized', message: 'Missing API key' });
            return;
        }
        let user = null;
        switch (config.store) {
            case 'db': {
                if (store.db) {
                    user = await store.db(key);
                }
                break;
            }
            case 'env': {
                const envVar = store.env || 'API_KEY';
                if (key === process.env[envVar]) {
                    user = {
                        id: 'api-key-user',
                        email: 'api@spectres.co.za',
                        role: 'admin',
                        groups: ['api'],
                        mfa_enrolled: false,
                        provider: 'apikey',
                    };
                }
                break;
            }
            case 'authentik': {
                if (store.authentik) {
                    user = await store.authentik(key);
                }
                break;
            }
        }
        if (!user) {
            res.status(401).json({ error: 'Unauthorized', message: 'Invalid API key' });
            return;
        }
        ;
        req.user = user;
        next();
    };
}
export function createKey() {
    const key = crypto.randomBytes(32).toString('hex');
    const prefix = key.substring(0, 8);
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    return { key, prefix, hash };
}
//# sourceMappingURL=middleware.js.map