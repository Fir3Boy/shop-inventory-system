import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { db } from './db';

import catalogRouter from './routes/catalog';
import invoicesRouter from './routes/invoices';
import partiesRouter from './routes/parties';
import reportsRouter from './routes/reports';
import customersRouter from './routes/customers';
import suppliersRouter from './routes/suppliers';
import adjustmentsRouter from './routes/adjustments';
import backupRouter from './routes/backup';

const app = express();
const PORT = process.env.PORT || 3000;

// Standard Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * Robust path resolution for both Local Dev, TS execution, and Packaged Electron (ASAR)
 */
function getPublicPath(): string {
  // 1. Packaged or Compiled dist/ location (resolves inside app.asar/public)
  const appAsarPath = path.join(__dirname, '..', 'public');
  if (fs.existsSync(appAsarPath)) {
    return appAsarPath;
  }

  // 2. Resources path (if unpacked outside asar)
  if ((process as any).resourcesPath) {
    const resourcesPath = path.join((process as any).resourcesPath, 'public');
    if (fs.existsSync(resourcesPath)) return resourcesPath;
  }

  // 3. Fallback for tsx / dev server
  return path.resolve(process.cwd(), 'public');
}

const PUBLIC_DIR = getPublicPath();

// Serve static frontend files
app.use(express.static(PUBLIC_DIR));

// Explicit root route fallback to ensure index.html always serves
app.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Mount APIs & Domain Routers
app.use('/api/backup', backupRouter);
app.use('/api/adjustments', adjustmentsRouter);
app.use('/api/customers', customersRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/parties', partiesRouter);

// Centralized Error Handling
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[SERVER ERROR]', err.message);
  res.status(400).json({ error: err.message });
});

// Only listen directly if running standalone web mode (outside Electron)
if (!process.versions.electron) {
  db.initializeSchema().then(() => {
    app.listen(PORT, () => {
      console.log(`[STANDALONE WEB] Express listening at http://localhost:${PORT}`);
      console.log(`[STANDALONE WEB] Serving assets from: ${PUBLIC_DIR}`);
    });
  });
}

export { app, PUBLIC_DIR };