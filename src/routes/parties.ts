import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';

const router = Router();

// List parties (optional query: ?type=CUSTOMER or ?type=SUPPLIER)
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type } = req.query;
    const query = type 
      ? 'SELECT * FROM parties WHERE type = ? AND is_active = 1 ORDER BY name ASC'
      : 'SELECT * FROM parties WHERE is_active = 1 ORDER BY name ASC';
    const params = type ? [type] : [];
    const rows = await db.all(query, params);
    res.json(rows);
  } catch (err) { next(err); }
});

// Create Customer or Supplier
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
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

// Get Party Ledger Entries (Debits & Credits)
router.get('/:id/ledger', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await db.all(
      `SELECT le.*, i.invoice_number 
       FROM ledger_entries le
       LEFT JOIN invoices i ON le.invoice_id = i.id
       WHERE le.party_id = ?
       ORDER BY le.created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Record a Direct Payment (Cash collection or Payment to supplier)
router.post('/:id/payment', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partyId = req.params.id;
    const { amount, description = 'Direct Cash Settlement' } = req.body;
    const payVal = Number(amount);

    if (isNaN(payVal) || payVal <= 0) {
      return res.status(400).json({ error: 'Payment amount must be greater than 0.' });
    }

    await db.transaction(async () => {
      const party = await db.get<any>('SELECT * FROM parties WHERE id = ?', [partyId]);
      if (!party) throw new Error('Party not found.');

      // If customer pays: debt decreases. If we pay supplier: debt decreases (towards zero).
      const newBalance = party.type === 'CUSTOMER'
        ? party.current_balance - payVal
        : party.current_balance + payVal;

      await db.run('UPDATE parties SET current_balance = ? WHERE id = ?', [newBalance, partyId]);

      await db.run(
        `INSERT INTO ledger_entries (party_id, entry_type, amount, balance_after, description)
         VALUES (?, ?, ?, ?, ?)`,
        [
          partyId,
          party.type === 'CUSTOMER' ? 'CREDIT' : 'DEBIT',
          payVal,
          newBalance,
          description
        ]
      );
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;