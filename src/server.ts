import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { db } from './db';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.resolve(process.cwd(), 'public')));

// ---------------------------------------------------------------------
// CATALOG READ & DRILL-DOWN
// ---------------------------------------------------------------------

app.get('/api/categories', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await db.all('SELECT id, name FROM categories WHERE is_active = 1 ORDER BY id ASC');
    res.json(rows);
  } catch (err) { next(err); }
});

app.get('/api/categories/:categoryId/brands', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await db.all(
      'SELECT id, name, category_id FROM brands WHERE category_id = ? AND is_active = 1 ORDER BY name ASC',
      [req.params.categoryId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

app.get('/api/brands/:brandId/products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await db.all(
      `SELECT 
        id, brand_id, sku, name, spools_per_carton, stock_spools,
        CAST(stock_spools / spools_per_carton AS INTEGER) AS stock_cartons,
        (stock_spools % spools_per_carton) AS loose_spools,
        cost_price_spool, retail_price_spool, wholesale_price_carton 
       FROM products 
       WHERE brand_id = ? AND is_active = 1 
       ORDER BY name ASC`,
      [req.params.brandId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

app.get('/api/parties', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await db.all('SELECT * FROM parties WHERE is_active = 1 ORDER BY name ASC');
    res.json(rows);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------
// MANAGEMENT ENDPOINTS (FOR FATHER'S ADMIN SCREEN)
// ---------------------------------------------------------------------

// Create a Brand
app.post('/api/brands', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { categoryId, name } = req.body;
    if (!categoryId || !name) return res.status(400).json({ error: 'Category and Brand Name are required.' });

    const result = await db.run(
      'INSERT INTO brands (category_id, name) VALUES (?, ?)',
      [categoryId, name.trim()]
    );
    res.status(201).json({ id: result.lastID, categoryId, name });
  } catch (err) { next(err); }
});

// Create a Product
app.post('/api/products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      brandId,
      sku,
      name,
      spoolsPerCarton,
      initialStockSpools = 0,
      costPriceSpool = 0,
      retailPriceSpool = 0,
      wholesalePriceCarton = 0
    } = req.body;

    if (!brandId || !sku || !name || !spoolsPerCarton) {
      return res.status(400).json({ error: 'Brand, SKU, Name, and Spools Per Carton are required.' });
    }

    const result = await db.run(
      `INSERT INTO products 
       (brand_id, sku, name, spools_per_carton, stock_spools, cost_price_spool, retail_price_spool, wholesale_price_carton)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [brandId, sku.trim().toUpperCase(), name.trim(), spoolsPerCarton, initialStockSpools, costPriceSpool, retailPriceSpool, wholesalePriceCarton]
    );

    res.status(201).json({ id: result.lastID, success: true });
  } catch (err) { next(err); }
});

// Create a Customer or Supplier
app.post('/api/parties', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type, name, phone, address, initialBalance = 0 } = req.body;
    if (!type || !name) return res.status(400).json({ error: 'Party Type and Name are required.' });

    const result = await db.run(
      'INSERT INTO parties (type, name, phone, address, current_balance) VALUES (?, ?, ?, ?, ?)',
      [type, name.trim(), phone || null, address || null, initialBalance]
    );
    res.status(201).json({ id: result.lastID, success: true });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------
// DRAFT INVOICE WITH LIVE PRICE OVERRIDE
// ---------------------------------------------------------------------

app.post('/api/invoices/draft', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { partyId, type = 'OUT' } = req.body;
    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;

    const result = await db.run(
      `INSERT INTO invoices (invoice_number, party_id, type, status) VALUES (?, ?, ?, 'DRAFT')`,
      [invoiceNumber, partyId, type]
    );

    const draft = await db.get('SELECT * FROM invoices WHERE id = ?', [result.lastID]);
    res.status(201).json(draft);
  } catch (err) { next(err); }
});

app.post('/api/invoices/:id/items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoiceId = req.params.id;
    const { productId, unit, quantity, customUnitPrice } = req.body;

    const product = await db.get<any>('SELECT * FROM products WHERE id = ?', [productId]);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const spoolsPerCarton = product.spools_per_carton;
    const baseQuantitySpools = unit === 'CARTON' ? quantity * spoolsPerCarton : quantity;

    // Use custom price if supplied (e.g., today's negotiated rate); otherwise use default
    let unitPrice: number;
    if (customUnitPrice !== undefined && customUnitPrice !== null && Number(customUnitPrice) >= 0) {
      unitPrice = Number(customUnitPrice);
    } else {
      unitPrice = unit === 'CARTON' ? product.wholesale_price_carton : product.retail_price_spool;
    }

    const lineTotal = quantity * unitPrice;

    await db.transaction(async () => {
      await db.run(
        `INSERT INTO invoice_items 
         (invoice_id, product_id, unit, quantity, spools_per_carton_snapshot, base_quantity_spools, unit_price, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [invoiceId, productId, unit, quantity, spoolsPerCarton, baseQuantitySpools, unitPrice, lineTotal]
      );

      const totals = await db.get<any>(
        'SELECT SUM(line_total) as subtotal FROM invoice_items WHERE invoice_id = ?',
        [invoiceId]
      );
      const subtotal = totals?.subtotal || 0;

      await db.run(
        `UPDATE invoices SET subtotal = ?, total_amount = ?, balance_due = ? WHERE id = ?`,
        [subtotal, subtotal, subtotal, invoiceId]
      );
    });

    const items = await db.all(
      `SELECT ii.*, p.name as product_name, p.sku 
       FROM invoice_items ii 
       JOIN products p ON ii.product_id = p.id 
       WHERE ii.invoice_id = ?`,
      [invoiceId]
    );

    res.json({ invoiceId, items });
  } catch (err) { next(err); }
});

