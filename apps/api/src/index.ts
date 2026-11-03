import 'dotenv/config';
import express from 'express';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'aslibooks-api' }));

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.info(`Aslibooks API listening on ${port}`));
