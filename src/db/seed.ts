import { db } from './index';

async function seed() {
  console.log('Seeding demo textile data...');

  await db.transaction(async () => {
    // 1. Insert Brands
    await db.run(`
      INSERT OR IGNORE INTO brands (id, category_id, name) VALUES
      (1, 1, 'Kohinoor Velvet'),
      (2, 1, 'Shaheen Brocade'),
      (3, 2, 'Gul Ahmed Lawn'),
      (4, 2, 'Al-Karam Cotton'),
      (5, 3, 'YKK Zippers'),
      (6, 3, 'Golden Lace Co.'),
      (7, 4, 'Swarovski Crystal'),
      (8, 4, 'DMC Rhinestones');
    `);

    // 2. Insert Products (with spools_per_carton ratio)
    // 1 Carton = 24 or 48 Spools
    await db.run(`
      INSERT OR IGNORE INTO products 
      (id, brand_id, sku, name, spools_per_carton, stock_spools, cost_price_spool, retail_price_spool, wholesale_price_carton) 
      VALUES
      (1, 1, 'KV-BLK-01', 'Velvet Heavy Black Spool', 24, 240, 10.0, 15.0, 320.0),
      (2, 1, 'KV-RED-02', 'Velvet Crimson Red Spool', 24, 120, 10.0, 15.0, 320.0),
      (3, 3, 'GA-WHT-10', 'Fine Lawn White Thread', 48, 480, 4.0, 7.0, 300.0),
      (4, 3, 'GA-BLU-11', 'Fine Lawn Royal Blue', 48, 96, 4.0, 7.0, 300.0),
      (5, 5, 'YKK-M-05', 'Metal Zipper Roll #5', 12, 60, 25.0, 35.0, 380.0),
      (6, 7, 'SW-SS16-CLR', 'Crystal Stones SS16 Clear', 10, 50, 50.0, 75.0, 680.0);
    `);

    // 3. Insert Demo Parties (Customers & Suppliers)
    await db.run(`
      INSERT OR IGNORE INTO parties (id, type, name, phone, current_balance) VALUES
      (1, 'CUSTOMER', 'Ahmed Boutique (Wholesale)', '0300-1122334', 1500.00),
      (2, 'CUSTOMER', 'Walk-in Retail Cash', 'N/A', 0.00),
      (3, 'SUPPLIER', 'Premier Textile Mills (Supplier)', '042-9988776', -4500.00);
    `);
  });

  console.log('Seeding complete! Initial brands, products, and parties are ready.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seeding error:', err);
  process.exit(1);
});