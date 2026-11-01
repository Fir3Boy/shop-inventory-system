import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';

const router = Router();

// 1. Submit a Stock Audit / Physical Adjustment
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId, physicalSpools, adjustmentType, notes } = req.body;

    if (!productId || physicalSpools === undefined || physicalSpools === null) {
      return res.status(400).json({ error: 'Product ID and physical count are required.' });
    }

    const count = Math.max(0, parseInt(physicalSpools));

    await db.transaction(async () => {
      // 1. Fetch current product state
      const product = await db.get<any>(
        'SELECT id, name, sku, stock_spools, cost_price_spool FROM products WHERE id = ?',
        [productId]
      );
      if (!product) throw new Error('Product not found.');

      const systemSpools = product.stock_spools;
      const delta = count - systemSpools; // Negative = Missing/Damaged, Positive = Found Extra

      if (delta === 0) {
        throw new Error('Physical count matches system stock exactly. No adjustment needed.');
      }

      const unitCost = product.cost_price_spool;
      const totalLossValue = Math.abs(delta) * unitCost;

      // 2. Log adjustment in audit table
      await db.run(
        `INSERT INTO stock_adjustments 
         (product_id, adjustment_type, system_spools, physical_spools, delta_spools, unit_cost_snapshot, total_loss_value, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          productId,
          adjustmentType || 'CORRECTION',
          systemSpools,
          count,
          delta,
          unitCost,
          totalLossValue,
          notes ? String(notes).trim() : null
        ]
      );

      // 3. Update actual physical inventory in products
      await db.run('UPDATE products SET stock_spools = ? WHERE id = ?', [count, productId]);
    });

    res.status(201).json({ success: true, message: 'Stock successfully adjusted and logged.' });
  } catch (err) { next(err); }
});

// 2. Get Audit History & Loss Report
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate, adjustmentType, productId } = req.query;

    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];

    if (startDate) {
      conditions.push('date(sa.adjusted_at) >= date(?)');
      params.push(startDate);
    }
    if (endDate) {
      conditions.push('date(sa.adjusted_at) <= date(?)');
      params.push(endDate);
    }
    if (adjustmentType && adjustmentType !== 'ALL') {
      conditions.push('sa.adjustment_type = ?');
      params.push(adjustmentType);
    }
    if (productId) {
      conditions.push('sa.product_id = ?');
      params.push(productId);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // KPI Summary
    const summary = await db.get(
      `SELECT 
        COUNT(sa.id) AS total_audits,
        COALESCE(SUM(CASE WHEN sa.delta_spools < 0 THEN ABS(sa.delta_spools) ELSE 0 END), 0) AS total_lost_spools,
        COALESCE(SUM(CASE WHEN sa.delta_spools > 0 THEN sa.delta_spools ELSE 0 END), 0) AS total_found_spools,
        COALESCE(SUM(CASE WHEN sa.delta_spools < 0 THEN sa.total_loss_value ELSE 0 END), 0) AS total_financial_loss
       FROM stock_adjustments sa
       ${whereClause}`,
      params
    );

    // Audit Log Rows
    const rows = await db.all(
      `SELECT 
        sa.*,
        p.name AS product_name,
        p.sku,
        p.spools_per_carton,
        b.name AS brand_name
       FROM stock_adjustments sa
       JOIN products p ON sa.product_id = p.id
       JOIN brands b ON p.brand_id = b.id
       ${whereClause}
       ORDER BY sa.adjusted_at DESC`,
      params
    );

    res.json({ summary, rows });
  } catch (err) { next(err); }
});

export default router;