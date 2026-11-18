const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const STATE_TABLE = 'tcw_application_state';

const TABLES = {
  roles: ['id', 'code', 'name', 'description', 'permissions_json', 'created_at'],
  users: [
    'id', 'user_id', 'email', 'password_hash', 'role_id', 'role_code',
    'full_name', 'status', 'last_login_at', 'created_at', 'updated_at'
  ],
  customers: [
    'id', 'user_id', 'customer_code', 'store_name', 'contact_person', 'email',
    'phone', 'store_details', 'address', 'city', 'state', 'pincode', 'gst_number',
    'status', 'created_by', 'created_at', 'updated_at'
  ],
  employees: [
    'id', 'user_id', 'employee_code', 'full_name', 'email', 'phone', 'department',
    'designation', 'status', 'created_by', 'created_at', 'updated_at'
  ],
  categories: ['id', 'code', 'name', 'description', 'status', 'created_at', 'updated_at'],
  subcategories: [
    'id', 'category_id', 'code', 'name', 'description', 'status', 'created_at', 'updated_at'
  ],
  subcategory_groups: [
    'id', 'category_id', 'subcategory_id', 'name', 'sort_order', 'status',
    'created_at', 'updated_at'
  ],
  group_items: [
    'id', 'group_id', 'subcategory_id', 'category_id', 'value', 'sort_order',
    'status', 'created_at', 'updated_at'
  ],
  skus: ['id', 'sku_code', 'category_id', 'subcategory_id', 'created_by', 'created_at'],
  products: [
    'id', 'sku_id', 'sku_code', 'category_id', 'subcategory_id', 'name',
    'minimum_order_quantity', 'image_url', 'hsn_code', 'pack_size', 'specifications',
    'variant_attributes_json', 'mrp', 'status', 'created_at', 'updated_at'
  ],
  stock: ['id', 'product_id', 'sku_code', 'quantity', 'low_stock_threshold', 'updated_by', 'updated_at'],
  prices: ['id', 'product_id', 'sku_code', 'fp_price', 'currency', 'updated_by', 'updated_at'],
  gst: ['id', 'product_id', 'sku_code', 'gst_percentage', 'hsn_code', 'updated_by', 'updated_at'],
  orders: [
    'id', 'order_number', 'customer_id', 'customer_code', 'store_name', 'customer_gst',
    'billing_address', 'customer_phone', 'item_count', 'total_quantity', 'subtotal_amount',
    'gst_amount', 'total_amount', 'status', 'notes', 'processed_by', 'created_at', 'updated_at'
  ],
  order_items: [
    'id', 'order_id', 'product_id', 'sku_code', 'product_name', 'category_name',
    'subcategory_name', 'hsn_code', 'quantity', 'fp_price', 'subtotal',
    'gst_percentage', 'gst_amount', 'total_amount'
  ],
  notifications: [
    'id', 'recipient_role', 'type', 'title', 'message', 'order_id', 'order_number',
    'customer_name', 'item_count', 'total_amount', 'is_read', 'created_at'
  ],
  company_settings: [
    'id', 'company_name', 'tagline', 'logo_url', 'address', 'city', 'state',
    'pincode', 'gst_number', 'phone', 'email', 'website', 'bank_details',
    'order_terms', 'updated_by', 'updated_at'
  ],
  audit_logs: [
    'id', 'actor_user_id', 'actor_name', 'actor_role', 'action_type', 'entity_type',
    'entity_id', 'sku_code', 'field_changed', 'previous_value', 'new_value',
    'description', 'created_at'
  ]
};

const DELETE_ORDER = [
  'notifications', 'order_items', 'orders', 'stock', 'prices', 'gst', 'products',
  'skus', 'group_items', 'subcategory_groups', 'subcategories', 'categories',
  'customers', 'employees', 'users', 'roles', 'company_settings', 'audit_logs'
];

const INSERT_ORDER = [
  'roles', 'users', 'customers', 'employees', 'categories', 'subcategories',
  'subcategory_groups', 'group_items', 'skus', 'products', 'stock', 'prices',
  'gst', 'orders', 'order_items', 'notifications', 'company_settings', 'audit_logs'
];

