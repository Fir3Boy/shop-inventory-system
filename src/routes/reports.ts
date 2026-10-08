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

// =====================================================================
// GATE 4: SKU Movements & Stock Card (IN and OUT Ledger)
// =====================================================================
router.get('/sku-movements', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      startDate,
      endDate,
      movementType, // 'ALL', 'IN', 'OUT'
      categoryId,
      brandId,
      productId
    } = req.query;

    const conditions: string[] = ["i.status = 'COMPLETED'"];
    const params: unknown[] = [];

    if (startDate) {
      conditions.push("date(i.committed_at) >= date(?)");
      params.push(startDate);
    }
    if (endDate) {
      conditions.push("date(i.committed_at) <= date(?)");
      params.push(endDate);
    }
    if (movementType && movementType !== 'ALL') {
      conditions.push("i.type = ?");
      params.push(movementType);
    }
    if (productId) {
      conditions.push("ii.product_id = ?");
      params.push(productId);
    }
    if (brandId) {
      conditions.push("p.brand_id = ?");
      params.push(brandId);
    }
    if (categoryId) {
      conditions.push("b.category_id = ?");
      params.push(categoryId);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // 1. Calculate KPI Metrics (Inward vs Outward volumes)
    const summarySql = `
      SELECT 
        COUNT(ii.id) AS total_movements,
        COALESCE(SUM(CASE WHEN i.type = 'IN' THEN ii.base_quantity_spools ELSE 0 END), 0) AS total_in_spools,
        COALESCE(SUM(CASE WHEN i.type = 'OUT' THEN ii.base_quantity_spools ELSE 0 END), 0) AS total_out_spools,
        COALESCE(SUM(CASE WHEN i.type = 'IN' THEN ii.line_total ELSE 0 END), 0) AS total_in_cost,
        COALESCE(SUM(CASE WHEN i.type = 'OUT' THEN ii.line_total ELSE 0 END), 0) AS total_out_revenue
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      JOIN products p ON ii.product_id = p.id
      JOIN brands b ON p.brand_id = b.id
      ${whereClause}
    `;
    const summary = await db.get(summarySql, params);

    // 2. Fetch Detailed Audit Trail
    const detailsSql = `
      SELECT 
        ii.id,
        i.invoice_number,
        i.notes AS invoice_ref,
        i.type AS movement_type,
        date(i.committed_at) AS move_date,
        pt.name AS party_name,
        pt.type AS party_type,
        p.name AS product_name,
        p.sku,
        p.spools_per_carton,
        b.name AS brand_name,
        ii.unit,
        ii.quantity,
        ii.base_quantity_spools,
        ii.unit_price,
        ii.line_total
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      JOIN parties pt ON i.party_id = pt.id
      JOIN products p ON ii.product_id = p.id
      JOIN brands b ON p.brand_id = b.id
      ${whereClause}
      ORDER BY i.committed_at DESC, ii.id DESC
    `;
    const rows = await db.all(detailsSql, params);

    res.json({ summary, rows });
  } catch (err) { next(err); }
});
// =====================================================================
// GATE 5: Customer Activity & Sales History Report
// =====================================================================
router.get('/customer-activity', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate, customerId, categoryId, brandId, productId } = req.query;

    const conditions: string[] = ["i.type = 'OUT'", "i.status = 'COMPLETED'"];
    const params: unknown[] = [];

    if (startDate) {
      conditions.push("date(i.committed_at) >= date(?)");
      params.push(startDate);
    }
    if (endDate) {
      conditions.push("date(i.committed_at) <= date(?)");
      params.push(endDate);
    }
    if (customerId) {
      conditions.push("i.party_id = ?");
      params.push(customerId);
    }
    if (productId) {
      conditions.push("ii.product_id = ?");
      params.push(productId);
    }
    if (brandId) {
      conditions.push("p.brand_id = ?");
      params.push(brandId);
    }
    if (categoryId) {
      conditions.push("b.category_id = ?");
      params.push(categoryId);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // 1. KPI Aggregates
    const summarySql = `
      SELECT 
        COUNT(DISTINCT i.id) AS total_invoices,
        COUNT(ii.id) AS total_items_count,
        COALESCE(SUM(ii.base_quantity_spools), 0) AS total_spools_sold,
        COALESCE(SUM(ii.line_total), 0) AS total_amount_billed
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      JOIN parties pt ON i.party_id = pt.id
      JOIN products p ON ii.product_id = p.id
      JOIN brands b ON p.brand_id = b.id
      ${whereClause}
    `;
    const summary = await db.get(summarySql, params);

    // 2. Item-by-item breakdown
    const detailsSql = `
      SELECT 
        ii.id,
        date(i.committed_at) AS sale_date,
        i.invoice_number,
        i.notes AS invoice_ref,
        pt.name AS customer_name,
        pt.shop_name AS customer_shop,
        p.name AS product_name,
        p.sku,
        b.name AS brand_name,
        ii.unit,
        ii.quantity,
        ii.base_quantity_spools,
        ii.unit_price,
        ii.line_total
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      JOIN parties pt ON i.party_id = pt.id
      JOIN products p ON ii.product_id = p.id
      JOIN brands b ON p.brand_id = b.id
      ${whereClause}
      ORDER BY i.committed_at DESC, ii.id DESC
    `;
    const rows = await db.all(detailsSql, params);

    res.json({ summary, rows });
  } catch (err) { next(err); }
});

