import type { Request, Response, NextFunction } from 'express';
import type { APIKeyConfig, AuthUser } from '../types.js';
interface KeyStore {
    db?: (key: string) => Promise<AuthUser | null>;
    env?: string;
    authentik?: (key: string) => Promise<AuthUser | null>;
}
export declare function apiKeyMiddleware(config: APIKeyConfig, store: KeyStore): (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare function createKey(): {
    key: string;
    prefix: string;
    hash: string;
};
export {};
//# sourceMappingURL=middleware.d.ts.map