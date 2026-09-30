import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';

const router = Router();

interface ReportFilters {
  startDate?: string;
  endDate?: string;
  partyId?: string;
  categoryId?: string;
  brandId?: string;
  productId?: string;
}

function buildOptionalFilters(filters: ReportFilters) {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.startDate) {
    conditions.push("date(i.committed_at) >= date(?)");
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    conditions.push("date(i.committed_at) <= date(?)");
    params.push(filters.endDate);
  }
  if (filters.partyId) {
    conditions.push("i.party_id = ?");
    params.push(filters.partyId);
  }
  if (filters.categoryId) {
    conditions.push("b.category_id = ?");
    params.push(filters.categoryId);
  }
  if (filters.brandId) {
    conditions.push("p.brand_id = ?");
    params.push(filters.brandId);
  }

  const extraSql = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';
  return { extraSql, params };
}

// GATE 1: Sales & Profitability Report
router.get('/sales', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters: ReportFilters = {
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      partyId: req.query.partyId as string,
      categoryId: req.query.categoryId as string,
      brandId: req.query.brandId as string,
      productId: req.query.productId as string,
    };

    const { extraSql, params } = buildOptionalFilters(filters);

    const summarySql = `
      SELECT 
        COUNT(DISTINCT i.id) AS total_invoices,
        COALESCE(SUM(ii.line_total), 0) AS gross_sales,
        COALESCE(SUM(ii.base_quantity_spools), 0) AS total_spools_sold,
        COALESCE(SUM(ii.base_quantity_spools * p.cost_price_spool), 0) AS total_cost,
        COALESCE(SUM(ii.line_total - (ii.base_quantity_spools * p.cost_price_spool)), 0) AS gross_profit
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      JOIN products p ON ii.product_id = p.id
      JOIN brands b ON p.brand_id = b.id
      WHERE i.type = 'OUT' AND i.status = 'COMPLETED'
      ${extraSql}
    `;
    const summary = await db.get(summarySql, params);

    const detailsSql = `
      SELECT 
        i.invoice_number,
        date(i.committed_at) AS sale_date,
        pt.name AS customer_name,
        p.name AS product_name,
        p.sku,
        b.name AS brand_name,
        ii.unit,
        ii.quantity,
        ii.unit_price,
        ii.line_total,
        (ii.line_total - (ii.base_quantity_spools * p.cost_price_spool)) AS item_profit
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      JOIN parties pt ON i.party_id = pt.id
      JOIN products p ON ii.product_id = p.id
      JOIN brands b ON p.brand_id = b.id
      WHERE i.type = 'OUT' AND i.status = 'COMPLETED'
      ${extraSql}
      ORDER BY i.committed_at DESC, ii.id DESC
    `;
    const rows = await db.all(detailsSql, params);

    res.json({
      metadata: { generatedAt: new Date().toISOString(), filtersApplied: filters },
      summary,
      rows
    });
  } catch (err) { next(err); }
});

// GATE 2: Inventory Valuation & Asset Health
router.get('/inventory-valuation', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await db.all(`
      SELECT 
        p.id, p.sku, p.name, b.name AS brand_name, c.name AS category_name,
        p.spools_per_carton,
        p.stock_spools,
        CAST(p.stock_spools / p.spools_per_carton AS INTEGER) AS stock_cartons,
        (p.stock_spools % p.spools_per_carton) AS loose_spools,
        p.cost_price_spool,
        (p.stock_spools * p.cost_price_spool) AS total_inventory_cost,
        (p.stock_spools * p.retail_price_spool) AS total_retail_value
      FROM products p
      JOIN brands b ON p.brand_id = b.id
      JOIN categories c ON b.category_id = c.id
      WHERE p.is_active = 1
      ORDER BY c.name, b.name, p.name ASC
    `);

    const summary = await db.get(`
      SELECT 
        COUNT(id) AS total_skus,
        COALESCE(SUM(stock_spools), 0) AS total_spools_on_hand,
        COALESCE(SUM(stock_spools * cost_price_spool), 0) AS total_asset_cost_value,
        COALESCE(SUM(stock_spools * retail_price_spool), 0) AS total_expected_sales_value
      FROM products
      WHERE is_active = 1
    `);

    res.json({ summary, rows });
  } catch (err) { next(err); }
});

export default router;