-- =============================================================================
-- CYCLE WORLD (TCW B2B) - RELATIONAL DATABASE SCHEMA
-- Designed for 90+ Wholesale Bicycle & Tricycle Stores, Thousands of SKUs,
-- Strict Role-Based Access Control (RBAC), GST Compliance & Auditability.
-- =============================================================================

PRAGMA foreign_keys = ON;

-- 1. ROLES TABLE
CREATE TABLE IF NOT EXISTS roles (
    id VARCHAR(36) PRIMARY KEY,
    code VARCHAR(32) NOT NULL UNIQUE, -- 'SUPER_ADMIN', 'BILLING_EMPLOYEE', 'CUSTOMER'
    name VARCHAR(100) NOT NULL,
    description TEXT,
    permissions_json TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. USERS TABLE (Authentication & Session Principal)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL UNIQUE,       -- Login ID provided by Super Admin
    email VARCHAR(150) UNIQUE,                 -- Login Email provided by Super Admin
    password_hash VARCHAR(256) NOT NULL,       -- SHA-256 / bcrypt password hash
    role_id VARCHAR(36) NOT NULL,
    role_code VARCHAR(32) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Active', -- 'Active' | 'Inactive'
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES roles(id)
);

-- 3. CUSTOMERS / STORES TABLE (Isolated B2B Store Accounts - 90+ Stores)
CREATE TABLE IF NOT EXISTS customers (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL UNIQUE,       -- References users.id
    customer_code VARCHAR(64) NOT NULL UNIQUE, -- Unique Customer Login ID (e.g. CW-STR-001)
    store_name VARCHAR(200) NOT NULL,
    contact_person VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    phone VARCHAR(30) NOT NULL,
    store_details TEXT,
    address TEXT NOT NULL,
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(20),
    gst_number VARCHAR(30),
    status VARCHAR(20) NOT NULL DEFAULT 'Active', -- 'Active' | 'Inactive'
    created_by VARCHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 4. EMPLOYEES / BILLING USERS TABLE
CREATE TABLE IF NOT EXISTS employees (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL UNIQUE,       -- References users.id
    employee_code VARCHAR(64) NOT NULL UNIQUE, -- Unique Employee Login ID (e.g. CW-BILL-01)
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    phone VARCHAR(30),
    department VARCHAR(100) DEFAULT 'Billing & Order Processing',
    designation VARCHAR(100) DEFAULT 'Billing Executive',
    status VARCHAR(20) NOT NULL DEFAULT 'Active', -- 'Active' | 'Inactive'
    created_by VARCHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 5. CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS categories (
    id VARCHAR(36) PRIMARY KEY,
    code VARCHAR(32) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL UNIQUE,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'Active', -- 'Active' | 'Inactive'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. SUBCATEGORIES TABLE
CREATE TABLE IF NOT EXISTS subcategories (
    id VARCHAR(36) PRIMARY KEY,
    category_id VARCHAR(36) NOT NULL,
    code VARCHAR(32) NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'Active', -- 'Active' | 'Inactive'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category_id, name),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
);

-- 7. SKUS TABLE (Manual Unique SKU Registry - Never Auto-Generated)
CREATE TABLE IF NOT EXISTS skus (
    id VARCHAR(36) PRIMARY KEY,
    sku_code VARCHAR(64) NOT NULL UNIQUE,      -- Manually assigned unique SKU
    category_id VARCHAR(36) NOT NULL,
    subcategory_id VARCHAR(36) NOT NULL,
    created_by VARCHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (subcategory_id) REFERENCES subcategories(id)
);

-- 8. PRODUCTS TABLE (Product Master)
CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(36) PRIMARY KEY,
    sku_id VARCHAR(36) NOT NULL UNIQUE,
    sku_code VARCHAR(64) NOT NULL UNIQUE,
    category_id VARCHAR(36) NOT NULL,
    subcategory_id VARCHAR(36) NOT NULL,
    name VARCHAR(250) NOT NULL,
    image_url TEXT,
    hsn_code VARCHAR(30),
    pack_size VARCHAR(60) DEFAULT '1 Unit',
    specifications TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'Active', -- 'Active' | 'Inactive' | 'Out of Stock'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sku_id) REFERENCES skus(id),
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (subcategory_id) REFERENCES subcategories(id)
);

