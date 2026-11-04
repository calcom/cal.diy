
import { RewriterMiddleware } from './app.rewrites.middleware';
import { Request, Response } from 'express';

// dummy env for enabling the middleware for tests
jest.mock('@/env', () => ({
    getEnv: jest.fn().mockReturnValue('1')
}));

describe('RewriterMiddleware', () => {
    let middleware: RewriterMiddleware;
    let req: Partial<Request>;
    let res: Partial<Response>;
    let next: jest.Mock;

    beforeEach(() => {
        middleware = new RewriterMiddleware();
        res = {};
        next = jest.fn();
    });

    it('should rewrite /api/v2 to /v2', () => {
        req = { url: '/api/v2/auth/oauth2/token' };
        middleware.use(req as Request, res as Response, next);
        expect(req.url).toBe('/v2/auth/oauth2/token');
        expect(next).toHaveBeenCalled();
    });

    it('should not rewrite if it doesn\'t start with /api/v2', () => {
        req = { url: '/v2/auth/oauth2/token' };
        middleware.use(req as Request, res as Response, next);
        expect(req.url).toBe('/v2/auth/oauth2/token');
        expect(next).toHaveBeenCalled();
    });
});
