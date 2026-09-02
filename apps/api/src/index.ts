import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { getDatabase } from './db/index.js';
import { authRouter } from './routes/auth.js';
import { meetingsRouter } from './routes/meetings.js';
import { healthRouter } from './routes/health.js';
import { setupSocketServer } from './socket/index.js';

async function bootstrap() {
  const app = express();
  const server = http.createServer(app);

  // Initialize Database
  const db = getDatabase();
  await db.init();

  // Middleware
  app.use(
    helmet({
      contentSecurityPolicy: false, // Allow WebRTC / WebSockets in local/production embeds
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json());

  // REST API Routes
  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/meetings', meetingsRouter);

  // Serve static files from web build in production
  const webDistPath = path.resolve(__dirname, '../../web/dist');
  if (fs.existsSync(webDistPath)) {
    app.use(express.static(webDistPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(webDistPath, 'index.html'));
    });
  }

  // Setup WebSockets / WebRTC Signaling Server
  setupSocketServer(server);

  server.listen(config.port, () => {
    console.log(`🚀 Boom API & WebRTC Signaling Server running on http://localhost:${config.port}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start Boom server:', err);
  process.exit(1);
});
