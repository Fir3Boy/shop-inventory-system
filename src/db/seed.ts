import { db } from './index';

async function seed() {
  console.log('Seeding comprehensive textile test data...');
  
  await db.initializeSchema();

  await db.transaction(async () => {
    // -----------------------------------------------------------------
    // 0. CLEAN SLATE FOR SEEDING
    // -----------------------------------------------------------------
    await db.run('DELETE FROM ledger_entries;');
    await db.run('DELETE FROM invoice_items;');
    await db.run('DELETE FROM invoices;');
    await db.run('DELETE FROM products;');
    await db.run('DELETE FROM brands;');
    await db.run('DELETE FROM categories;');
    await db.run('DELETE FROM parties;');
    await db.run("DELETE FROM sqlite_sequence WHERE name IN ('products', 'brands', 'invoices', 'invoice_items', 'ledger_entries', 'parties');");

    // -----------------------------------------------------------------
    // 1. SEED CATEGORIES (4 Root Tiers)
    // -----------------------------------------------------------------
    await db.run(`
      INSERT INTO categories (id, name) VALUES 
      (1, 'Heavy Fabric'),
      (2, 'Light Fabric'),
      (3, 'Accessories'),
      (4, 'Stones');
    `);

    // -----------------------------------------------------------------
    // 2. SEED BRANDS (2 under each category)
    // -----------------------------------------------------------------
    await db.run(`
      INSERT INTO brands (id, category_id, name) VALUES
      (1, 1, 'Kohinoor Velvet'),
      (2, 1, 'Shaheen Brocade'),
      (3, 2, 'Gul Ahmed Lawn'),
      (4, 2, 'Al-Karam Cotton'),
      (5, 3, 'YKK Zippers'),
      (6, 3, 'Golden Lace Co.'),
      (7, 4, 'Swarovski Crystal'),
      (8, 4, 'DMC Rhinestones');
    `);

    // -----------------------------------------------------------------
    // 3. SEED PRODUCTS (Dual Unit Ratios & Wholesale Pricing)
    // -----------------------------------------------------------------
    await db.run(`
      INSERT INTO products 
      (id, brand_id, sku, name, spools_per_carton, stock_spools, cost_price_spool, retail_price_spool, wholesale_price_carton) 
      VALUES
      -- Heavy Fabric
      (1, 1, 'KV-BLK-01', 'Velvet Heavy Black Spool', 24, 240, 10.0, 15.0, 320.0),
      (2, 1, 'KV-RED-02', 'Velvet Crimson Red Spool', 24, 120, 10.0, 15.0, 320.0),
      (3, 2, 'SB-GLD-05', 'Brocade Metallic Gold Spool', 12, 96, 18.0, 25.0, 270.0),
      
      -- Light Fabric
      (4, 3, 'GA-WHT-10', 'Fine Lawn White Thread', 48, 480, 4.0, 7.0, 300.0),
      (5, 3, 'GA-BLU-11', 'Fine Lawn Royal Blue', 48, 96, 4.0, 7.0, 300.0),
      (6, 4, 'AK-BLK-20', 'Pure Cotton Black Thread', 36, 180, 5.0, 8.5, 280.0),
      
      -- Accessories
      (7, 5, 'YKK-M-05', 'Metal Zipper Roll #5', 12, 60, 25.0, 35.0, 380.0),
      (8, 6, 'GL-SLV-08', 'Silver Embroidered Lace', 20, 100, 12.0, 18.0, 330.0),
      
      -- Stones
      (9, 7, 'SW-SS16-CLR', 'Crystal Stones SS16 Clear', 10, 50, 50.0, 75.0, 680.0),
      (10, 8, 'DMC-HOT-AB', 'Hotfix Rhinestones Aurora', 10, 70, 30.0, 45.0, 420.0);
    `);

    // -----------------------------------------------------------------
    // 4. SEED PARTIES (With Shop Name, City, WhatsApp & Credit Limits)
    // -----------------------------------------------------------------
    await db.run(`
      INSERT INTO parties 
      (id, type, name, shop_name, phone, secondary_phone, city, address, credit_limit, notes, current_balance) 
      VALUES
      -- Customers (Positive balance = They owe us)
      (1, 'CUSTOMER', 'Haji Tariq Mahmood', 'Tariq Fabrics & Boutique', '0300-1122334', '0321-9988776', 'Lahore (Azam Market)', 'Shop #12, Kashmir Block', 10000.0, 'VIP wholesale buyer. 30-day settlement cycle.', 1450.00),
      (2, 'CUSTOMER', 'Rashid Khan', 'Khan Embroidery Center', '0333-5566778', '0300-4433221', 'Faisalabad (Rail Bazaar)', 'Plaza 4, Shop 2', 5000.0, 'Weekly deliveries. Thursday cheques.', 640.00),
      (3, 'CUSTOMER', 'Cash Counter', 'Retail Walk-in Customers', 'N/A', NULL, 'Local Shop', 'Over the counter', 0.0, 'Pure cash settlements. No credit.', 0.00),

      -- Suppliers / Mills (Negative balance = We owe them)
      (4, 'SUPPLIER', 'Kamran Akram (Rep)', 'Kohinoor Textile Mills Ltd', '042-3587000', '0301-8877665', 'Faisalabad Industrial Area', 'Mill Gate #3, Jaranwala Road', 0.0, 'Bank: HBL IBAN PK99HABB000123456789. Cheques cleared on 15th.', -2600.00),
      (5, 'SUPPLIER', 'Sheikh Bilal', 'Premier Zippers & Trims', '021-3241556', '0312-3344556', 'Karachi (Bolton Market)', 'Godown #8, Textile Plaza', 0.0, 'Wire transfer required before bilty release.', -1250.00);
    `);

    // -----------------------------------------------------------------
    // 5. SEED HISTORICAL INVOICES (For Reports & Movement Testing)
    // -----------------------------------------------------------------

    // --- TRANSACTION 1: Inbound Purchase from Kohinoor Mills (10 days ago) ---
    await db.run(`
      INSERT INTO invoices 
      (id, invoice_number, party_id, type, status, subtotal, total_amount, paid_amount, balance_due, notes, committed_at)
      VALUES 
      (1, 'PUR-00101', 4, 'IN', 'COMPLETED', 3600.0, 3600.0, 1000.0, 2600.0, 'Mill Bill #KM-8841 (Bilty #402)', datetime('now', '-10 days'));
    `);
    await db.run(`
      INSERT INTO invoice_items 
      (invoice_id, product_id, unit, quantity, spools_per_carton_snapshot, base_quantity_spools, unit_price, line_total)
      VALUES 
      (1, 1, 'CARTON', 10, 24, 240, 240.0, 2400.0), -- 10 Cartons Velvet Black
      (1, 2, 'CARTON', 5, 24, 120, 240.0, 1200.0);   -- 5 Cartons Velvet Red
    `);
    await db.run(`
      INSERT INTO ledger_entries 
      (party_id, invoice_id, entry_type, amount, balance_after, description, created_at)
      VALUES 
      (4, 1, 'CREDIT', 3600.0, -3600.0, 'Supplier Bill #PUR-00101 [Ref: Mill Bill #KM-8841 (Bilty #402)]', datetime('now', '-10 days')),
      (4, 1, 'DEBIT', 1000.0, -2600.0, 'Cash Paid for #PUR-00101', datetime('now', '-10 days'));
    `);

    // --- TRANSACTION 2: Inbound Purchase from Premier Zippers (7 days ago) ---
    await db.run(`
      INSERT INTO invoices 
      (id, invoice_number, party_id, type, status, subtotal, total_amount, paid_amount, balance_due, notes, committed_at)
      VALUES 
      (2, 'PUR-00102', 5, 'IN', 'COMPLETED', 1500.0, 1500.0, 250.0, 1250.0, 'Karachi Consignment #PZ-992', datetime('now', '-7 days'));
    `);
    await db.run(`
      INSERT INTO invoice_items 
      (invoice_id, product_id, unit, quantity, spools_per_carton_snapshot, base_quantity_spools, unit_price, line_total)
      VALUES 
      (2, 7, 'CARTON', 5, 12, 60, 300.0, 1500.0); -- 5 Cartons Zippers
    `);
    await db.run(`
      INSERT INTO ledger_entries 
      (party_id, invoice_id, entry_type, amount, balance_after, description, created_at)
      VALUES 
      (5, 2, 'CREDIT', 1500.0, -1500.0, 'Supplier Bill #PUR-00102 [Ref: Karachi Consignment #PZ-992]', datetime('now', '-7 days')),
      (5, 2, 'DEBIT', 250.0, -1250.0, 'Cash Paid for #PUR-00102', datetime('now', '-7 days'));
    `);

    // --- TRANSACTION 3: Wholesale Sale to Tariq Fabrics (4 days ago) ---
    await db.run(`
      INSERT INTO invoices 
      (id, invoice_number, party_id, type, status, subtotal, total_amount, paid_amount, balance_due, notes, committed_at)
      VALUES 
      (3, 'SALE-00201', 1, 'OUT', 'COMPLETED', 1700.0, 1700.0, 250.0, 1450.0, 'Order #TF-110 (Driver Aslam)', datetime('now', '-4 days'));
    `);
    await db.run(`
      INSERT INTO invoice_items 
      (invoice_id, product_id, unit, quantity, spools_per_carton_snapshot, base_quantity_spools, unit_price, line_total)
      VALUES 
      (3, 1, 'CARTON', 2, 24, 48, 320.0, 640.0),   -- 2 Cartons Velvet Black
      (3, 7, 'CARTON', 1, 12, 12, 380.0, 380.0),   -- 1 Carton Zippers
      (3, 9, 'CARTON', 1, 10, 10, 680.0, 680.0);   -- 1 Carton Swarovski Clear
    `);
    await db.run(`
      INSERT INTO ledger_entries 
      (party_id, invoice_id, entry_type, amount, balance_after, description, created_at)
      VALUES 
      (1, 3, 'DEBIT', 1700.0, 1700.0, 'Invoice #SALE-00201 [Ref: Order #TF-110 (Driver Aslam)]', datetime('now', '-4 days')),
      (1, 3, 'CREDIT', 250.0, 1450.0, 'Cash Paid for #SALE-00201', datetime('now', '-4 days'));
    `);

    // --- TRANSACTION 4: Wholesale Sale to Khan Embroidery (2 days ago) ---
    await db.run(`
      INSERT INTO invoices 
      (id, invoice_number, party_id, type, status, subtotal, total_amount, paid_amount, balance_due, notes, committed_at)
      VALUES 
      (4, 'SALE-00202', 2, 'OUT', 'COMPLETED', 670.0, 670.0, 30.0, 640.0, 'Urgent Eid delivery', datetime('now', '-2 days'));
    `);
    await db.run(`
      INSERT INTO invoice_items 
      (invoice_id, product_id, unit, quantity, spools_per_carton_snapshot, base_quantity_spools, unit_price, line_total)
      VALUES 
      (4, 4, 'CARTON', 2, 48, 96, 300.0, 600.0), -- 2 Cartons Lawn Thread
      (4, 5, 'SPOOL', 10, 48, 10, 7.0, 70.0);    -- 10 Loose Spools
    `);
    await db.run(`
      INSERT INTO ledger_entries 
      (party_id, invoice_id, entry_type, amount, balance_after, description, created_at)
      VALUES 
      (2, 4, 'DEBIT', 670.0, 670.0, 'Invoice #SALE-00202 [Ref: Urgent Eid delivery]', datetime('now', '-2 days')),
      (2, 4, 'CREDIT', 30.0, 640.0, 'Cash Paid for #SALE-00202', datetime('now', '-2 days'));
    `);

    // --- TRANSACTION 5: Walk-in Retail Cash Sale (Today) ---
    await db.run(`
      INSERT INTO invoices 
      (id, invoice_number, party_id, type, status, subtotal, total_amount, paid_amount, balance_due, notes, committed_at)
      VALUES 
      (5, 'SALE-00203', 3, 'OUT', 'COMPLETED', 60.0, 60.0, 60.0, 0.0, 'Counter retail receipt', datetime('now'));
    `);
    await db.run(`
      INSERT INTO invoice_items 
      (invoice_id, product_id, unit, quantity, spools_per_carton_snapshot, base_quantity_spools, unit_price, line_total)
      VALUES 
      (5, 2, 'SPOOL', 4, 24, 4, 15.0, 60.0); -- 4 Loose Spools Velvet Red
    `);
    await db.run(`
      INSERT INTO ledger_entries 
      (party_id, invoice_id, entry_type, amount, balance_after, description, created_at)
      VALUES 
      (3, 5, 'DEBIT', 60.0, 60.0, 'Invoice #SALE-00203 [Ref: Counter retail receipt]', datetime('now')),
      (3, 5, 'CREDIT', 60.0, 0.0, 'Cash Paid for #SALE-00203', datetime('now'));
    `);

  });

  console.log('Seeding complete! Complete catalog, parties, historical invoices, and ledger statements are loaded.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seeding error:', err);
  process.exit(1);
});