function createPool(env = process.env) {
  const required = ['DB_HOST', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD'];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`Missing required MySQL environment variables: ${missing.join(', ')}`);
  }
  if (env.DB_CONNECTION && env.DB_CONNECTION.toLowerCase() !== 'mysql') {
    throw new Error('DB_CONNECTION must be mysql.');
  }
  const port = Number.parseInt(env.DB_PORT || '3306', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DB_PORT must be an integer between 1 and 65535.');
  }

  return mysql.createPool({
    host: env.DB_HOST,
    port,
    database: env.DB_DATABASE,
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: env.DB_SSL === 'false' ? undefined : {}
  });
}

async function ensureSchema(pool) {
  const schema = fs.readFileSync(path.join(__dirname, 'mysql-schema.sql'), 'utf8');
  for (const statement of schema.split(';').map((part) => part.trim()).filter(Boolean)) {
    await pool.query(statement);
  }
}

async function loadState(pool) {
  const [rows] = await pool.execute(
    `SELECT state_json FROM \`${STATE_TABLE}\` WHERE state_id = 1`
  );
  if (rows.length === 0) return null;
  try {
    return JSON.parse(rows[0].state_json);
  } catch (err) {
    throw new Error(`Stored MySQL application state is invalid JSON: ${err.message}`);
  }
}

function mysqlDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date in application state: ${value}`);
  }
  return date.toISOString().slice(0, 23).replace('T', ' ');
}

function isoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function jsonText(value, fallback) {
  return JSON.stringify(value === undefined ? fallback : value);
}

function defaultValue(value, fallback) {
  return value === undefined || value === null ? fallback : value;
}

function getRows(state, table) {
  const value = state[table];
  if (table === 'company_settings') return value ? [value] : [];
  return Array.isArray(value) ? value : [];
}

function columnsFor(table, row) {
  const date = (key) => mysqlDate(row[key]);
  const mappings = {
    roles: {
      id: row.id, code: row.code, name: row.name, description: row.description,
      permissions_json: jsonText(row.permissions, []), created_at: date('createdAt')
    },
    users: {
      id: row.id, user_id: row.userId, email: row.email, password_hash: row.passwordHash,
      role_id: row.roleId, role_code: row.roleCode, full_name: row.fullName,
      status: row.status, last_login_at: date('lastLoginAt'),
      created_at: date('createdAt'), updated_at: date('updatedAt')
    },
    customers: {
      id: row.id, user_id: row.userId, customer_code: row.customerCode,
      store_name: row.storeName, contact_person: row.contactPerson || '',
      email: row.email, phone: row.phone || '', store_details: row.storeDetails || '',
      address: row.address || '', city: row.city || '', state: row.state || '',
      pincode: row.pincode || '', gst_number: row.gstNumber || '', status: row.status,
      created_by: row.createdBy || null, created_at: date('createdAt'), updated_at: date('updatedAt')
    },
    employees: {
      id: row.id, user_id: row.userId, employee_code: row.employeeCode,
      full_name: row.fullName, email: row.email, phone: row.phone || '',
      department: row.department || '', designation: row.designation || '',
      status: row.status, created_by: row.createdBy || null,
      created_at: date('createdAt'), updated_at: date('updatedAt')
    },
    categories: {
      id: row.id, code: row.code, name: row.name, description: row.description || '',
      status: row.status, created_at: date('createdAt'), updated_at: date('updatedAt')
    },
    subcategories: {
      id: row.id, category_id: row.categoryId, code: row.code, name: row.name,
      description: row.description || '', status: row.status,
      created_at: date('createdAt'), updated_at: date('updatedAt')
    },
    subcategory_groups: {
      id: row.id, category_id: row.categoryId, subcategory_id: row.subcategoryId,
      name: row.name, sort_order: row.sortOrder || 0, status: row.status,
      created_at: date('createdAt'), updated_at: date('updatedAt')
    },
    group_items: {
      id: row.id, group_id: row.groupId, subcategory_id: row.subcategoryId,
      category_id: row.categoryId, value: row.value, sort_order: row.sortOrder || 0,
      status: row.status, created_at: date('createdAt'), updated_at: date('updatedAt')
    },
    skus: {
      id: row.id, sku_code: row.skuCode, category_id: row.categoryId,
      subcategory_id: row.subcategoryId, created_by: row.createdBy || '',
      created_at: date('createdAt')
    },
    products: {
      id: row.id, sku_id: row.skuId, sku_code: row.skuCode,
      category_id: row.categoryId, subcategory_id: row.subcategoryId, name: row.name,
      minimum_order_quantity: row.minimumOrderQuantity || 1, image_url: row.imageUrl || '',
      hsn_code: row.hsnCode || '', pack_size: row.packSize || '1 Unit',
      specifications: row.specifications || '',
      variant_attributes_json: jsonText(row.variantAttributes, {}),
      mrp: row.mrp || 0, status: row.status, created_at: date('createdAt'),
      updated_at: date('updatedAt')
    },
    stock: {
      id: row.id, product_id: row.productId, sku_code: row.skuCode,
      quantity: defaultValue(row.quantity, 0), low_stock_threshold: defaultValue(row.lowStockThreshold, 10),
      updated_by: row.updatedBy || null, updated_at: date('updatedAt')
    },
    prices: {
      id: row.id, product_id: row.productId, sku_code: row.skuCode,
      fp_price: defaultValue(row.fpPrice, 0), currency: row.currency || 'INR',
      updated_by: row.updatedBy || null, updated_at: date('updatedAt')
    },
    gst: {
      id: row.id, product_id: row.productId, sku_code: row.skuCode,
      gst_percentage: defaultValue(row.gstPercentage, 0), hsn_code: row.hsnCode || '',
      updated_by: row.updatedBy || null, updated_at: date('updatedAt')
    },
    orders: {
      id: row.id, order_number: row.orderNumber, customer_id: row.customerId,
      customer_code: row.customerCode, store_name: row.storeName,
      customer_gst: row.customerGst || '', billing_address: row.billingAddress || '',
      customer_phone: row.customerPhone || '', item_count: row.itemCount || 0,
      total_quantity: row.totalQuantity || 0, subtotal_amount: row.subtotalAmount || 0,
      gst_amount: row.gstAmount || 0, total_amount: row.totalAmount || 0,
      status: row.status, notes: row.notes || '', processed_by: row.processedBy || null,
      created_at: date('createdAt'), updated_at: date('updatedAt')
    },
    order_items: {
      id: row.id, order_id: row.orderId, product_id: row.productId,
      sku_code: row.skuCode, product_name: row.productName,
      category_name: row.categoryName || '', subcategory_name: row.subcategoryName || '',
      hsn_code: row.hsnCode || '', quantity: row.quantity,
      fp_price: row.fpPrice || 0, subtotal: row.subtotal || 0,
      gst_percentage: row.gstPercentage || 0, gst_amount: row.gstAmount || 0,
      total_amount: row.totalAmount || 0
    },
    notifications: {
      id: row.id, recipient_role: row.recipientRole || 'SUPER_ADMIN',
      type: row.type || 'NEW_ORDER', title: row.title, message: row.message,
      order_id: row.orderId || null, order_number: row.orderNumber || '',
      customer_name: row.customerName || '', item_count: row.itemCount || 0,
      total_amount: row.totalAmount || 0, is_read: row.isRead ? 1 : 0,
      created_at: date('createdAt')
    },
    company_settings: {
      id: row.id, company_name: row.companyName, tagline: row.tagline || '',
      logo_url: row.logoUrl || '', address: row.address || '', city: row.city || '',
      state: row.state || '', pincode: row.pincode || '', gst_number: row.gstNumber || '',
      phone: row.phone || '', email: row.email || '', website: row.website || '',
      bank_details: row.bankDetails || '', order_terms: row.orderTerms || '',
      updated_by: row.updatedBy || null, updated_at: date('updatedAt')
    },
    audit_logs: {
      id: row.id, actor_user_id: row.actorUserId, actor_name: row.actorName,
      actor_role: row.actorRole, action_type: row.actionType, entity_type: row.entityType,
      entity_id: row.entityId, sku_code: row.skuCode || null,
      field_changed: row.fieldChanged, previous_value: row.previousValue || '',
      new_value: row.newValue || '', description: row.description || '',
      created_at: date('createdAt')
    }
  };
  return mappings[table];
}

async function replaceNormalizedData(connection, state) {
  for (const table of DELETE_ORDER) {
    await connection.query(`DELETE FROM \`${table}\``);
  }

  for (const table of INSERT_ORDER) {
    const rows = getRows(state, table);
    if (rows.length === 0) continue;

    const columns = TABLES[table];
    const rowPlaceholders = `(${columns.map(() => '?').join(', ')})`;
    const sqlPrefix = `INSERT INTO \`${table}\` (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES `;
    for (let offset = 0; offset < rows.length; offset += 100) {
      const batch = rows.slice(offset, offset + 100);
      const values = batch.map((row) => {
        const mapped = columnsFor(table, row);
        return columns.map((column) => mapped[column] === undefined ? null : mapped[column]);
      });
      const sql = sqlPrefix + values.map(() => rowPlaceholders).join(', ');
      await connection.execute(sql, values.flat());
    }
  }
}

