interface OAuthProvider {
    id: string;
    name: string;
    type: string;
    issuer: string;
    clientId: string;
    clientSecret: string;
    authorization: {
        params: Record<string, string>;
    };
    checks: string[];
    profile: (profile: Record<string, unknown>) => Record<string, unknown>;
}
interface NextAuthProviderOptions {
    issuer: string;
    clientId: string;
    clientSecret: string;
}
export declare function nextAuthProvider(options: NextAuthProviderOptions): OAuthProvider;
export {};
//# sourceMappingURL=next-auth-provider.d.ts.map