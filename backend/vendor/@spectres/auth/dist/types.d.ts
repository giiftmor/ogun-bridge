export type AuthProviderType = 'oidc' | 'ldap' | 'apikey' | 'fallback';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  username?: string;
  role: string;
  groups: string[];
  mfa_enrolled: boolean;
  provider: AuthProviderType;
  [key: string]: unknown;
}

export interface OIDCProviderOptions {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  roleMapping?: Record<string, string>;
  sessionSecret?: string;
  logger?: { info: (msg: string, ...args: unknown[]) => void; warn: (msg: string, ...args: unknown[]) => void; error: (msg: string, ...args: unknown[]) => void };
}

export interface LDAPConfig {
  url: string;
  timeout?: number;
  bindDN?: string;
  bindPassword?: string;
  searchBase?: string;
  searchFilter?: string;
}

export interface APIKeyConfig {
  store: 'db' | 'env' | 'authentik';
  headerName?: string;
}

export interface SessionConfig {
  secret: string;
  cookieName?: string;
  maxAge?: number;
}

export interface RoleMapper {
  (claims: Record<string, unknown>): {
    role: string;
    groups: string[];
    mfa_enrolled: boolean;
  };
}
