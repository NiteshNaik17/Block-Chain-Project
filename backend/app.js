import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import env, { isTest } from './config/env.js';
import apiRoutes from './routes/index.js';
import { notFound, errorHandler } from './middleware/error.middleware.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

// --- Security & parsing middleware -----------------------------------------
app.use(helmet());

const clientUrlClean = (env.clientUrl || '').replace(/\/+$/, '');
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const originClean = origin.replace(/\/+$/, '');
      if (
        !clientUrlClean ||
        originClean === clientUrlClean ||
        originClean.endsWith('.onrender.com') ||
        originClean.includes('localhost') ||
        originClean.includes('127.0.0.1')
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

if (!isTest) {
  app.use(morgan('dev'));
}

// --- Rate limiting ---------------------------------------------------------
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later.' },
  })
);

// --- Routes ----------------------------------------------------------------
app.get('/', (req, res) => {
  res.json({ service: 'MediConsent API', status: 'running' });
});

// All API routes live under /api: /api/health and /api/v1/*.
app.use('/api', apiRoutes);

// --- Error handling --------------------------------------------------------
app.use(notFound);
app.use(errorHandler);

export default app;
