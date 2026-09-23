import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';

const router = Router();

// Level 1: Categories
router.get('/categories', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await db.all('SELECT id, name FROM categories WHERE is_active = 1 ORDER BY name ASC');
    res.json(rows);
  } catch (err) { next(err); }
});

// Level 2: Brands under a Category
router.get('/categories/:categoryId/brands', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await db.all(
      'SELECT id, name, category_id FROM brands WHERE category_id = ? AND is_active = 1 ORDER BY name ASC',
      [req.params.categoryId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Create Brand
router.post('/brands', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { categoryId, name } = req.body;
    if (!categoryId || !name) return res.status(400).json({ error: 'Category ID and Brand Name are required.' });

    const result = await db.run(
      'INSERT INTO brands (category_id, name) VALUES (?, ?)',
      [categoryId, name.trim()]
    );
    res.status(201).json({ id: result.lastID, categoryId, name: name.trim() });
  } catch (err) { next(err); }
});

// Level 3 & 4: Products under a Brand (Calculates Cartons and Loose Spools live)
router.get('/brands/:brandId/products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await db.all(
      `SELECT 
        id, brand_id, sku, name, spools_per_carton, stock_spools,
        CAST(stock_spools / spools_per_carton AS INTEGER) AS stock_cartons,
        (stock_spools % spools_per_carton) AS loose_spools,
        cost_price_spool, retail_price_spool, wholesale_price_carton, is_active
       FROM products 
       WHERE brand_id = ? AND is_active = 1 
       ORDER BY name ASC`,
      [req.params.brandId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Create Product SKU
router.post('/products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      brandId, sku, name, spoolsPerCarton,
      initialStockSpools = 0,
      costPriceSpool = 0,
      retailPriceSpool = 0,
      wholesalePriceCarton = 0
    } = req.body;

    if (!brandId || !sku || !name || !spoolsPerCarton) {
      return res.status(400).json({ error: 'Brand, SKU, Name, and Spools/Carton ratio are required.' });
    }

    const result = await db.run(
      `INSERT INTO products 
       (brand_id, sku, name, spools_per_carton, stock_spools, cost_price_spool, retail_price_spool, wholesale_price_carton)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        brandId,
        sku.trim().toUpperCase(),
        name.trim(),
        spoolsPerCarton,
        initialStockSpools,
        costPriceSpool,
        retailPriceSpool,
        wholesalePriceCarton
      ]
    );

    res.status(201).json({ id: result.lastID, success: true });
  } catch (err) { next(err); }
});

// Soft Delete / Toggle Product Status
router.patch('/products/:id/toggle-status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await db.run('UPDATE products SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;