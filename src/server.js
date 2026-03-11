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

let bootstrapState = 'pending';
let bootstrapError = '';

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);
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
  res.json({
    status: 'ok',
    service: 'personal-homepage-api',
    bootstrapState,
    bootstrapError: bootstrapError || undefined,
  });
});

app.use('/api/v1', authRouter);
app.use('/api/v1', publicRouter);
app.use('/api/v1', adminRouter);

app.use('/assets', express.static(path.join(publicDir, 'assets'), { maxAge: '7d', immutable: true }));
app.use(express.static(publicDir, { extensions: ['html'], maxAge: '1h' }));

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function bootstrapAppData() {
  while (true) {
    try {
      bootstrapState = 'initializing';
      bootstrapError = '';

      await waitForDatabase(60, 2000);
      await ensureSchema();
      await ensureSingleOwner();

      bootstrapState = 'ready';
      console.log('Bootstrap complete');
      return;
    } catch (error) {
      bootstrapState = 'retrying';
      bootstrapError = error?.message || 'unknown bootstrap error';
      console.error('Bootstrap failed, retrying in 10s:', error);
      await sleep(10000);
    }
  }
}

app.listen(env.port, () => {
  console.log(`API running on http://localhost:${env.port}`);
  bootstrapAppData().catch((error) => {
    bootstrapState = 'failed';
    bootstrapError = error?.message || 'bootstrap failed';
    console.error('Bootstrap fatal error:', error);
  });
});

