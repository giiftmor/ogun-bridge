import type { Request, Response, NextFunction } from 'express';
import type { OIDCProviderOptions } from '../types.js';
export interface OIDCProvider {
    middleware(): (req: Request, res: Response, next: NextFunction) => void;
    requireRole(...roles: string[]): (req: Request, res: Response, next: NextFunction) => void;
    loginRedirect: (req: Request, res: Response) => Promise<void>;
    callbackHandler: (req: Request, res: Response, opts?: { onAuthorize?: (params: { sub: string; email: string; accessToken: string; role: string }) => Promise<void> }) => Promise<void>;
    logout: (req: Request, res: Response) => void;
}
export declare function createProvider(options: OIDCProviderOptions): OIDCProvider;
//# sourceMappingURL=provider.d.ts.map