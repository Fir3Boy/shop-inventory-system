import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';

const router = Router();

// =====================================================================
// HELPER: Dynamic Filter Builder for Invoices & Catalog
// =====================================================================
interface ReportFilters {
  startDate?: string;
  endDate?: string;
  partyId?: string;
  categoryId?: string;
  brandId?: string;
  productId?: string;
}

function buildSalesWhereClause(filters: ReportFilters) {
  const conditions: string[] = ["i.type = 'OUT'", "i.status = 'COMPLETED'"];
  const params: unknown[] = [];

  // Date Range Filtering (Inclusive)
  if (filters.startDate) {
    conditions.push("date(i.committed_at) >= date(?)");
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    conditions.push("date(i.committed_at) <= date(?)");
    params.push(filters.endDate);
  }

  // Party (Customer) Filter
  if (filters.partyId) {
    conditions.push("i.party_id = ?");
    params.push(filters.partyId);
  }

  // Drill-Down Filters
  if (filters.categoryId) {
    conditions.push("b.category_id = ?");
    params.push(filters.categoryId);
  }
  if (filters.brandId) {
    conditions.push("p.brand_id = ?");
    params.push(filters.brandId);
  }
  if (filters.productId) {
    conditions.push("ii.product_id = ?");
    params.push(filters.productId);
  }

  return {
    whereSql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params
  };
}

// =====================================================================
// GATE 1: Sales & Profitability Report
// =====================================================================
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

    const { whereSql, params } = buildSalesWhereClause(filters);

    // 1. Fetch Aggregates (Top-level KPI metrics)
    const summarySql = `
      SELECT 
        COUNT(DISTINCT i.id) AS total_invoices,
        COALESCE(SUM(ii.line_total), 0) AS gross_sales,
        COALESCE(SUM(ii.base_quantity_spools), 0) AS total_spools_sold,
        -- Calculated Cost: base spools * cost price at that time
        COALESCE(SUM(ii.base_quantity_spools * p.cost_price_spool), 0) AS total_cost,
        COALESCE(SUM(ii.line_total - (ii.base_quantity_spools * p.cost_price_spool)), 0) AS gross_profit
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      JOIN products p ON ii.product_id = p.id
      JOIN brands b ON p.brand_id = b.id
      ${whereSql}
    `;
    const summary = await db.get(summarySql, params);

    // 2. Fetch Detailed Line Items for the Table
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
      ${whereSql}
      ORDER BY i.committed_at DESC, ii.id DESC
    `;
    const rows = await db.all(detailsSql, params);

    res.json({
      metadata: {
        generatedAt: new Date().toISOString(),
        filtersApplied: filters
      },
      summary,
      rows
    });
  } catch (err) { next(err); }
});

// =====================================================================
// GATE 2: Inventory Valuation & Low Stock Report
// =====================================================================
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

// Define interface for database row
interface PartyBalanceRow {
  id: number;
  name: string;
  phone: string | null;
  current_balance: number;
}

// =====================================================================
// GATE 3: Debts & Receivables Aging Report
// =====================================================================
router.get('/debts-summary', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Pass <PartyBalanceRow> to db.all
    const customers = await db.all<PartyBalanceRow>(`
      SELECT id, name, phone, current_balance 
      FROM parties 
      WHERE type = 'CUSTOMER' AND current_balance > 0 
      ORDER BY current_balance DESC
    `);

    const suppliers = await db.all<PartyBalanceRow>(`
      SELECT id, name, phone, current_balance 
      FROM parties 
      WHERE type = 'SUPPLIER' AND current_balance < 0 
      ORDER BY current_balance ASC
    `);

    // 2. Explicitly type the accumulator as `number`
    const totalReceivable = customers.reduce(
      (acc: number, c: PartyBalanceRow) => acc + c.current_balance, 
      0
    );

    const rawSupplierDebt = suppliers.reduce(
      (acc: number, s: PartyBalanceRow) => acc + s.current_balance, 
      0
    );

    res.json({
      customers: {
        totalReceivable,
        list: customers
      },
      suppliers: {
        totalPayable: Math.abs(rawSupplierDebt),
        list: suppliers
      }
    });
  } catch (err) { next(err); }
});
export default router;