-- 9. STOCK TABLE (Live Inventory Tracking)
CREATE TABLE IF NOT EXISTS stock (
    id VARCHAR(36) PRIMARY KEY,
    product_id VARCHAR(36) NOT NULL UNIQUE,
    sku_code VARCHAR(64) NOT NULL UNIQUE,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    low_stock_threshold INTEGER NOT NULL DEFAULT 10,
    updated_by VARCHAR(36),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- 10. PRICES TABLE (Wholesale / FP Price Master)
CREATE TABLE IF NOT EXISTS prices (
    id VARCHAR(36) PRIMARY KEY,
    product_id VARCHAR(36) NOT NULL UNIQUE,
    sku_code VARCHAR(64) NOT NULL UNIQUE,
    fp_price DECIMAL(12, 2) NOT NULL CHECK (fp_price >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    updated_by VARCHAR(36),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- 11. GST TABLE (Product Tax Configuration)
CREATE TABLE IF NOT EXISTS gst (
    id VARCHAR(36) PRIMARY KEY,
    product_id VARCHAR(36) NOT NULL UNIQUE,
    sku_code VARCHAR(64) NOT NULL UNIQUE,
    gst_percentage DECIMAL(5, 2) NOT NULL DEFAULT 12.00 CHECK (gst_percentage >= 0),
    hsn_code VARCHAR(30),
    updated_by VARCHAR(36),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- 12. ORDERS TABLE
CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(36) PRIMARY KEY,
    order_number VARCHAR(50) NOT NULL UNIQUE,  -- e.g., CW-000123
    customer_id VARCHAR(36) NOT NULL,
    customer_code VARCHAR(64) NOT NULL,
    store_name VARCHAR(200) NOT NULL,
    customer_gst VARCHAR(30),
    billing_address TEXT NOT NULL,
    customer_phone VARCHAR(30),
    item_count INTEGER NOT NULL,
    total_quantity INTEGER NOT NULL,
    subtotal_amount DECIMAL(14, 2) NOT NULL,
    gst_amount DECIMAL(14, 2) NOT NULL,
    total_amount DECIMAL(14, 2) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'New', -- 'New', 'Confirmed', 'Processing', 'Ready for Billing', 'Completed', 'Cancelled'
    notes TEXT,
    processed_by VARCHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- 13. ORDER ITEMS TABLE
CREATE TABLE IF NOT EXISTS order_items (
    id VARCHAR(36) PRIMARY KEY,
    order_id VARCHAR(36) NOT NULL,
    product_id VARCHAR(36) NOT NULL,
    sku_code VARCHAR(64) NOT NULL,
    product_name VARCHAR(250) NOT NULL,
    category_name VARCHAR(150),
    subcategory_name VARCHAR(150),
    hsn_code VARCHAR(30),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    fp_price DECIMAL(12, 2) NOT NULL,
    subtotal DECIMAL(14, 2) NOT NULL,
    gst_percentage DECIMAL(5, 2) NOT NULL,
    gst_amount DECIMAL(14, 2) NOT NULL,
    total_amount DECIMAL(14, 2) NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- 14. NOTIFICATIONS TABLE (In-System Real-Time Alerts for Super Admin)
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(36) PRIMARY KEY,
    recipient_role VARCHAR(32) NOT NULL DEFAULT 'SUPER_ADMIN',
    type VARCHAR(50) NOT NULL DEFAULT 'NEW_ORDER',
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    order_id VARCHAR(36),
    order_number VARCHAR(50),
    customer_name VARCHAR(200),
    item_count INTEGER,
    total_amount DECIMAL(14, 2),
    is_read BOOLEAN NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
);

-- 15. COMPANY SETTINGS TABLE
CREATE TABLE IF NOT EXISTS company_settings (
    id VARCHAR(36) PRIMARY KEY,
    company_name VARCHAR(200) NOT NULL,
    tagline VARCHAR(250),
    logo_url TEXT,
    address TEXT NOT NULL,
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(20),
    gst_number VARCHAR(30) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(150) NOT NULL,
    website VARCHAR(150),
    bank_details TEXT,
    order_terms TEXT,
    updated_by VARCHAR(36),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 16. AUDIT LOGS TABLE (Immutable Trail of Admin Changes)
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    actor_user_id VARCHAR(64) NOT NULL,
    actor_name VARCHAR(150) NOT NULL,
    actor_role VARCHAR(32) NOT NULL,
    action_type VARCHAR(60) NOT NULL,          -- e.g., 'UPDATE_PRICE', 'UPDATE_STOCK', 'CREATE_SKU', 'EXCEL_IMPORT'
    entity_type VARCHAR(60) NOT NULL,          -- e.g., 'PRODUCT', 'CATEGORY', 'CUSTOMER', 'COMPANY_SETTINGS'
    entity_id VARCHAR(64) NOT NULL,
    sku_code VARCHAR(64),
    field_changed VARCHAR(100) NOT NULL,
    previous_value TEXT,
    new_value TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- INDEXES FOR HIGH-PERFORMANCE B2B QUERIES
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku_code);
CREATE INDEX IF NOT EXISTS idx_products_cat_sub ON products(category_id, subcategory_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_sku ON audit_logs(sku_code);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
