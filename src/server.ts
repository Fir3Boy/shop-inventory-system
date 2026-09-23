import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { db } from './db';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.resolve(process.cwd(), 'public')));

// ---------------------------------------------------------------------
// Touch-First Drill-Down & Catalog Read Endpoints
// ---------------------------------------------------------------------

// Level 1: Fetch Categories
app.get('/api/categories', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await db.all(
      'SELECT id, name FROM categories WHERE is_active = 1 ORDER BY name ASC'
    );
    res.json(categories);
  } catch (err) {
    next(err);
  }
});

// Level 2: Fetch Brands by Category ID
app.get('/api/categories/:categoryId/brands', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { categoryId } = req.params;
    const brands = await db.all(
      'SELECT id, name, category_id FROM brands WHERE category_id = ? AND is_active = 1 ORDER BY name ASC',
      [categoryId]
    );
    res.json(brands);
  } catch (err) {
    next(err);
  }
});

// Level 3 & 4: Fetch Products by Brand ID (SKU Grid)
app.get('/api/brands/:brandId/products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { brandId } = req.params;
    const products = await db.all(
      `SELECT 
        id, 
        brand_id, 
        sku, 
        name, 
        spools_per_carton, 
        stock_spools,
        (stock_spools / spools_per_carton) AS stock_cartons,
        (stock_spools % spools_per_carton) AS loose_spools_remainder,
        cost_price_spool, 
        retail_price_spool, 
        wholesale_price_carton 
       FROM products 
       WHERE brand_id = ? AND is_active = 1 
       ORDER BY name ASC`,
      [brandId]
    );
    res.json(products);
  } catch (err) {
    next(err);
  }
});

// System Status & Health Check
app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    const check = await db.get<{ ok: number }>('SELECT 1 as ok');
    res.json({ status: 'UP', storage: 'SQLite connected', healthy: check?.ok === 1 });
  } catch (error) {
    res.status(500).json({ status: 'DOWN', error: (error as Error).message });
  }
});

// Centralized Error Handling Middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(`[SYSTEM ERROR] ${err.stack || err.message}`);
  res.status(500).json({
    error: 'InternalServerError',
    message: err.message || 'An unexpected database or processing error occurred.'
  });
});

// ---------------------------------------------------------------------
// Server Lifecycle & Graceful Shutdown
// ---------------------------------------------------------------------

let server: ReturnType<typeof app.listen>;

async function startBootstrap(): Promise<void> {
  try {
    // 1. Run migrations/pragmas first
    await db.initializeSchema();

    // 2. Start HTTP server
    server = app.listen(PORT, () => {
      console.log(`=================================================`);
      console.log(` Textile ERP System running natively on Windows `);
      console.log(` URL: http://localhost:${PORT}                      `);
      console.log(` Database: WAL Mode Enabled                     `);
      console.log(`=================================================`);
    });
  } catch (criticalError) {
    console.error('Fatal initialization error:', criticalError);
    process.exit(1);
  }
}

async function handleShutdown(signal: string): Promise<void> {
  console.log(`\nReceived ${signal}. Cleaning up SQLite handles...`);
  if (server) {
    server.close(async () => {
      try {
        await db.close();
        console.log('Database connections cleanly closed. Exiting process safely.');
        process.exit(0);
      } catch (dbErr) {
        console.error('Error closing database gracefully:', dbErr);
        process.exit(1);
      }
    });
  } else {
    process.exit(0);
  }
}

// Trap Windows OS Signals and Ctrl+C
process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

void startBootstrap();