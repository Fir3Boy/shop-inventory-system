-- Enforce database stability and relational integrity
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

-- ---------------------------------------------------------------------
-- 1. DRILL-DOWN ENTITIES & PRODUCT CATALOG
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE RESTRICT,
    UNIQUE(category_id, name)
);

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brand_id INTEGER NOT NULL,
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    -- Unit conversion: 1 Carton = X Spools
    spools_per_carton INTEGER NOT NULL CHECK (spools_per_carton > 0),
    -- Stock is strictly maintained in the base unit (Spools)
    stock_spools INTEGER NOT NULL DEFAULT 0,
    cost_price_spool REAL NOT NULL DEFAULT 0.0 CHECK (cost_price_spool >= 0),
    retail_price_spool REAL NOT NULL DEFAULT 0.0 CHECK (retail_price_spool >= 0),
    wholesale_price_carton REAL NOT NULL DEFAULT 0.0 CHECK (wholesale_price_carton >= 0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (brand_id) REFERENCES brands (id) ON DELETE RESTRICT
);

-- ---------------------------------------------------------------------
-- 2. PARTIES & DUAL-TRACKING LEDGER (CUSTOMERS & SUPPLIERS)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS parties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('CUSTOMER', 'SUPPLIER')),
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    -- Running balance: Positive = they owe us; Negative = we owe them
    current_balance REAL NOT NULL DEFAULT 0.0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- 3. INVOICING (INBOUND PURCHASES / OUTBOUND SALES)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT NOT NULL UNIQUE,
    party_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('IN', 'OUT')), -- IN = Purchase, OUT = Sale
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'COMPLETED', 'CANCELLED')),
    subtotal REAL NOT NULL DEFAULT 0.0 CHECK (subtotal >= 0),
    discount REAL NOT NULL DEFAULT 0.0 CHECK (discount >= 0),
    tax REAL NOT NULL DEFAULT 0.0 CHECK (tax >= 0),
    total_amount REAL NOT NULL DEFAULT 0.0 CHECK (total_amount >= 0),
    paid_amount REAL NOT NULL DEFAULT 0.0 CHECK (paid_amount >= 0),
    balance_due REAL NOT NULL DEFAULT 0.0,
    notes TEXT,
    committed_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (party_id) REFERENCES parties (id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    unit TEXT NOT NULL CHECK (unit IN ('CARTON', 'SPOOL')),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    spools_per_carton_snapshot INTEGER NOT NULL CHECK (spools_per_carton_snapshot > 0),
    base_quantity_spools INTEGER NOT NULL CHECK (base_quantity_spools > 0),
    unit_price REAL NOT NULL CHECK (unit_price >= 0),
    line_total REAL NOT NULL CHECK (line_total >= 0),
    FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS ledger_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    party_id INTEGER NOT NULL,
    invoice_id INTEGER,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('DEBIT', 'CREDIT')),
    amount REAL NOT NULL CHECK (amount > 0),
    balance_after REAL NOT NULL,
    description TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (party_id) REFERENCES parties (id) ON DELETE RESTRICT,
    FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------
-- 4. PERFORMANCE INDEXES
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_brands_category ON brands(category_id);
CREATE INDEX IF NOT EXISTS idx_invoices_party ON invoices(party_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_ledger_party ON ledger_entries(party_id);

-- ---------------------------------------------------------------------
-- 5. INITIAL SEEDS: CATEGORIES
-- ---------------------------------------------------------------------
INSERT OR IGNORE INTO categories (name) VALUES 
('Heavy Fabric'),
('Light Fabric'),
('Accessories'),
('Stones');