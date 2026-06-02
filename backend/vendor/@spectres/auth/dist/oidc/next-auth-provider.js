export function nextAuthProvider(options) {
    return {
        id: 'authentik',
        name: 'Authentik',
        type: 'oidc',
        issuer: options.issuer,
        clientId: options.clientId,
        clientSecret: options.clientSecret,
        authorization: {
            params: {
                scope: 'openid email profile',
            },
        },
        checks: ['pkce', 'state', 'nonce'],
        profile(profile) {
            return {
                id: profile.sub,
                email: profile.email,
                name: profile.preferred_username || profile.name || profile.email,
                image: profile.picture || null,
                spectres_role: profile.spectres_role || 'viewer',
                groups: profile.groups || [],
                mfa_enrolled: Boolean(profile.mfa_enrolled),
            };
        },
    };
}
//# sourceMappingURL=next-auth-provider.js.map