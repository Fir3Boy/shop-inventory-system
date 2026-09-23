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

// Level 3 & 4: Products under Brand with Dynamic "Last Inward Cost"
router.get('/brands/:brandId/products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await db.all(
      `SELECT 
        p.id, p.brand_id, p.sku, p.name, p.spools_per_carton, p.stock_spools,
        CAST(p.stock_spools / p.spools_per_carton AS INTEGER) AS stock_cartons,
        (p.stock_spools % p.spools_per_carton) AS loose_spools,
        p.cost_price_spool, p.retail_price_spool, p.wholesale_price_carton, p.is_active,
        
        -- DYNAMIC LAST INWARD COST: Look up the latest committed 'IN' purchase invoice
        COALESCE(
          (
            SELECT 
              CASE 
                WHEN ii.unit = 'CARTON' THEN (ii.unit_price / ii.spools_per_carton_snapshot)
                ELSE ii.unit_price 
              END
            FROM invoice_items ii
            JOIN invoices i ON ii.invoice_id = i.id
            WHERE ii.product_id = p.id 
              AND i.type = 'IN' 
              AND i.status = 'COMPLETED'
            ORDER BY i.committed_at DESC, ii.id DESC 
            LIMIT 1
          ),
          p.cost_price_spool
        ) AS last_cost_spool
        
       FROM products p 
       WHERE p.brand_id = ? AND p.is_active = 1 
       ORDER BY p.name ASC`,
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