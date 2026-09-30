import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { db } from './db';

import catalogRouter from './routes/catalog';
import invoicesRouter from './routes/invoices';
import partiesRouter from './routes/parties';
import reportsRouter from './routes/reports';
import customersRouter from './routes/customers';
import suppliersRouter from './routes/suppliers';





const app = express();
const PORT = process.env.PORT || 3000;

// Mount domain routes
app.use('/api/customers', customersRouter);
app.use('/api/suppliers', suppliersRouter);

// Register reports gateway
app.use('/api/reports', reportsRouter);

// Standard Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.resolve(process.cwd(), 'public')));

// Mount Domain Routers
app.use('/api/catalog', catalogRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/parties', partiesRouter);

// Centralized Error Handling
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[SERVER ERROR]', err.message);
  res.status(400).json({ error: err.message });
});

// App Lifecycle
let server: ReturnType<typeof app.listen>;

async function bootstrap() {
  await db.initializeSchema();
  server = app.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(` Textile Shop ERP: http://localhost:${PORT}`);
    console.log(` Mode: Offline-First SQLite (WAL Enabled)       `);
    console.log(`=================================================`);
  });
}

const shutdown = (signal: string) => {
  console.log(`\nReceived ${signal}. Gracefully stopping server...`);
  if (server) {
    server.close(async () => {
      await db.close();
      console.log('Database connection safely closed. Process exiting.');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

void bootstrap();