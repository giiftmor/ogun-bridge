import type { Request, Response } from 'express';
import type { AuthUser, SessionConfig } from '../types.js';
export declare function configureSession(opts: SessionConfig): void;
export declare function createSession(res: Response, user: AuthUser): void;
export declare function getSession(req: Request): AuthUser | null;
export declare function clearSession(res: Response): void;
//# sourceMappingURL=middleware.d.ts.map