async function saveState(pool, state) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await replaceNormalizedData(connection, state);
    await connection.execute(
      `INSERT INTO \`${STATE_TABLE}\` (state_id, state_json)
       VALUES (1, ?)
       ON DUPLICATE KEY UPDATE state_json = VALUES(state_json)`,
      [JSON.stringify(state)]
    );
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function mergeExistingData(pool, state) {
  const nonEmptyTables = [];
  for (const table of Object.keys(TABLES)) {
    const [rows] = await pool.query(`SELECT COUNT(*) AS row_count FROM \`${table}\``);
    if (Number(rows[0].row_count) > 0) nonEmptyTables.push(table);
  }

  const supportedExistingTables = new Set(['categories', 'company_settings', 'audit_logs']);
  const unsupported = nonEmptyTables.filter((table) => !supportedExistingTables.has(table));
  if (unsupported.length) {
    throw new Error(
      `Destination contains existing rows in tables that cannot be safely merged: ${unsupported.join(', ')}.`
    );
  }

  const [existingCategories] = await pool.query(
    'SELECT id, code, name, description, status, created_at, updated_at FROM categories'
  );
  const categoriesById = new Map(state.categories.map((row) => [row.id, row]));
  existingCategories.forEach((row) => {
    categoriesById.set(row.id, {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      status: row.status,
      createdAt: isoDate(row.created_at),
      updatedAt: isoDate(row.updated_at)
    });
  });
  state.categories = Array.from(categoriesById.values());

  const [existingSettings] = await pool.query('SELECT * FROM company_settings');
  if (existingSettings.length > 1) {
    throw new Error('Destination has multiple company settings rows; refusing to discard any.');
  }
  if (existingSettings.length === 1) {
    const row = existingSettings[0];
    state.company_settings = {
      id: row.id,
      companyName: row.company_name,
      tagline: row.tagline,
      logoUrl: row.logo_url,
      address: row.address,
      city: row.city,
      state: row.state,
      pincode: row.pincode,
      gstNumber: row.gst_number,
      phone: row.phone,
      email: row.email,
      website: row.website,
      bankDetails: row.bank_details,
      orderTerms: row.order_terms,
      updatedBy: row.updated_by,
      updatedAt: isoDate(row.updated_at)
    };
  }

  const [existingAuditLogs] = await pool.query('SELECT * FROM audit_logs');
  const logsById = new Map(state.audit_logs.map((row) => [row.id, row]));
  existingAuditLogs.forEach((row) => {
    logsById.set(row.id, {
      id: row.id,
      actorUserId: row.actor_user_id,
      actorName: row.actor_name,
      actorRole: row.actor_role,
      actionType: row.action_type,
      entityType: row.entity_type,
      entityId: row.entity_id,
      skuCode: row.sku_code,
      fieldChanged: row.field_changed,
      previousValue: row.previous_value,
      newValue: row.new_value,
      description: row.description,
      createdAt: isoDate(row.created_at)
    });
  });
  state.audit_logs = Array.from(logsById.values())
    .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))
    .slice(0, 100);
}

async function importLegacyFile(pool, filePath) {
  const state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (
    !state ||
    !state.meta ||
    state.meta.schemaVersion !== '2.0.0-clean' ||
    !Array.isArray(state.products) ||
    !Array.isArray(state.users)
  ) {
    throw new Error('Legacy database file does not contain a valid application state.');
  }
  const existing = await loadState(pool);
  if (existing) return false;
  await mergeExistingData(pool, state);
  await saveState(pool, state);
  return true;
}

module.exports = {
  createPool,
  ensureSchema,
  loadState,
  saveState,
  importLegacyFile
};