app.post('/api/invoices/:id/commit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoiceId = req.params.id;
    const { paidAmount = 0 } = req.body;

    await db.transaction(async () => {
      const invoice = await db.get<any>('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
      if (!invoice || invoice.status !== 'DRAFT') throw new Error('Valid draft invoice required.');

      const items = await db.all<any>('SELECT * FROM invoice_items WHERE invoice_id = ?', [invoiceId]);
      if (items.length === 0) throw new Error('Invoice has no items.');

      const party = await db.get<any>('SELECT * FROM parties WHERE id = ?', [invoice.party_id]);
      if (!party) throw new Error('Party not found.');

      // Update Stock
      for (const item of items) {
        if (invoice.type === 'OUT') {
          const prod = await db.get<any>('SELECT stock_spools FROM products WHERE id = ?', [item.product_id]);
          if (prod.stock_spools < item.base_quantity_spools) {
            throw new Error(`Insufficient stock for product ID: ${item.product_id}`);
          }
          await db.run('UPDATE products SET stock_spools = stock_spools - ? WHERE id = ?', [item.base_quantity_spools, item.product_id]);
        } else {
          await db.run('UPDATE products SET stock_spools = stock_spools + ? WHERE id = ?', [item.base_quantity_spools, item.product_id]);
        }
      }

      // Update Balance & Ledger
      const totalAmount = invoice.total_amount;
      const balanceDue = totalAmount - paidAmount;
      const newPartyBalance = invoice.type === 'OUT'
        ? party.current_balance + balanceDue
        : party.current_balance - balanceDue;

      await db.run('UPDATE parties SET current_balance = ? WHERE id = ?', [newPartyBalance, party.id]);

      await db.run(
        `INSERT INTO ledger_entries (party_id, invoice_id, entry_type, amount, balance_after, description)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          party.id,
          invoice.id,
          invoice.type === 'OUT' ? 'DEBIT' : 'CREDIT',
          balanceDue,
          newPartyBalance,
          `Invoice #${invoice.invoice_number}`
        ]
      );

      await db.run(
        `UPDATE invoices SET status = 'COMPLETED', paid_amount = ?, balance_due = ?, committed_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [paidAmount, balanceDue, invoiceId]
      );
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[ERROR]', err.message);
  res.status(400).json({ error: err.message });
});

async function boot() {
  await db.initializeSchema();
  app.listen(PORT, () => console.log(`Textile POS active: http://localhost:${PORT}`));
}

void boot();