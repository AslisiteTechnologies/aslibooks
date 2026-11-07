import { Router } from 'express';

export function healthRouter(isDatabaseReady: () => boolean) {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({ status: 'ok', service: 'aslibooks-api' });
  });

  router.get('/ready', (_req, res) => {
    if (!isDatabaseReady()) {
      res.status(503).json({ status: 'not_ready', service: 'aslibooks-api' });
      return;
    }
    res.json({ status: 'ready', service: 'aslibooks-api' });
  });

  return router;
}
