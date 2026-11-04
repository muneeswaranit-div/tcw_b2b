# Cycle World (TCW B2B) — Wholesale Bicycle & Tricycle Spare Parts Ordering System

A complete, role-isolated B2B wholesale e-commerce and order processing system built for **Cycle World** to serve **90+ authorized partner stores**.

---

## Quick Start (Windows or Node.js)

1. **Local browser**: Open `index.html` directly for a non-persistent/offline preview.
2. **Local Windows server**: Use [`Start-CycleWorld-B2B.bat`](./Start-CycleWorld-B2B.bat) to start the Windows server ([`server.ps1`](./server.ps1)) on `http://localhost:8080`.
3. **Node.js server**: Run `npm start` to serve the site and persist data to `database/cycleworld_db.json` (or set `DATABASE_FILE` to a writable file path).

## Deploy on Hostinger hPanel (Linux Node.js)

**Before using real customer data:** the current `/api/db` and `/api/sync-db` endpoints do not require authentication. Do not expose this version publicly with sensitive business data until server-side authentication and authorization have been added.

1. In hPanel, create a **Node.js Web App** and select Node.js 18 or newer.
2. Upload the project files so `server.js`, `package.json`, `index.html`, `js/`, `css/`, `IMAGES/`, and `database/` are in the application root. Keep the existing directory and filename capitalization exactly as-is; Linux paths are case-sensitive.
3. Set the application root to that directory and the startup file to `server.js`. Install dependencies from the hPanel Node.js app page (this project currently has no external npm dependencies), then start/restart the application. The server listens on Hostinger's `PORT` environment variable and binds to `0.0.0.0`.
4. Ensure the application can write to `database/cycleworld_db.json`. For deployments where application files may be replaced during updates, set the hPanel environment variable `DATABASE_FILE` to an absolute path in a persistent, writable directory in your hosting account; the server creates the parent directory when saving.
5. Connect your domain to the Node.js app in hPanel and enable its SSL certificate. After startup, open `/api/health` on your domain and confirm it returns `{"status":"ok",...}`.

The Windows `.bat`, `.ps1`, and `.vbs` launchers are only for running the project on Windows; hPanel starts the Node.js application directly. Back up the configured database file regularly.

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

## 🗄️ Normalized 16-Table Relational Database Structure

Defined in [`database/schema.sql`](./database/schema.sql) and enforced by [`js/database-engine.js`](./js/database-engine.js):

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
