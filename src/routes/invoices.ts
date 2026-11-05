import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';

const router = Router();

// Create or fetch active draft for a party
router.post('/draft', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { partyId, type = 'OUT', isReturn = false } = req.body;
    if (!partyId) return res.status(400).json({ error: 'Party ID required.' });

    // Customer returns = RET-XXXX | Supplier returns (Debit Note) = DEB-XXXX
    const prefix = isReturn ? (type === 'OUT' ? 'RET' : 'DEB') : (type === 'OUT' ? 'SALE' : 'PUR');
    const invoiceNumber = `${prefix}-${Date.now().toString().slice(-6)}`;

    const result = await db.run(
      `INSERT INTO invoices (invoice_number, party_id, type, is_return, status) 
       VALUES (?, ?, ?, ?, 'DRAFT')`,
      [invoiceNumber, partyId, type, isReturn ? 1 : 0]
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
    // 1. Read discount / round-off
    const discount = Math.max(0, Number(req.body.discount) || 0);
    const notes = req.body.notes ? String(req.body.notes).trim() : null;

    await db.transaction(async () => {
      const invoice = await db.get<any>('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
      if (!invoice || invoice.status !== 'DRAFT') throw new Error('Valid draft invoice required.');

      const items = await db.all<any>('SELECT * FROM invoice_items WHERE invoice_id = ?', [invoiceId]);
      if (items.length === 0) throw new Error('Cannot commit an empty invoice sheet.');

      const party = await db.get<any>('SELECT * FROM parties WHERE id = ?', [invoice.party_id]);
      if (!party) throw new Error('Party not found.');

      // 1. INVENTORY ADJUSTMENTS
      for (const item of items) {
        if (invoice.type === 'OUT') {
          if (invoice.is_return === 1) {
            // Customer Return: Put spools back into stock
            await db.run('UPDATE products SET stock_spools = stock_spools + ? WHERE id = ?', [item.base_quantity_spools, item.product_id]);
          } else {
            // Customer Sale: Deduct stock
            const prod = await db.get<any>('SELECT stock_spools FROM products WHERE id = ?', [item.product_id]);
            if (prod.stock_spools < item.base_quantity_spools) {
              throw new Error(`Insufficient inventory for product ID: ${item.product_id}`);
            }
            await db.run('UPDATE products SET stock_spools = stock_spools - ? WHERE id = ?', [item.base_quantity_spools, item.product_id]);
          }
        } else {
          // --- SUPPLIER TRANSACTIONS ---
          if (invoice.is_return === 1) {
            // SUPPLIER RETURN: We are sending defective stock BACK to mill (Deduct from stock)
            const prod = await db.get<any>('SELECT stock_spools FROM products WHERE id = ?', [item.product_id]);
            if (prod.stock_spools < item.base_quantity_spools) {
              throw new Error(`Cannot return ${item.base_quantity_spools} spools. Current shop stock is only ${prod.stock_spools}.`);
            }
            await db.run('UPDATE products SET stock_spools = stock_spools - ? WHERE id = ?', [item.base_quantity_spools, item.product_id]);
          } else {
            // INWARD PURCHASE: Stock arrives into shop
            await db.run('UPDATE products SET stock_spools = stock_spools + ? WHERE id = ?', [item.base_quantity_spools, item.product_id]);
          }
        }
      }

      // 2. FINANCIALS & DOUBLE-ENTRY LEDGER
      const finalTotalAmount = Math.max(0, invoice.subtotal - discount);
      const balanceDue = Math.max(0, finalTotalAmount - paidAmount);
      const refTag = notes ? ` [Ref: ${notes}]` : '';
      let runningBalance = party.current_balance;

      if (invoice.type === 'OUT') {
        if (invoice.is_return === 1) {
          // --- A. CUSTOMER RETURN (Credit Note) ---
          runningBalance -= finalTotalAmount;
          await db.run(
            `INSERT INTO ledger_entries (party_id, invoice_id, entry_type, amount, balance_after, description)
             VALUES (?, ?, 'CREDIT', ?, ?, ?)`,
            [party.id, invoice.id, finalTotalAmount, runningBalance, `Credit Note / Return #${invoice.invoice_number}${refTag}`]
          );

          if (paidAmount > 0) {
            runningBalance += paidAmount;
            await db.run(
              `INSERT INTO ledger_entries (party_id, invoice_id, entry_type, amount, balance_after, description)
               VALUES (?, ?, 'DEBIT', ?, ?, ?)`,
              [party.id, invoice.id, paidAmount, runningBalance, `Cash Refund Paid Out for #${invoice.invoice_number}`]
            );
          }
        } else {
          // --- B. STANDARD SALE ---
          runningBalance += finalTotalAmount;
          await db.run(
            `INSERT INTO ledger_entries (party_id, invoice_id, entry_type, amount, balance_after, description)
             VALUES (?, ?, 'DEBIT', ?, ?, ?)`,
            [party.id, invoice.id, finalTotalAmount, runningBalance, `Invoice #${invoice.invoice_number}${refTag}`]
          );

          if (paidAmount > 0) {
            runningBalance -= paidAmount;
            await db.run(
              `INSERT INTO ledger_entries (party_id, invoice_id, entry_type, amount, balance_after, description)
               VALUES (?, ?, 'CREDIT', ?, ?, ?)`,
              [party.id, invoice.id, paidAmount, runningBalance, `Cash Paid for #${invoice.invoice_number}`]
            );
          }
        }
      } else {
        // --- SUPPLIER / MILL TRANSACTIONS ---
        if (invoice.is_return === 1) {
          // --- VENDOR RETURN / DEBIT NOTE ---
          runningBalance += finalTotalAmount;
          await db.run(
            `INSERT INTO ledger_entries (party_id, invoice_id, entry_type, amount, balance_after, description)
             VALUES (?, ?, 'DEBIT', ?, ?, ?)`,
            [party.id, invoice.id, finalTotalAmount, runningBalance, `Debit Note / Supplier Return #${invoice.invoice_number}${refTag}`]
          );

          if (paidAmount > 0) {
            runningBalance -= paidAmount;
            await db.run(
              `INSERT INTO ledger_entries (party_id, invoice_id, entry_type, amount, balance_after, description)
               VALUES (?, ?, 'CREDIT', ?, ?, ?)`,
              [party.id, invoice.id, paidAmount, runningBalance, `Cash Refund Received from Mill for #${invoice.invoice_number}`]
            );
          }
        } else {
          // --- STANDARD INWARD PURCHASE ---
          runningBalance -= finalTotalAmount;
          await db.run(
            `INSERT INTO ledger_entries (party_id, invoice_id, entry_type, amount, balance_after, description)
             VALUES (?, ?, 'CREDIT', ?, ?, ?)`,
            [party.id, invoice.id, finalTotalAmount, runningBalance, `Supplier Bill #${invoice.invoice_number}${refTag}`]
          );

          if (paidAmount > 0) {
            runningBalance += paidAmount;
            await db.run(
              `INSERT INTO ledger_entries (party_id, invoice_id, entry_type, amount, balance_after, description)
               VALUES (?, ?, 'DEBIT', ?, ?, ?)`,
              [party.id, invoice.id, paidAmount, runningBalance, `Cash Paid for #${invoice.invoice_number}`]
            );
          }
        }
      }

      // 3. Update Party Balance and Invoice Record
      await db.run('UPDATE parties SET current_balance = ? WHERE id = ?', [runningBalance, party.id]);

      await db.run(
        `UPDATE invoices 
         SET status = 'COMPLETED', subtotal = ?, discount = ?, total_amount = ?, paid_amount = ?, balance_due = ?, notes = ?, committed_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [invoice.subtotal, discount, finalTotalAmount, paidAmount, balanceDue, notes, invoiceId]
      );
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// 1. Search / List Invoices (by Invoice #, Ref/Notes, or Customer/Supplier Name)
router.get('/lookup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = req.query.q ? String(req.query.q).trim() : '';
    let sql = `
      SELECT 
        i.id,
        i.invoice_number,
        i.type,
        i.is_return,
        i.status,
        i.total_amount,
        i.paid_amount,
        i.balance_due,
        i.notes,
        date(i.committed_at) AS invoice_date,
        pt.name AS party_name,
        pt.shop_name AS party_shop,
        pt.type AS party_type
      FROM invoices i
      JOIN parties pt ON i.party_id = pt.id
      WHERE i.status = 'COMPLETED'
    `;
    const params: unknown[] = [];

    if (query) {
      sql += ` AND (
        i.invoice_number LIKE ? OR 
        i.notes LIKE ? OR 
        pt.name LIKE ? OR 
        pt.shop_name LIKE ?
      )`;
      const term = `%${query}%`;
      params.push(term, term, term, term);
    }

    sql += ` ORDER BY i.committed_at DESC LIMIT 50`;

    const rows = await db.all(sql, params);
    res.json(rows);
  } catch (err) { next(err); }
});

// 2. Get Full Invoice Details & Line Items (by ID or Invoice Number)
router.get('/details/:identifier', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { identifier } = req.params;

    // Fetch Invoice Header & Party Details
    const invoice = await db.get<any>(
      `SELECT 
        i.*,
        date(i.committed_at) AS invoice_date,
        pt.name AS party_name,
        pt.shop_name AS party_shop,
        pt.phone AS party_phone,
        pt.secondary_phone AS party_secondary_phone,
        pt.city AS party_city,
        pt.address AS party_address,
        pt.type AS party_type
       FROM invoices i
       JOIN parties pt ON i.party_id = pt.id
       WHERE (i.invoice_number = ? OR i.id = ?) AND i.status = 'COMPLETED'`,
      [identifier, identifier]
    );

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found or not yet completed.' });
    }

    // Fetch Line Items
    const items = await db.all(
      `SELECT 
        ii.*,
        p.name AS product_name,
        p.sku,
        b.name AS brand_name
       FROM invoice_items ii
       JOIN products p ON ii.product_id = p.id
       JOIN brands b ON p.brand_id = b.id
       WHERE ii.invoice_id = ?
       ORDER BY ii.id ASC`,
      [invoice.id]
    );

    res.json({ invoice, items });
  } catch (err) { next(err); }
});

// Void / Cancel a Committed Invoice (Reverses Stock & Ledger)
router.post('/:id/void', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoiceId = req.params.id;
    const reason = req.body.reason ? String(req.body.reason).trim() : 'Mistake / Cancelled by user';

    await db.transaction(async () => {
      // 1. Fetch Invoice
      const invoice = await db.get<any>('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
      if (!invoice) throw new Error('Invoice not found.');
      if (invoice.status === 'CANCELLED') throw new Error('This invoice is already voided/cancelled.');
      if (invoice.status !== 'COMPLETED') throw new Error('Only completed invoices can be voided.');

      const items = await db.all<any>('SELECT * FROM invoice_items WHERE invoice_id = ?', [invoiceId]);
      const party = await db.get<any>('SELECT * FROM parties WHERE id = ?', [invoice.party_id]);
      if (!party) throw new Error('Associated party not found.');

      // 2. REVERSE INVENTORY
      for (const item of items) {
        if (invoice.type === 'OUT') {
          if (invoice.is_return === 1) {
            // Reversing a customer return -> remove items back out of stock
            await db.run('UPDATE products SET stock_spools = stock_spools - ? WHERE id = ?', [item.base_quantity_spools, item.product_id]);
          } else {
            // Reversing a normal sale -> add items back into physical stock
            await db.run('UPDATE products SET stock_spools = stock_spools + ? WHERE id = ?', [item.base_quantity_spools, item.product_id]);
          }
        } else {
          // Reversing an inward invoice (Supplier)
          if (invoice.is_return === 1) {
            // Voiding a supplier return -> put items back in stock
            await db.run('UPDATE products SET stock_spools = stock_spools + ? WHERE id = ?', [item.base_quantity_spools, item.product_id]);
          } else {
            // Voiding an inward purchase -> remove items from stock
            await db.run('UPDATE products SET stock_spools = stock_spools - ? WHERE id = ?', [item.base_quantity_spools, item.product_id]);
          }
        }
      }

      // 3. REVERSE FINANCIALS & LEDGER
      let runningBalance = party.current_balance;

      if (invoice.type === 'OUT') {
        if (invoice.is_return === 1) {
          // Reversing a return: Customer debt goes back UP
          runningBalance += invoice.total_amount;
          await db.run(
            `INSERT INTO ledger_entries (party_id, invoice_id, entry_type, amount, balance_after, description)
             VALUES (?, ?, 'DEBIT', ?, ?, ?)`,
            [party.id, invoice.id, invoice.total_amount, runningBalance, `VOID REVERSAL: Cancelled Return #${invoice.invoice_number} [${reason}]`]
          );

          if (invoice.paid_amount > 0) {
            runningBalance -= invoice.paid_amount;
            await db.run(
              `INSERT INTO ledger_entries (party_id, invoice_id, entry_type, amount, balance_after, description)
               VALUES (?, ?, 'CREDIT', ?, ?, ?)`,
              [party.id, invoice.id, invoice.paid_amount, runningBalance, `VOID REVERSAL: Cash Refund Cancelled for #${invoice.invoice_number}`]
            );
          }
        } else {
          // Reversing a normal sale: Customer debt goes back DOWN
          runningBalance -= invoice.total_amount;
          await db.run(
            `INSERT INTO ledger_entries (party_id, invoice_id, entry_type, amount, balance_after, description)
             VALUES (?, ?, 'CREDIT', ?, ?, ?)`,
            [party.id, invoice.id, invoice.total_amount, runningBalance, `VOID REVERSAL: Cancelled Sale #${invoice.invoice_number} [${reason}]`]
          );

          if (invoice.paid_amount > 0) {
            runningBalance += invoice.paid_amount;
            await db.run(
              `INSERT INTO ledger_entries (party_id, invoice_id, entry_type, amount, balance_after, description)
               VALUES (?, ?, 'DEBIT', ?, ?, ?)`,
              [party.id, invoice.id, invoice.paid_amount, runningBalance, `VOID REVERSAL: Cash Received Cancelled for #${invoice.invoice_number}`]
            );
          }
        }
      } else {
        // Reversing an inward invoice (Supplier)
        if (invoice.is_return === 1) {
          // Voiding a debit note: We owe the mill again (balance moves back down)
          runningBalance -= invoice.total_amount;
          await db.run(
            `INSERT INTO ledger_entries (party_id, invoice_id, entry_type, amount, balance_after, description)
             VALUES (?, ?, 'CREDIT', ?, ?, ?)`,
            [party.id, invoice.id, invoice.total_amount, runningBalance, `VOID REVERSAL: Cancelled Debit Note #${invoice.invoice_number} [${reason}]`]
          );
        } else {
          // Reversing a normal purchase: What we owe mill goes back DOWN (moves closer to 0)
          runningBalance += invoice.total_amount;
          await db.run(
            `INSERT INTO ledger_entries (party_id, invoice_id, entry_type, amount, balance_after, description)
             VALUES (?, ?, 'DEBIT', ?, ?, ?)`,
            [party.id, invoice.id, invoice.total_amount, runningBalance, `VOID REVERSAL: Cancelled Purchase #${invoice.invoice_number} [${reason}]`]
          );

          if (invoice.paid_amount > 0) {
            runningBalance -= invoice.paid_amount;
            await db.run(
              `INSERT INTO ledger_entries (party_id, invoice_id, entry_type, amount, balance_after, description)
               VALUES (?, ?, 'CREDIT', ?, ?, ?)`,
              [party.id, invoice.id, invoice.paid_amount, runningBalance, `VOID REVERSAL: Cancelled Cash Paid for #${invoice.invoice_number}`]
            );
          }
        }
      }

      // 4. Update Party Balance
      await db.run('UPDATE parties SET current_balance = ? WHERE id = ?', [runningBalance, party.id]);

      // 5. Mark Invoice as CANCELLED with audit notes
      const voidNote = `[CANCELLED: ${reason}] ${invoice.notes || ''}`.trim();
      await db.run(
        `UPDATE invoices 
         SET status = 'CANCELLED', balance_due = 0, notes = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [voidNote, invoiceId]
      );
    });

    res.json({ success: true, message: 'Invoice successfully voided. Stock and debts have been restored.' });
  } catch (err) { next(err); }
});

export default router;