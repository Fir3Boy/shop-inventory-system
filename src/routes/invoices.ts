import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';

const router = Router();

// Create or fetch active draft for a party
router.post('/draft', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { partyId, type = 'OUT' } = req.body;
    if (!partyId) return res.status(400).json({ error: 'Party ID required.' });

    const invoiceNumber = `${type === 'OUT' ? 'SALE' : 'PUR'}-${Date.now().toString().slice(-6)}`;

    const result = await db.run(
      `INSERT INTO invoices (invoice_number, party_id, type, status) VALUES (?, ?, ?, 'DRAFT')`,
      [invoiceNumber, partyId, type]
    );

    const draft = await db.get('SELECT * FROM invoices WHERE id = ?', [result.lastID]);
    res.status(201).json(draft);
  } catch (err) { next(err); }
});

// Add Item to Draft Invoice (Supports Spool/Carton Conversion & Price Overrides)
router.post('/:id/items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoiceId = req.params.id;
    const { productId, unit, quantity, customUnitPrice } = req.body;

    const product = await db.get<any>('SELECT * FROM products WHERE id = ?', [productId]);
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    const spoolsPerCarton = product.spools_per_carton;
    const baseQuantitySpools = unit === 'CARTON' ? quantity * spoolsPerCarton : quantity;

    let unitPrice = Number(customUnitPrice);
    if (isNaN(unitPrice) || unitPrice < 0) {
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
        'UPDATE invoices SET subtotal = ?, total_amount = ?, balance_due = ? WHERE id = ?',
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

// Remove Item from Draft
router.delete('/:id/items/:itemId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: invoiceId, itemId } = req.params;

    await db.transaction(async () => {
      await db.run('DELETE FROM invoice_items WHERE id = ? AND invoice_id = ?', [itemId, invoiceId]);

      const totals = await db.get<any>(
        'SELECT COALESCE(SUM(line_total), 0) as subtotal FROM invoice_items WHERE invoice_id = ?',
        [invoiceId]
      );
      const subtotal = totals.subtotal;

      await db.run(
        'UPDATE invoices SET subtotal = ?, total_amount = ?, balance_due = ? WHERE id = ?',
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

// Commit Invoice: Handles Cash, Partial Cash, Pure Credit, and Old Debt Paydown
router.post('/:id/commit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoiceId = req.params.id;
    const paidAmount = Math.max(0, Number(req.body.paidAmount) || 0);

    await db.transaction(async () => {
      const invoice = await db.get<any>('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
      if (!invoice || invoice.status !== 'DRAFT') throw new Error('Valid draft invoice required.');

      const items = await db.all<any>('SELECT * FROM invoice_items WHERE invoice_id = ?', [invoiceId]);
      if (items.length === 0) throw new Error('Cannot commit an empty invoice sheet.');

      const party = await db.get<any>('SELECT * FROM parties WHERE id = ?', [invoice.party_id]);
      if (!party) throw new Error('Party not found.');

      // 1. Physical Inventory Adjustments
      for (const item of items) {
        if (invoice.type === 'OUT') {
          const prod = await db.get<any>('SELECT stock_spools FROM products WHERE id = ?', [item.product_id]);
          if (prod.stock_spools < item.base_quantity_spools) {
            throw new Error(`Insufficient inventory for product: ${item.product_name || item.product_id}`);
          }
          await db.run('UPDATE products SET stock_spools = stock_spools - ? WHERE id = ?', [item.base_quantity_spools, item.product_id]);
        } else {
          await db.run('UPDATE products SET stock_spools = stock_spools + ? WHERE id = ?', [item.base_quantity_spools, item.product_id]);
        }
      }

      // 2. Financial Calculations
      const invoiceTotal = invoice.total_amount;
      // Balance remaining specifically on this invoice
      const invoiceBalanceDue = Math.max(0, invoiceTotal - paidAmount);

      let runningBalance = party.current_balance;

      if (invoice.type === 'OUT') {
        // --- CUSTOMER SALE ---
        // A. Record Bill Charge (Customer owes for goods)
        runningBalance += invoiceTotal;
        await db.run(
          `INSERT INTO ledger_entries (party_id, invoice_id, entry_type, amount, balance_after, description)
           VALUES (?, ?, 'DEBIT', ?, ?, ?)`,
          [party.id, invoice.id, invoiceTotal, runningBalance, `Invoice #${invoice.invoice_number}`]
        );

        // B. If customer paid any cash, record payment credit
        if (paidAmount > 0) {
          runningBalance -= paidAmount;
          await db.run(
            `INSERT INTO ledger_entries (party_id, invoice_id, entry_type, amount, balance_after, description)
             VALUES (?, ?, 'CREDIT', ?, ?, ?)`,
            [party.id, invoice.id, paidAmount, runningBalance, `Cash Paid for #${invoice.invoice_number}`]
          );
        }
      } else {
        // --- SUPPLIER PURCHASE ---
        // A. Record Supplier Bill (We owe supplier for goods)
        runningBalance -= invoiceTotal;
        await db.run(
          `INSERT INTO ledger_entries (party_id, invoice_id, entry_type, amount, balance_after, description)
           VALUES (?, ?, 'CREDIT', ?, ?, ?)`,
          [party.id, invoice.id, invoiceTotal, runningBalance, `Supplier Bill #${invoice.invoice_number}`]
        );

        // B. If we paid cash to supplier, reduce payable balance
        if (paidAmount > 0) {
          runningBalance += paidAmount;
          await db.run(
            `INSERT INTO ledger_entries (party_id, invoice_id, entry_type, amount, balance_after, description)
             VALUES (?, ?, 'DEBIT', ?, ?, ?)`,
            [party.id, invoice.id, paidAmount, runningBalance, `Cash Paid for #${invoice.invoice_number}`]
          );
        }
      }

      // 3. Update Party's Final Running Debt Balance
      await db.run('UPDATE parties SET current_balance = ? WHERE id = ?', [runningBalance, party.id]);

      // 4. Mark Invoice as Completed with Snapshotted Financials
      await db.run(
        `UPDATE invoices 
         SET status = 'COMPLETED', paid_amount = ?, balance_due = ?, committed_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [paidAmount, invoiceBalanceDue, invoiceId]
      );
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;