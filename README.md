# Cycle World (TCW B2B) — Wholesale Bicycle & Tricycle Spare Parts Ordering System

A complete, role-isolated B2B wholesale e-commerce and order processing system built for **Cycle World** to serve **90+ authorized partner stores**.

---

## Quick Start (Windows or Node.js)

1. Install Node.js 18 or newer and MySQL access for the configured database.
2. Copy `.env.example` to `.env` and set the MySQL connection values. Do not commit `.env`; database TLS is enabled by default.
3. Install dependencies with `npm install`.
4. If you need to keep existing records, run `npm run migrate:legacy` before first use. It does not replace an existing state snapshot; it preserves existing categories and company settings and merges audit logs within the app's 100-entry limit. If other tables already contain data without a state snapshot, it stops rather than replacing those rows.
5. Start with `npm start` or use [`Start-CycleWorld-B2B.bat`](./Start-CycleWorld-B2B.bat). Open the URL printed by the launcher (by default `http://localhost:8090/`).

Application data is synchronized to the MySQL tables in [`database/mysql-schema.sql`](./database/mysql-schema.sql), in the same transaction as the `tcw_application_state` snapshot used by the current client API. Application changes are not written to JSON files or browser local storage. Existing `database/cycleworld_db.json` files are only used by the one-time import command and are not served over HTTP. After verifying the import, remove the legacy JSON and preloaded snapshot from the deployed project.

## Deploy on Hostinger hPanel (Linux Node.js)

1. In hPanel, create a **Node.js Web App** and select Node.js 18 or newer.
2. Set the application root to the project directory and the startup file to `server.js`. Install dependencies with `npm install`.
3. Add `DB_CONNECTION`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, and `DB_PASSWORD` to the hPanel environment settings. Keep `DB_SSL=true` unless your provider explicitly requires a different TLS configuration. Never put production passwords in source files or commit `.env`.
4. If migrating existing data, run `npm run migrate:legacy` once while the old JSON file is available and before anyone opens the new app. The command will not overwrite MySQL state that already exists.
5. Start/restart the application, connect your domain, and enable its SSL certificate. Confirm `/api/health` returns `{"status":"ok",...}`.

The Windows launchers now run the same Node.js/MySQL server. Directly opening an HTML file is not supported for persistent changes.

**Security limitation:** `/api/db` currently returns the full application state and `/api/sync-db` accepts a complete state update without server-side user authentication/authorization. Moving storage to MySQL protects the state file from being served, but does not fix that API access-control issue. Do not expose this version publicly with real customer data until server-side API authentication and role-level authorization are implemented.

---

## 🔐 Three Separate Access Portals & Default Credentials

### 1. Super Admin Portal (`SUPER_ADMIN`)
- **Admin / User ID:** `CW-ADMIN`
- **Password:** `Admin@123`
- **Permissions:** Full master control — manual SKU assignment, Product Master CRUD, Excel/PDF bulk upload with validation preview, unlimited Category/Subcategory creation, 90+ Customer Store credential provisioning, Employee/Billing account creation, Live Stock & FP Price updates, Company & GST settings, Order status management, Real-time Order Notifications, and Immutable Security Audit Logs.

### 2. Employee / Billing User Portal (`BILLING_EMPLOYEE`)
- **Employee User ID:** `CW-BILL-01` (or `CW-BILL-02`)
- **Password:** `Billing@123`
- **Permissions:** Restricted Order & GST Billing access only — view incoming store orders, inspect customer GST & billing details, update order billing stage (`Confirmed`, `Processing`, `Ready for Billing`, `Completed`), print A4 GST Order/Billing Sheets, and export order CSVs for ERP/Tally. Strictly blocked from editing products, prices, SKUs, stock, or categories.

### 3. Customer / Store Portal (`CUSTOMER`)
- **Store #001 (Indiranagar):** `CW-STR-001` / Password: `Store@123`
- **Store #002 (Jayanagar):** `CW-STR-002` / Password: `Store@123`
- **Store #003 (Anna Nagar, Chennai):** `CW-STR-003` / Password: `Store@123`
- *(Up to 90 stores `CW-STR-001` through `CW-STR-090` can be provisioned in 1 click from the Super Admin Customers tab)*
- **Permissions:** Strictly isolated per store — browse live-stock catalog (zero-stock and inactive items are automatically hidden; exact stock count is never exposed), search/sort alphabetically, add to cart with live stock cap validation, view automatic GST calculation, confirm & submit orders, and view/print own store orders only.

---

## Application Data Model

The browser engine keeps these logical collections; the Node.js server stores them in MySQL tables and keeps a snapshot row for compatibility with the current API. The older [`database/schema.sql`](./database/schema.sql) is a SQLite-oriented schema draft; the MySQL schema is in [`database/mysql-schema.sql`](./database/mysql-schema.sql).

1. `roles` — Role definitions & permission matrices
2. `users` — Authentication principals with salted SHA-256 password hashes
3. `customers` — Isolated B2B Store accounts (scalable to 90+ stores)
4. `employees` — Billing & Order Processing staff profiles
5. `categories` — Dynamic top-level categories (sorted A–Z)
6. `subcategories` — Dynamic subcategories under each category (sorted A–Z)
7. `skus` — Manual unique SKU registry (blocks duplicates; never auto-generated)
8. `products` — Product Master records
9. `stock` — Live inventory quantities & low-stock thresholds
10. `prices` — Franchisee / Wholesale (`FP`) prices
11. `gst` — Product GST percentages & HSN codes
12. `orders` — Wholesale order headers (`CW-000124`, etc.)
13. `order_items` — Line items with snapshot FP price, subtotal, GST %, GST amount, and total
14. `notifications` — Real-time in-system alerts for Super Admin on order submission
15. `company_settings` — Cycle World logo, GSTIN, address, phone, email, and billing terms
16. `audit_logs` — Immutable security trail recording Actor, Field, Previous Value, New Value, and Timestamp
