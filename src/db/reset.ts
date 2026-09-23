import { db } from './index';

async function resetDatabase() {
  console.log('Resetting database to a clean slate...');

  await db.transaction(async () => {
    // 1. Delete transactional data first (foreign keys)
    await db.run('DELETE FROM ledger_entries;');
    await db.run('DELETE FROM invoice_items;');
    await db.run('DELETE FROM invoices;');

    // 2. Delete inventory items and brands
    await db.run('DELETE FROM products;');
    await db.run('DELETE FROM brands;');
    await db.run('DELETE FROM parties;');

    // 3. Reset auto-increment counters
    await db.run("DELETE FROM sqlite_sequence WHERE name IN ('products', 'brands', 'invoices', 'invoice_items', 'ledger_entries', 'parties');");

    // 4. Ensure the 4 base categories exist
    await db.run(`
      INSERT OR IGNORE INTO categories (name) VALUES 
      ('Heavy Fabric'),
      ('Light Fabric'),
      ('Accessories'),
      ('Stones');
    `);
  });

  console.log('Database successfully cleaned! Ready for production input.');
  process.exit(0);
}

resetDatabase().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});