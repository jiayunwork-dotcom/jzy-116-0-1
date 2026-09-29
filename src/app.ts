/**
 * Express application: JSON body parsing, routes, and a centralized error
 * handler that turns HttpError (400) into JSON error responses and anything
 * else into a 500.
 */

import express from 'express';
import { router } from './routes.js';
import { HttpError } from './validation.js';

export const app = express();

app.use(express.json());
app.use(router);

app.use((_req, res) => {
  res.status(404).json({ error: 'not found' });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  console.error('unexpected error:', err);
  res.status(500).json({ error: 'internal server error' });
});
