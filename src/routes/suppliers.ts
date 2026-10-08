import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';

const router = Router();

export interface SupplierRow {
  id: number;
  name: string;                          // Representative / Contact Person
  shop_name: string | null;              // Mill / Factory / Company Name
  phone: string | null;                  // Office / Primary Phone
  secondary_phone: string | null;        // WhatsApp / Rep Mobile
  city: string | null;                   // Industrial City (e.g., Faisalabad, Karachi)
  address: string | null;
  notes: string | null;                  // Bank Details / IBAN / Payment Terms
  current_balance: number;
  is_active: number;
  created_at: string;
}

// 1. List all suppliers with extended details
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const suppliers = await db.all<SupplierRow>(
      `SELECT * FROM parties 
       WHERE type = 'SUPPLIER' AND is_active = 1 
       ORDER BY name ASC`
    );

    // Negative balance = money we owe mills
    const totalPayable = suppliers.reduce(
      (sum, s) => sum + (s.current_balance < 0 ? Math.abs(s.current_balance) : 0), 
      0
    );

    res.json({ totalPayable, suppliers });
  } catch (err) { next(err); }
});

// 2. Register a new Supplier / Mill
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      name,
      shopName,
      phone,
      secondaryPhone,
      city,
      address,
      notes,
      openingBalanceOwed = 0
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Contact person or representative name is required.' });
    }

    const initOwed = Number(openingBalanceOwed) || 0;
    // In database: negative current_balance = we owe them
    const initialBalance = -Math.abs(initOwed);

    await db.transaction(async () => {
      // 1. Insert Supplier
      const result = await db.run(
        `INSERT INTO parties 
         (type, name, shop_name, phone, secondary_phone, city, address, notes, current_balance)
         VALUES ('SUPPLIER', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name.trim(),
          shopName ? shopName.trim() : null,
          phone ? phone.trim() : null,
          secondaryPhone ? secondaryPhone.trim() : null,
          city ? city.trim() : null,
          address ? address.trim() : null,
          notes ? notes.trim() : null,
          initialBalance
        ]
      );

      const supplierId = result.lastID;

      // 2. If opening debt exists, record in ledger statement
      if (initOwed > 0) {
        await db.run(
          `INSERT INTO ledger_entries (party_id, entry_type, amount, balance_after, description)
           VALUES (?, 'CREDIT', ?, ?, 'Initial Opening Balance Owed to Mill (System Setup)')`,
          [supplierId, initOwed, initialBalance]
        );
      }
    });

    res.status(201).json({ success: true, message: 'Supplier registered successfully.' });
  } catch (err) { next(err); }
});

// 3. Supplier Ledger Statement
router.get('/:id/ledger', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const supplier = await db.get<SupplierRow>(
      'SELECT * FROM parties WHERE id = ? AND type = "SUPPLIER"', 
      [req.params.id]
    );
    if (!supplier) return res.status(404).json({ error: 'Supplier not found.' });

    const entries = await db.all(
      `SELECT le.*, i.invoice_number 
       FROM ledger_entries le
       LEFT JOIN invoices i ON le.invoice_id = i.id
       WHERE le.party_id = ?
       ORDER BY le.created_at DESC`,
      [req.params.id]
    );

    res.json({ supplier, entries });
  } catch (err) { next(err); }
});

// 4. Record Payout Made to Supplier
router.post('/:id/pay', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const supplierId = req.params.id;
    const amount = Number(req.body.amount);
    const note = req.body.note ? String(req.body.note).trim() : 'Supplier Payout';

    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Valid payment amount required.' });
    }

    await db.transaction(async () => {
      const supplier = await db.get<SupplierRow>(
        'SELECT * FROM parties WHERE id = ? AND type = "SUPPLIER"', 
        [supplierId]
      );
      if (!supplier) throw new Error('Supplier not found.');

      // We pay money -> reduces what we owe (moves closer to 0)
      const newBalance = supplier.current_balance + amount;

      await db.run('UPDATE parties SET current_balance = ? WHERE id = ?', [newBalance, supplierId]);

      await db.run(
        `INSERT INTO ledger_entries (party_id, entry_type, amount, balance_after, description)
         VALUES (?, 'DEBIT', ?, ?, ?)`,
        [supplierId, amount, newBalance, `Payout to Mill: ${note}`]
      );
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});
// 1. Update Supplier Profile (current_balance strictly excluded)
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const supplierId = req.params.id;
    const { name, shopName, phone, secondaryPhone, city, address, notes } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Contact person or representative name is required.' });
    }

    await db.run(
      `UPDATE parties 
       SET name = ?, shop_name = ?, phone = ?, secondary_phone = ?, 
           city = ?, address = ?, notes = ?
       WHERE id = ? AND type = 'SUPPLIER'`,
      [
        name.trim(),
        shopName ? shopName.trim() : null,
        phone ? phone.trim() : null,
        secondaryPhone ? secondaryPhone.trim() : null,
        city ? city.trim() : null,
        address ? address.trim() : null,
        notes ? notes.trim() : null,
        supplierId
      ]
    );

    res.json({ success: true, message: 'Supplier updated successfully.' });
  } catch (err) { next(err); }
});

// 2. Soft-Delete / Toggle Supplier Status
router.patch('/:id/toggle', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await db.run(
      'UPDATE parties SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ? AND type = "SUPPLIER"',
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;