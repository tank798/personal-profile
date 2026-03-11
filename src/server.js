import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { publicRouter } from './routes/public.js';
import { env } from './lib/env.js';
import { errorMiddleware } from './lib/errors.js';
import { ensureSchema, ensureSingleOwner, waitForDatabase } from './lib/bootstrap.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');

app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || env.corsOrigins.includes('*') || env.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('CORS origin not allowed'));
    },
  })
);
app.use(express.json({ limit: '12mb' }));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', service: 'personal-homepage-api' });
});

app.use('/api/v1', authRouter);
app.use('/api/v1', publicRouter);
app.use('/api/v1', adminRouter);

app.use(express.static(publicDir, { extensions: ['html'] }));

app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/post', (req, res) => {
  res.sendFile(path.join(publicDir, 'post.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

app.use((req, res) => {
  res.status(404).json({ code: 'NOT_FOUND', message: 'Endpoint not found' });
});

app.use(errorMiddleware);

async function start() {
  await waitForDatabase();
  await ensureSchema();
  await ensureSingleOwner();

  app.listen(env.port, () => {
    console.log(`API running on http://localhost:${env.port}`);
  });
}

start().catch((error) => {
  console.error('Failed to start API', error);
  process.exit(1);
});