// =====================================================================
// GATE 6: Supplier Activity & Inward Consignment Report
// =====================================================================
router.get('/supplier-activity', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate, supplierId, categoryId, brandId, productId } = req.query;

    const conditions: string[] = ["i.type = 'IN'", "i.status = 'COMPLETED'"];
    const params: unknown[] = [];

    if (startDate) {
      conditions.push("date(i.committed_at) >= date(?)");
      params.push(startDate);
    }
    if (endDate) {
      conditions.push("date(i.committed_at) <= date(?)");
      params.push(endDate);
    }
    if (supplierId) {
      conditions.push("i.party_id = ?");
      params.push(supplierId);
    }
    if (productId) {
      conditions.push("ii.product_id = ?");
      params.push(productId);
    }
    if (brandId) {
      conditions.push("p.brand_id = ?");
      params.push(brandId);
    }
    if (categoryId) {
      conditions.push("b.category_id = ?");
      params.push(categoryId);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // 1. KPI Aggregates
    const summarySql = `
      SELECT 
        COUNT(DISTINCT i.id) AS total_bills,
        COUNT(ii.id) AS total_items_count,
        COALESCE(SUM(ii.base_quantity_spools), 0) AS total_spools_received,
        COALESCE(SUM(ii.line_total), 0) AS total_inward_cost
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      JOIN parties pt ON i.party_id = pt.id
      JOIN products p ON ii.product_id = p.id
      JOIN brands b ON p.brand_id = b.id
      ${whereClause}
    `;
    const summary = await db.get(summarySql, params);

    // 2. Inward Line-item breakdown
    const detailsSql = `
      SELECT 
        ii.id,
        date(i.committed_at) AS purchase_date,
        i.invoice_number,
        i.notes AS mill_bill_ref,
        pt.name AS rep_name,
        pt.shop_name AS mill_name,
        p.name AS product_name,
        p.sku,
        b.name AS brand_name,
        ii.unit,
        ii.quantity,
        ii.base_quantity_spools,
        ii.unit_price,
        ii.line_total
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      JOIN parties pt ON i.party_id = pt.id
      JOIN products p ON ii.product_id = p.id
      JOIN brands b ON p.brand_id = b.id
      ${whereClause}
      ORDER BY i.committed_at DESC, ii.id DESC
    `;
    const rows = await db.all(detailsSql, params);

    res.json({ summary, rows });
  } catch (err) { next(err); }
});

export default router;