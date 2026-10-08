import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';

const router = Router();

export interface CustomerRow {
  id: number;
  name: string;
  shop_name: string | null;
  phone: string | null;
  secondary_phone: string | null;
  city: string | null;
  address: string | null;
  credit_limit: number;
  notes: string | null;
  current_balance: number;
  is_active: number;
  created_at: string;
}

// 1. List all customers
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const customers = await db.all<CustomerRow>(
      `SELECT * FROM parties 
       WHERE type = 'CUSTOMER' AND is_active = 1 
       ORDER BY name ASC`
    );

    const totalReceivable = customers.reduce(
      (sum, c) => sum + (c.current_balance > 0 ? c.current_balance : 0), 
      0
    );

    res.json({ totalReceivable, customers });
  } catch (err) { next(err); }
});

// 2. Create a new Customer with extended details
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      name,
      shopName,
      phone,
      secondaryPhone,
      city,
      address,
      creditLimit = 0,
      notes,
      openingBalance = 0
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Customer Name is required.' });
    }

    const initBal = Number(openingBalance) || 0;
    const credLim = Number(creditLimit) || 0;

    await db.transaction(async () => {
      // 1. Insert party record
      const result = await db.run(
        `INSERT INTO parties 
         (type, name, shop_name, phone, secondary_phone, city, address, credit_limit, notes, current_balance)
         VALUES ('CUSTOMER', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name.trim(),
          shopName ? shopName.trim() : null,
          phone ? phone.trim() : null,
          secondaryPhone ? secondaryPhone.trim() : null,
          city ? city.trim() : null,
          address ? address.trim() : null,
          credLim,
          notes ? notes.trim() : null,
          initBal
        ]
      );

      const customerId = result.lastID;

      // 2. If customer has an opening debt, record it in ledger for proof
      if (initBal > 0) {
        await db.run(
          `INSERT INTO ledger_entries (party_id, entry_type, amount, balance_after, description)
           VALUES (?, 'DEBIT', ?, ?, 'Initial Opening Balance (System Setup)')`,
          [customerId, initBal, initBal]
        );
      }
    });

    res.status(201).json({ success: true, message: 'Customer registered successfully.' });
  } catch (err) { next(err); }
});

// 3. Customer Ledger
router.get('/:id/ledger', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customer = await db.get<CustomerRow>(
      'SELECT * FROM parties WHERE id = ? AND type = "CUSTOMER"', 
      [req.params.id]
    );
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });

    const entries = await db.all(
      `SELECT le.*, i.invoice_number 
       FROM ledger_entries le
       LEFT JOIN invoices i ON le.invoice_id = i.id
       WHERE le.party_id = ?
       ORDER BY le.created_at DESC`,
      [req.params.id]
    );

    res.json({ customer, entries });
  } catch (err) { next(err); }
});

// 4. Cash Collection
router.post('/:id/collect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customerId = req.params.id;
    const amount = Number(req.body.amount);
    const note = req.body.note ? String(req.body.note).trim() : 'Cash Collection';

    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Valid payment amount required.' });
    }

    await db.transaction(async () => {
      const customer = await db.get<CustomerRow>(
        'SELECT * FROM parties WHERE id = ? AND type = "CUSTOMER"', 
        [customerId]
      );
      if (!customer) throw new Error('Customer not found.');

      const newBalance = customer.current_balance - amount;

      await db.run('UPDATE parties SET current_balance = ? WHERE id = ?', [newBalance, customerId]);

      await db.run(
        `INSERT INTO ledger_entries (party_id, entry_type, amount, balance_after, description)
         VALUES (?, 'CREDIT', ?, ?, ?)`,
        [customerId, amount, newBalance, `Cash Collected: ${note}`]
      );
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});
// 1. Update Customer Profile (Notice: current_balance is strictly excluded!)
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customerId = req.params.id;
    const { name, shopName, phone, secondaryPhone, city, address, creditLimit, notes } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Customer name is required.' });
    }

    await db.run(
      `UPDATE parties 
       SET name = ?, shop_name = ?, phone = ?, secondary_phone = ?, 
           city = ?, address = ?, credit_limit = ?, notes = ?
       WHERE id = ? AND type = 'CUSTOMER'`,
      [
        name.trim(),
        shopName ? shopName.trim() : null,
        phone ? phone.trim() : null,
        secondaryPhone ? secondaryPhone.trim() : null,
        city ? city.trim() : null,
        address ? address.trim() : null,
        Number(creditLimit) || 0,
        notes ? notes.trim() : null,
        customerId
      ]
    );

    res.json({ success: true, message: 'Customer updated successfully.' });
  } catch (err) { next(err); }
});

// 2. Soft-Delete / Toggle Customer Status
router.patch('/:id/toggle', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await db.run(
      'UPDATE parties SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ? AND type = "CUSTOMER"',
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;