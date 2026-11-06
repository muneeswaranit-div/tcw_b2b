/**
 * ============================================================================
 * CYCLE WORLD (TCW B2B) - RELATIONAL DATABASE & RBAC SECURITY ENGINE
 * ============================================================================
 * Clean Initial Database Setup (Zero Demo/Test Business Data):
 *  - Starts with 0 Categories, 0 Subcategories, 0 Products, 0 SKUs,
 *    0 Customer Accounts, 0 Employees, and 0 Orders.
 *  - Super Admin creates all Categories, Subcategories, Products, Manual SKUs,
 *    and Customer Login Credentials from scratch.
 *
 * Implements the 16 normalized relational tables:
 *  1. roles              9. stock
 *  2. users             10. prices
 *  3. customers         11. gst
 *  4. employees         12. orders
 *  5. categories        13. order_items
 *  6. subcategories     14. notifications
 *  7. skus              15. company_settings
 *  8. products          16. audit_logs
 * ============================================================================
 */

(function (global) {
  'use strict';

  const DB_STORAGE_KEY = 'TCW_B2B_CLEAN_DB_V2';
  const SESSION_STORAGE_KEY = 'TCW_B2B_ACTIVE_SESSION_V2';
  const SYNC_CHANNEL_NAME = 'tcw_b2b_realtime_channel_v2';
  const PASSWORD_SALT = 'TCW_CYCLEWORLD_B2B_SALT_2026::';

  // Purge legacy demo storage keys so browser starts 100% clean
  try {
    localStorage.removeItem('TCW_B2B_RELATIONAL_DB_V1');
    localStorage.removeItem('TCW_B2B_ACTIVE_SESSION_V1');
    localStorage.removeItem('TCW_B2B_ACTIVE_SESSION_V1_CUSTOMER');
    localStorage.removeItem('TCW_B2B_ACTIVE_SESSION_V1_SUPER_ADMIN');
    localStorage.removeItem('TCW_B2B_ACTIVE_SESSION_V1_BILLING_EMPLOYEE');
    sessionStorage.removeItem('TCW_B2B_ACTIVE_SESSION_V1');
    sessionStorage.removeItem('TCW_B2B_ACTIVE_SESSION_V1_CUSTOMER');
  } catch (e) {}

  // Synchronous deterministic SHA-256 implementation for password hashing
  function sha256Hash(asciiInput) {
    const str = unescape(encodeURIComponent(PASSWORD_SALT + String(asciiInput)));
    function rightRotate(value, amount) {
      return (value >>> amount) | (value << (32 - amount));
    }
    const mathPow = Math.pow;
    const maxWord = mathPow(2, 32);
    const lengthProperty = 'length';
    let i, j;
    let result = '';
    const words = [];
    const asciiBitLength = str[lengthProperty] * 8;
    let hash = (sha256Hash.h = sha256Hash.h || []);
    const k = (sha256Hash.k = sha256Hash.k || []);
    let primeCounter = k[lengthProperty];
    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (i = 0; i < 313; i += candidate) {
          isComposite[i] = candidate;
        }
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    let padded = str + '\x80';
    while ((padded[lengthProperty] % 64) - 56) padded += '\x00';
    for (i = 0; i < padded[lengthProperty]; i++) {
      j = padded.charCodeAt(i);
      if (j >> 8) return '';
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
    words[words[lengthProperty]] = asciiBitLength;
    let w = [];
    let h = hash.slice(0, 8);
    for (j = 0; j < words[lengthProperty]; ) {
      const oldHash = h.slice(0);
      w = words.slice(j, (j += 16));
      for (i = 0; i < 64; i++) {
        const w15 = w[i - 15],
          w2 = w[i - 2];
        const a = h[0],
          e = h[4];
        const temp1 =
          h[7] +
          (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
          ((e & h[5]) ^ (~e & h[6])) +
          k[i] +
          (w[i] =
            i < 16
              ? w[i]
              : (w[i - 16] +
                  (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                  w[i - 7] +
                  (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
                0);
        const temp2 =
          (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
          ((a & h[1]) ^ (a & h[2]) ^ (h[1] & h[2]));
        h = [(temp1 + temp2) | 0].concat(h);
        h[4] = (h[4] + temp1) | 0;
        h.pop();
      }
      for (i = 0; i < 8; i++) {
        h[i] = (h[i] + oldHash[i]) | 0;
      }
    }
    for (i = 0; i < 8; i++) {
      for (j = 3; j + 1; j--) {
        const b = (h[i] >> (j * 8)) & 255;
        result += (b < 16 ? 0 : '') + b.toString(16);
      }
    }
    return 'sha256$' + result;
  }

  // Generate clean bicycle technical SVG product illustration data URLs
  function createPartSvgDataUri(type, code, accentColor) {
    const color = accentColor || '#16a34a';
    let iconMarkup = '';
    switch (type) {
      case 'bell':
        iconMarkup = `
          <path d="M50 32 C34 32 24 44 24 58 L76 58 C76 44 66 32 50 32 Z" fill="${color}" opacity="0.18" stroke="${color}" stroke-width="3"/>
          <rect x="20" y="58" width="60" height="6" rx="3" fill="${color}"/>
          <circle cx="50" cy="27" r="4" fill="${color}"/>
          <path d="M44 64 C44 70 56 70 56 64" stroke="#1e3a2f" stroke-width="3" fill="none"/>
          <path d="M76 50 L86 45 L88 50 L77 55 Z" fill="#1e3a2f"/>
          <circle cx="50" cy="76" r="8" stroke="#4b6858" stroke-width="2.5" fill="none"/>
        `;
        break;
      case 'lock':
        iconMarkup = `
          <path d="M35 46 L35 33 C35 23 65 23 65 33 L65 46" stroke="#1e3a2f" stroke-width="6" stroke-linecap="round" fill="none"/>
          <rect x="27" y="45" width="46" height="34" rx="7" fill="${color}" opacity="0.18" stroke="${color}" stroke-width="3"/>
          <circle cx="50" cy="59" r="4.5" fill="${color}"/>
          <path d="M50 63 L50 71" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
        `;
        break;
      case 'mudguard':
        iconMarkup = `
          <path d="M18 68 A36 36 0 0 1 82 68" stroke="${color}" stroke-width="6" stroke-linecap="round" fill="none"/>
          <path d="M23 68 A31 31 0 0 1 77 68" stroke="#7c9a89" stroke-width="2" stroke-dasharray="4 3" fill="none"/>
          <line x1="50" y1="68" x2="30" y2="42" stroke="#1e3a2f" stroke-width="2.5"/>
          <line x1="50" y1="68" x2="70" y2="42" stroke="#1e3a2f" stroke-width="2.5"/>
          <circle cx="50" cy="68" r="5" fill="${color}"/>
        `;
        break;
      case 'rnd':
        iconMarkup = `
          <circle cx="50" cy="52" r="24" stroke="${color}" stroke-width="3" stroke-dasharray="6 3" fill="${color}" fill-opacity="0.1"/>
          <circle cx="50" cy="52" r="10" stroke="#1e3a2f" stroke-width="3" fill="none"/>
          <path d="M50 22 L50 32 M50 72 L50 82 M20 52 L30 52 M70 52 L80 52" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
          <circle cx="50" cy="52" r="3" fill="${color}"/>
        `;
        break;
      case 'chain':
        iconMarkup = `
          <circle cx="33" cy="54" r="16" stroke="${color}" stroke-width="3.5" fill="${color}" fill-opacity="0.12"/>
          <circle cx="69" cy="54" r="10" stroke="#1e3a2f" stroke-width="3.5" fill="none"/>
          <line x1="33" y1="38" x2="69" y2="44" stroke="#4b6858" stroke-width="3" stroke-dasharray="4 2"/>
          <line x1="33" y1="70" x2="69" y2="64" stroke="#4b6858" stroke-width="3" stroke-dasharray="4 2"/>
          <circle cx="33" cy="54" r="5" fill="${color}"/>
          <circle cx="69" cy="54" r="3.5" fill="#1e3a2f"/>
        `;
        break;
      case 'brake':
        iconMarkup = `
          <circle cx="50" cy="54" r="24" stroke="#4b6858" stroke-width="3" fill="none"/>
          <circle cx="50" cy="54" r="17" stroke="#7c9a89" stroke-width="1.5" stroke-dasharray="4 4" fill="none"/>
          <path d="M58 26 L75 36 L68 50 L54 42 Z" fill="${color}" opacity="0.85"/>
          <circle cx="50" cy="54" r="6" stroke="${color}" stroke-width="3" fill="#fff"/>
        `;
        break;
      case 'wheel':
        iconMarkup = `
          <circle cx="50" cy="52" r="26" stroke="#0f291e" stroke-width="4.5" fill="none"/>
          <circle cx="50" cy="52" r="21" stroke="${color}" stroke-width="2" fill="none"/>
          <line x1="50" y1="26" x2="50" y2="78" stroke="#7c9a89" stroke-width="1.5"/>
          <line x1="24" y1="52" x2="76" y2="52" stroke="#7c9a89" stroke-width="1.5"/>
          <line x1="32" y1="34" x2="68" y2="70" stroke="#7c9a89" stroke-width="1.5"/>
          <line x1="68" y1="34" x2="32" y2="70" stroke="#7c9a89" stroke-width="1.5"/>
          <circle cx="50" cy="52" r="5" fill="${color}"/>
        `;
        break;
      case 'tricycle':
        iconMarkup = `
          <circle cx="26" cy="64" r="11" stroke="#1e3a2f" stroke-width="3" fill="none"/>
          <circle cx="72" cy="64" r="11" stroke="${color}" stroke-width="3" fill="none"/>
          <circle cx="62" cy="60" r="9" stroke="#4b6858" stroke-width="2" stroke-dasharray="3 2" fill="none"/>
          <path d="M26 64 L36 38 L58 52 L72 64 M36 44 L58 44 L58 60" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <rect x="54" y="34" width="22" height="14" rx="2" fill="${color}" opacity="0.2" stroke="${color}" stroke-width="2"/>
        `;
        break;
      default:
        iconMarkup = `
          <circle cx="34" cy="58" r="12" stroke="${color}" stroke-width="2.8" fill="none"/>
          <circle cx="66" cy="58" r="12" stroke="${color}" stroke-width="2.8" fill="none"/>
          <path d="M34 58 L46 38 L62 38 L50 58 Z" stroke="#1e3a2f" stroke-width="2.5" stroke-linejoin="round" fill="none"/>
          <path d="M58 33 L66 58" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
        `;
    }

    const safeLabel = String(code || 'PART').slice(0, 10);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="200" height="200">
      <rect width="100" height="100" rx="12" fill="#f3faf5"/>
      <circle cx="88" cy="12" r="24" fill="${color}" opacity="0.06"/>
      <circle cx="12" cy="88" r="20" fill="#15803d" opacity="0.05"/>
      ${iconMarkup}
      <rect x="8" y="8" width="46" height="13" rx="4" fill="#0f291e" opacity="0.88"/>
      <text x="31" y="17" font-family="monospace" font-size="7.2" font-weight="bold" fill="#ffffff" text-anchor="middle">${safeLabel}</text>
    </svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  // Generate default Cycle World Official Logo Data URI (Green & Forest Slate Theme)
  function createCycleWorldLogoDataUri() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 64" width="260" height="64">
      <defs>
        <linearGradient id="cwGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#16a34a"/>
          <stop offset="100%" stop-color="#0f291e"/>
        </linearGradient>
      </defs>
      <rect x="2" y="4" width="56" height="56" rx="14" fill="url(#cwGrad)"/>
      <!-- Bicycle Sprocket & Frame Emblem -->
      <circle cx="19" cy="40" r="9" stroke="#86efac" stroke-width="2.5" fill="none"/>
      <circle cx="41" cy="40" r="9" stroke="#ffffff" stroke-width="2.5" fill="none"/>
      <path d="M19 40 L27 24 L39 24 L30 40 L19 40 Z" stroke="#ffffff" stroke-width="2.2" stroke-linejoin="round" fill="none"/>
      <path d="M35 20 L41 40" stroke="#86efac" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="24" y1="24" x2="30" y2="24" stroke="#fde047" stroke-width="2.5" stroke-linecap="round"/>
      <!-- Brand Typography -->
      <text x="68" y="31" font-family="'Segoe UI', Inter, system-ui, sans-serif" font-size="22" font-weight="800" fill="#0f291e" letter-spacing="-0.5">CYCLE WORLD</text>
      <rect x="68" y="38" width="54" height="16" rx="4" fill="#16a34a"/>
      <text x="95" y="49" font-family="monospace" font-size="9.5" font-weight="700" fill="#ffffff" text-anchor="middle">TCW B2B</text>
      <text x="128" y="49" font-family="'Segoe UI', Inter, system-ui, sans-serif" font-size="10.5" font-weight="600" fill="#1e3a2f" letter-spacing="0.8">WHOLESALE SPARES</text>
    </svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  // Build completely CLEAN initial database (Zero demo/test business data)
  function buildInitialDatabase() {
    const now = new Date().toISOString();

    // 1. ROLES TABLE (System Access Roles Only)
    const roles = [
      {
        id: 'role-super-admin',
        code: 'SUPER_ADMIN',
        name: 'Super Administrator',
        description: 'Full master control over Cycle World B2B platform, products, SKUs, stock, pricing, GST, stores, employees, and settings.',
        permissions: ['*'],
        createdAt: now
      },
      {
        id: 'role-billing-emp',
        code: 'BILLING_EMPLOYEE',
        name: 'Employee / Billing User',
        description: 'Restricted access to view incoming orders, view customer billing details, update order billing stage, and print/download order sheets.',
        permissions: [
          'ORDERS_VIEW',
          'ORDERS_PROCESS_STATUS',
          'ORDERS_PRINT_DOWNLOAD',
          'CUSTOMERS_BILLING_VIEW'
        ],
        createdAt: now
      },
      {
        id: 'role-customer-store',
        code: 'CUSTOMER',
        name: 'Customer / Store Partner',
        description: 'Isolated B2B store access to browse available live-stock catalog, manage cart, view GST calculations, and submit wholesale orders.',
        permissions: [
          'CATALOG_VIEW_AVAILABLE',
          'CART_MANAGE',
          'ORDER_SUBMIT',
          'OWN_ORDERS_VIEW',
          'OWN_PROFILE_VIEW'
        ],
        createdAt: now
      }
    ];

    // 2. USERS TABLE (Only Super Admin Master Account exists initially)
    const users = [
      {
        id: 'usr-admin-01',
        userId: 'CW-ADMIN',
        email: 'admin@cycleworldb2b.in',
        passwordHash: sha256Hash('Admin@123'),
        roleId: 'role-super-admin',
        roleCode: 'SUPER_ADMIN',
        fullName: 'Cycle World Super Admin',
        status: 'Active',
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now
      }
    ];

    // 3–18: All business tables start 100% empty so Super Admin creates everything from scratch
    const customers = [];
    const employees = [];
    const categories = [];
    const subcategories = [];
    const subcategory_groups = [];
    const group_items = [];
    const skus = [];
    const products = [];
    const stock = [];
    const prices = [];
    const gst = [];
    const orders = [];
    const order_items = [];
    const notifications = [];
    const audit_logs = [];

    // 15. COMPANY SETTINGS TABLE
    const company_settings = {
      id: 'comp-tcw-01',
      companyName: 'Cycle World',
      tagline: 'B2B Wholesale Bicycle Spare Parts & Accessories Portal',
      logoUrl: createCycleWorldLogoDataUri(),
      address: 'Cycle World Head Office & Central Warehouse',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001',
      gstNumber: '29AAACC9090D1Z8',
      phone: '+91 80 4123 9900',
      email: 'wholesale@cycleworldb2b.in',
      website: 'www.cycleworldb2b.in',
      bankDetails: 'Cycle World Wholesale Account',
      orderTerms: '1. All wholesale orders are billed at FP Price + applicable GST.\n2. Subject to live stock availability at the time of order submission.',
      updatedBy: 'CW-ADMIN',
      updatedAt: now
    };

    return {
      meta: {
        schemaVersion: '2.0.0-clean',
        lastOrderSeq: 100,
        updatedAt: now
      },
      roles,
      users,
      customers,
      employees,
      categories,
      subcategories,
      subcategory_groups,
      group_items,
      skus,
      products,
      stock,
      prices,
      gst,
      orders,
      order_items,
      notifications,
      company_settings,
      audit_logs
    };
  }

  // ============================================================================
  // DATABASE INSTANCE & REAL-TIME SYNC
  // ============================================================================
  let dbState = null;
  let syncChannel = null;
  const changeListeners = [];

  function normalizeDatabaseImages(db) {
    if (!db || !Array.isArray(db.products)) return db;
    db.products.forEach((p) => {
      if (p && (!Number.isInteger(p.minimumOrderQuantity) || p.minimumOrderQuantity < 1)) {
        p.minimumOrderQuantity = 1;
      }
      if (p && typeof p.imageUrl === 'string' && p.imageUrl.startsWith('data:image/svg+xml')) {
        p.imageUrl = '';
      }
    });
    if (Array.isArray(db.audit_logs) && db.audit_logs.length > 100) {
      db.audit_logs = db.audit_logs.slice(0, 100);
    }
    if (!Array.isArray(db.subcategory_groups)) db.subcategory_groups = [];
    if (!Array.isArray(db.group_items)) db.group_items = [];
    return db;
  }

  function countCustomImages(db) {
    if (!db || !Array.isArray(db.products)) return 0;
    return db.products.filter(
      (p) => p && p.imageUrl && !String(p.imageUrl).startsWith('data:image/svg+xml')
    ).length;
  }

  function mergeServerCompressedImages(targetDb, serverDb) {
    if (!targetDb || !serverDb || !Array.isArray(targetDb.products) || !Array.isArray(serverDb.products)) {
      return targetDb;
    }
    const serverById = {};
    const serverBySku = {};
    serverDb.products.forEach((sp) => {
      if (!sp) return;
      if (sp.id) serverById[sp.id] = sp;
      if (sp.skuCode) serverBySku[String(sp.skuCode).toUpperCase()] = sp;
    });
    targetDb.products.forEach((lp) => {
      if (!lp) return;
      const sp = serverById[lp.id] || serverBySku[String(lp.skuCode || '').toUpperCase()];
      if (!sp || !sp.imageUrl || String(sp.imageUrl).startsWith('data:image/svg+xml')) return;
      if (!lp.imageUrl || String(lp.imageUrl).startsWith('data:image/svg+xml')) {
        lp.imageUrl = sp.imageUrl;
      } else if (lp.imageUrl.length > sp.imageUrl.length + 1000) {
        lp.imageUrl = sp.imageUrl;
      }
    });
    return targetDb;
  }

  function getConfiguredServerBaseUrls() {
    const urls = [];
    try {
      const savedLan =
        localStorage.getItem('TCW_LAN_SERVER_URL') || localStorage.getItem('cycleworld_lan_server_url');
      if (savedLan && savedLan.trim()) {
        urls.push(savedLan.trim().replace(/\/+$/, ''));
      }
    } catch (_e) {}
    const isHttp =
      global.location &&
      typeof global.location.protocol === 'string' &&
      global.location.protocol.startsWith('http');
    if (isHttp) {
      urls.push('');
    } else {
      urls.push('http://192.168.1.7:8080');
      urls.push('http://localhost:8080');
    }
    return urls;
  }

  function fetchServerDatabaseSync() {
    if (typeof XMLHttpRequest === 'undefined') return null;
    const isHttp =
      global.location &&
      typeof global.location.protocol === 'string' &&
      global.location.protocol.startsWith('http');

    // Only block synchronously when loaded directly from an HTTP server (same origin, <20ms).
    // When running inside the Android APK (file://), we load instantaneously from localDb / preloaded DB
    // and then sync asynchronously with the LAN server so the app never freezes if offline.
    if (!isHttp) {
      return null;
    }

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/db?_t=' + Date.now(), false);
      xhr.send(null);
      if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText) {
        const parsed = JSON.parse(xhr.responseText);
        if (parsed && parsed.meta && parsed.meta.schemaVersion === '2.0.0-clean') {
          return normalizeDatabaseImages(parsed);
        }
      }
    } catch (e) {}
    return null;
  }

  function syncFromLanServerAsync() {
    if (typeof fetch !== 'function') return;
    const isHttp =
      global.location &&
      typeof global.location.protocol === 'string' &&
      global.location.protocol.startsWith('http');
    if (isHttp) return;

    const bases = getConfiguredServerBaseUrls();
    let idx = 0;
    function tryNext() {
      if (idx >= bases.length) return;
      const base = bases[idx++];
      fetch(base + '/api/db?_t=' + Date.now())
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((parsed) => {
          if (parsed && parsed.meta && parsed.meta.schemaVersion === '2.0.0-clean') {
            const normalized = normalizeDatabaseImages(parsed);
            if (dbState) {
              mergeServerCompressedImages(normalized, dbState);
            }
            dbState = normalized;
            persistToLocalStorageSafe(dbState);
            notifyListeners();
          }
        })
        .catch(() => {
          tryNext();
        });
    }
    tryNext();
  }

  function persistToLocalStorageSafe(dbObj) {
    try {
      localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(dbObj));
      return true;
    } catch (err) {
      try {
        if (Array.isArray(dbObj.audit_logs) && dbObj.audit_logs.length > 40) {
          dbObj.audit_logs = dbObj.audit_logs.slice(0, 40);
        }
        normalizeDatabaseImages(dbObj);
        localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(dbObj));
        return true;
      } catch (err2) {
        console.warn('localStorage quota reached; full database is persisted via /api/sync-db:', err2);
        return false;
      }
    }
  }

  function compressOversizedDatabaseImagesInBrowser() {
    if (typeof document === 'undefined' || typeof Image === 'undefined' || !dbState || !Array.isArray(dbState.products)) {
      return;
    }
    const oversized = dbState.products.filter(
      (p) =>
        p &&
        typeof p.imageUrl === 'string' &&
        p.imageUrl.startsWith('data:image/') &&
        !p.imageUrl.startsWith('data:image/svg+xml') &&
        p.imageUrl.length > 22000
    );
    if (oversized.length === 0) return;

    let idx = 0;
    let changed = 0;
    function next() {
      if (idx >= oversized.length) {
        if (changed > 0) {
          persistToLocalStorageSafe(dbState);
          syncToServerSafe(JSON.stringify(dbState));
        }
        return;
      }
      const prod = oversized[idx++];
      const img = new Image();
      img.onerror = function () {
        setTimeout(next, 0);
      };
      img.onload = function () {
        try {
          const maxDim = 240;
          let w = img.naturalWidth || img.width || maxDim;
          let h = img.naturalHeight || img.height || maxDim;
          if (w > maxDim || h > maxDim) {
            const r = Math.min(maxDim / w, maxDim / h);
            w = Math.max(1, Math.round(w * r));
            h = Math.max(1, Math.round(h * r));
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          const comp = canvas.toDataURL('image/jpeg', 0.72);
          if (comp && comp.length < prod.imageUrl.length) {
            prod.imageUrl = comp;
            changed++;
          }
        } catch (_e) {}
        setTimeout(next, 0);
      };
      img.src = prod.imageUrl;
    }
    setTimeout(next, 50);
  }

  function syncToServerSafe(serializedJson) {
    if (typeof fetch !== 'function') return;
    const bases = getConfiguredServerBaseUrls();
    bases.forEach((base) => {
      fetch(base + '/api/sync-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: serializedJson
      }).catch(() => {});
    });
  }

  function loadDatabase(preferServer = false) {
    let localDb = null;
    try {
      const raw = localStorage.getItem(DB_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.meta && parsed.meta.schemaVersion === '2.0.0-clean') {
          localDb = normalizeDatabaseImages(parsed);
        }
      }
    } catch (err) {
      console.warn('Database localStorage read fallback:', err);
    }

    const preloadedDb =
      global.CYCLEWORLD_PRELOADED_DB &&
      global.CYCLEWORLD_PRELOADED_DB.meta &&
      global.CYCLEWORLD_PRELOADED_DB.meta.schemaVersion === '2.0.0-clean'
        ? normalizeDatabaseImages(JSON.parse(JSON.stringify(global.CYCLEWORLD_PRELOADED_DB)))
        : null;

    const serverDb = fetchServerDatabaseSync() || preloadedDb;
    if (serverDb && localDb) {
      mergeServerCompressedImages(localDb, serverDb);
    }

    if (serverDb) {
      const serverTime = (serverDb.meta && serverDb.meta.updatedAt) || '';
      const localTime = (localDb && localDb.meta && localDb.meta.updatedAt) || '';
      const serverOptVer = (serverDb.meta && serverDb.meta.imageOptimizationVersion) || 0;
      const localOptVer = (localDb && localDb.meta && localDb.meta.imageOptimizationVersion) || 0;
      const serverCustomImgs = countCustomImages(serverDb);
      const localCustomImgs = countCustomImages(localDb);

      if (
        !localDb ||
        preferServer ||
        serverOptVer > localOptVer ||
        serverTime >= localTime ||
        serverCustomImgs > localCustomImgs ||
        (serverDb.products && localDb.products && serverDb.products.length > localDb.products.length)
      ) {
        if (localDb) {
          mergeServerCompressedImages(serverDb, localDb);
        }
        dbState = serverDb;
        persistToLocalStorageSafe(dbState);
        compressOversizedDatabaseImagesInBrowser();
        syncFromLanServerAsync();
        return dbState;
      }
    }

    if (localDb) {
      dbState = localDb;
      persistToLocalStorageSafe(dbState);
      compressOversizedDatabaseImagesInBrowser();
      syncFromLanServerAsync();
      return dbState;
    }

    dbState = buildInitialDatabase();
    saveDatabase(false);
    syncFromLanServerAsync();
    return dbState;
  }

  function saveDatabase(broadcast = true, notify = true) {
    normalizeDatabaseImages(dbState);
    dbState.meta.updatedAt = new Date().toISOString();
    const serialized = JSON.stringify(dbState);

    persistToLocalStorageSafe(dbState);
    syncToServerSafe(serialized);

    if (broadcast && syncChannel) {
      try {
        syncChannel.postMessage({ type: 'DB_UPDATED', timestamp: dbState.meta.updatedAt });
      } catch (e) {}
    }
    if (notify) {
      notifyListeners();
    }
  }

  function notifyListeners() {
    changeListeners.forEach((cb) => {
      try {
        cb(dbState);
      } catch (e) {
        console.error(e);
      }
    });
  }

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      syncChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
      syncChannel.onmessage = function (ev) {
        if (ev.data && ev.data.type === 'DB_UPDATED') {
          loadDatabase(true);
          notifyListeners();
        }
      };
    } catch (e) {}
  }
  if (typeof global.addEventListener === 'function') {
    global.addEventListener('storage', function (ev) {
      if (ev.key === DB_STORAGE_KEY) {
        loadDatabase();
        notifyListeners();
      }
    });
  }

  loadDatabase();

  // ============================================================================
  // SESSION & ROLE-BASED ACCESS CONTROL (RBAC) ENFORCEMENT
  // ============================================================================
  function getPortalSessionKey(roleOverride) {
    const lockedRole = roleOverride || global.TCW_LOCKED_PORTAL || null;
    if (lockedRole) {
      return `${SESSION_STORAGE_KEY}_${lockedRole}`;
    }
    return SESSION_STORAGE_KEY;
  }

  function getActiveSession() {
    try {
      const key = getPortalSessionKey();
      const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (!session || !session.userPk) return null;
      if (global.TCW_LOCKED_PORTAL && session.roleCode !== global.TCW_LOCKED_PORTAL) {
        return null;
      }
      const user = dbState.users.find((u) => u.id === session.userPk);
      if (!user || user.status !== 'Active') {
        clearActiveSession();
        return null;
      }
      return session;
    } catch (e) {
      return null;
    }
  }

  function setActiveSession(sessionObj) {
    const serialized = JSON.stringify(sessionObj);
    const roleKey = getPortalSessionKey(sessionObj.roleCode);
    try {
      sessionStorage.setItem(roleKey, serialized);
      localStorage.setItem(roleKey, serialized);
      if (!global.TCW_LOCKED_PORTAL) {
        sessionStorage.setItem(SESSION_STORAGE_KEY, serialized);
        localStorage.setItem(SESSION_STORAGE_KEY, serialized);
      }
    } catch (e) {}
  }

  function clearActiveSession() {
    const key = getPortalSessionKey();
    try {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
      if (!global.TCW_LOCKED_PORTAL) {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch (e) {}
  }

  function requireAuth(allowedRoles) {
    const session = getActiveSession();
    if (!session) {
      throw new Error('401 Unauthorized: Please log in to continue.');
    }
    if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
      if (!allowedRoles.includes(session.roleCode)) {
        throw new Error(
          `403 Forbidden: Role '${session.roleCode}' is not permitted to perform this operation.`
        );
      }
    }
    return session;
  }

  function requireSuperAdmin() {
    return requireAuth(['SUPER_ADMIN']);
  }

  function recordAuditLog({
    session,
    actionType,
    entityType,
    entityId,
    skuCode = null,
    fieldChanged,
    previousValue,
    newValue,
    description
  }) {
    const entry = {
      id: 'aud-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      actorUserId: session ? session.userId : 'SYSTEM',
      actorName: session ? session.fullName : 'System Process',
      actorRole: session ? session.roleCode : 'SYSTEM',
      actionType,
      entityType,
      entityId: String(entityId),
      skuCode: skuCode || null,
      fieldChanged: String(fieldChanged),
      previousValue: previousValue === undefined || previousValue === null ? '' : String(previousValue),
      newValue: newValue === undefined || newValue === null ? '' : String(newValue),
      description,
      createdAt: new Date().toISOString()
    };
    dbState.audit_logs.unshift(entry);
    return entry;
  }

  // Required / Default Sub-Category Groups
  const DEFAULT_SUBCATEGORY_GROUPS = [
    'Size',
    'Model',
    'Color',
    'Type',
    'Brand / Series'
  ];

  // Helper to get ordered groups & items for a subcategory
  function getOrderedGroupsForSubcategory(subcategoryId, activeOnly = false) {
    const allGroups = (dbState.subcategory_groups || []).filter(
      (g) => g.subcategoryId === subcategoryId && (!activeOnly || g.status !== 'Inactive')
    );
    allGroups.sort((a, b) => {
      const sa = typeof a.sortOrder === 'number' ? a.sortOrder : 9999;
      const sb = typeof b.sortOrder === 'number' ? b.sortOrder : 9999;
      if (sa !== sb) return sa - sb;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });

    return allGroups.map((grp) => {
      const items = (dbState.group_items || []).filter(
        (it) => it.groupId === grp.id && (!activeOnly || it.status !== 'Inactive')
      );
      items.sort((a, b) => {
        const sa = typeof a.sortOrder === 'number' ? a.sortOrder : 9999;
        const sb = typeof b.sortOrder === 'number' ? b.sortOrder : 9999;
        if (sa !== sb) return sa - sb;
        return String(a.value || '').localeCompare(String(b.value || ''), undefined, { numeric: true });
      });
      return {
        ...grp,
        mrp: grp.mrp !== undefined && grp.mrp !== null && grp.mrp !== '' ? parseFloat(grp.mrp) || 0 : 0,
        items
      };
    });
  }

  // Helper to join relational product tables & multi-level group variant values
  function getJoinedProduct(productRow) {
    const category = dbState.categories.find((c) => c.id === productRow.categoryId) || {
      id: productRow.categoryId,
      name: 'Uncategorized',
      code: 'CAT',
      status: 'Inactive'
    };
    const subcategory = dbState.subcategories.find((s) => s.id === productRow.subcategoryId) || {
      id: productRow.subcategoryId,
      name: 'General',
      code: 'SUB',
      status: 'Inactive'
    };
    const stockRow = dbState.stock.find((s) => s.productId === productRow.id) || {
      quantity: 0,
      lowStockThreshold: 10
    };
    const priceRow = dbState.prices.find((p) => p.productId === productRow.id) || {
      fpPrice: 0,
      mrp: 0,
      currency: 'INR'
    };
    const gstRow = dbState.gst.find((g) => g.productId === productRow.id) || {
      gstPercentage: 12,
      hsnCode: productRow.hsnCode || ''
    };

    const liveQty = Math.max(0, parseInt(stockRow.quantity, 10) || 0);
    const fpPrice = parseFloat(priceRow.fpPrice) || 0;
    const gstPercentage = parseFloat(gstRow.gstPercentage) || 0;
    const gstAmountPerUnit = +(fpPrice * (gstPercentage / 100)).toFixed(2);
    const finalPriceInclGst = +(fpPrice + gstAmountPerUnit).toFixed(2);

    const adminConfiguredStatus = productRow.status === 'Inactive' ? 'Inactive' : 'Active';
    let effectiveStatus = adminConfiguredStatus;
    if (liveQty <= 0 && adminConfiguredStatus === 'Active') {
      effectiveStatus = 'Out of Stock';
    }

    // Resolve Multi-Level Group Variant Values ONLY for existing active Sub-Category Groups
    // (When a group is removed/deleted by Admin, it will never appear in category or customer product views)
    const rawAttrs =
      productRow.variantAttributes && typeof productRow.variantAttributes === 'object'
        ? productRow.variantAttributes
        : {};
    const subGroups = getOrderedGroupsForSubcategory(productRow.subcategoryId, true);
    const orderedVariantList = [];
    const normalizedAttrs = {};
    let groupMrp = 0;

    subGroups.forEach((grp) => {
      if (grp.mrp && grp.mrp > 0 && groupMrp === 0) {
        groupMrp = parseFloat(grp.mrp) || 0;
      }
      const matchKey = Object.keys(rawAttrs).find(
        (k) => k.toLowerCase() === String(grp.name).toLowerCase()
      );
      const val = matchKey !== undefined ? rawAttrs[matchKey] : undefined;
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        const cleanVal = String(val).trim();
        normalizedAttrs[grp.name] = cleanVal;
        const matchedItem = (grp.items || []).find(
          (it) => String(it.value).toLowerCase() === cleanVal.toLowerCase()
        );
        const itemMrp =
          matchedItem && matchedItem.mrp ? parseFloat(matchedItem.mrp) || 0 : 0;
        const effectiveGroupMrp = itemMrp > 0 ? itemMrp : parseFloat(grp.mrp) || 0;
        if (effectiveGroupMrp > 0) {
          groupMrp = effectiveGroupMrp;
        }
        orderedVariantList.push({
          groupId: grp.id,
          groupName: grp.name,
          value: cleanVal,
          mrp: effectiveGroupMrp
        });
      }
    });

    const explicitProductMrp =
      parseFloat(priceRow.mrp) || parseFloat(productRow.mrp) || 0;
    const mrp = explicitProductMrp > 0 ? explicitProductMrp : groupMrp;

    function findVariantByKeyMatch(patterns) {
      for (const item of orderedVariantList) {
        const lower = item.groupName.toLowerCase();
        if (patterns.some((pat) => lower === pat || lower.includes(pat))) {
          return item.value;
        }
      }
      return '';
    }

    const modelVal = findVariantByKeyMatch(['model']);
    const sizeVal = findVariantByKeyMatch(['size', 'age']);
    const colorVal = findVariantByKeyMatch(['color', 'colour', 'shade', 'finish']);
    const typeVal = findVariantByKeyMatch(['type', 'gear', 'wheel', 'frame']);
    const brandVal = findVariantByKeyMatch(['brand', 'series']);

    const variantSummary = orderedVariantList
      .map((v) => `${v.groupName}: ${v.value}`)
      .join(' | ');

    return {
      id: productRow.id,
      skuId: productRow.skuId,
      skuCode: productRow.skuCode,
      name: productRow.name,
      categoryId: productRow.categoryId,
      categoryName: category.name,
      categoryCode: category.code,
      categoryStatus: category.status,
      subcategoryId: productRow.subcategoryId,
      subcategoryName: subcategory.name,
      subcategoryCode: subcategory.code,
      subcategoryStatus: subcategory.status,
      variantAttributes: normalizedAttrs,
      variantList: orderedVariantList,
      variantSummary,
      model: modelVal,
      size: sizeVal,
      color: colorVal,
      type: typeVal,
      brand: brandVal,
      rawImageUrl:
        productRow.imageUrl && !String(productRow.imageUrl).startsWith('data:image/svg+xml')
          ? productRow.imageUrl
          : '',
      hasCustomImage: Boolean(
        productRow.imageUrl && !String(productRow.imageUrl).startsWith('data:image/svg+xml')
      ),
      imageUrl: productRow.imageUrl || createPartSvgDataUri('default', productRow.skuCode, '#16a34a'),
      hsnCode: productRow.hsnCode || gstRow.hsnCode || '',
      packSize: productRow.packSize || '1 Unit',
      specifications: productRow.specifications || '',
      minimumOrderQuantity:
        Number.isInteger(productRow.minimumOrderQuantity) && productRow.minimumOrderQuantity >= 1
          ? productRow.minimumOrderQuantity
          : 1,
      mrp,
      groupMrp,
      fpPrice,
      gstPercentage,
      gstAmountPerUnit,
      finalPriceInclGst,
      stock: liveQty,
      franchiseQuantity: liveQty,
      lowStockThreshold: stockRow.lowStockThreshold || 10,
      status: effectiveStatus,
      adminConfiguredStatus,
      updatedAt: productRow.updatedAt
    };
  }

  // ============================================================================
  // PUBLIC API SERVICE METHODS
  // ============================================================================
  const CycleWorldAPI = {
    onChange(listener) {
      if (typeof listener === 'function') {
        changeListeners.push(listener);
      }
    },

    getPublicCompanyBranding() {
      const cs = dbState.company_settings;
      return {
        companyName: cs.companyName,
        tagline: cs.tagline,
        logoUrl: cs.logoUrl,
        phone: cs.phone,
        email: cs.email,
        gstNumber: cs.gstNumber,
        address: cs.address,
        city: cs.city,
        state: cs.state,
        pincode: cs.pincode
      };
    },

    getSession() {
      return getActiveSession();
    },

    // -------------------------------------------------------------------------
    // AUTHENTICATION
    // -------------------------------------------------------------------------
    login({ identifier, password, requiredRole }) {
      const cleanId = String(identifier || '').trim();
      const rawPass = String(password || '');
      if (!cleanId || !rawPass) {
        throw new Error('Please enter both Login ID and Password.');
      }

      loadDatabase(true);
      const hashedInput = sha256Hash(rawPass);
      const user = dbState.users.find((u) => {
        if (u.passwordHash !== hashedInput) return false;
        if (u.userId.toLowerCase() === cleanId.toLowerCase()) return true;
        if (u.email && u.email.toLowerCase() === cleanId.toLowerCase()) return true;
        if (u.roleCode === 'CUSTOMER') {
          const cust = (dbState.customers || []).find((c) => c.userId === u.id);
          if (cust) {
            if (cust.customerCode && cust.customerCode.toLowerCase() === cleanId.toLowerCase()) return true;
            const normPhone = (cust.phone || '').replace(/\D/g, '');
            const normInput = cleanId.replace(/\D/g, '');
            if (normPhone && normPhone === normInput && normInput.length >= 7) return true;
          }
        }
        return false;
      });

      if (!user) {
        throw new Error('Invalid Login ID or Password.');
      }

      if (requiredRole && user.roleCode !== requiredRole) {
        const portalLabels = {
          SUPER_ADMIN: 'Super Admin Portal',
          BILLING_EMPLOYEE: 'Employee / Billing Portal',
          CUSTOMER: 'Customer Portal'
        };
        throw new Error(
          `Access Denied: This Login ID is not authorized for the ${portalLabels[requiredRole] || requiredRole}.`
        );
      }

      if (user.status !== 'Active') {
        throw new Error(
          'Your account is currently marked Inactive. Please contact Cycle World Super Admin.'
        );
      }

      let customerRecord = null;
      let employeeRecord = null;

      if (user.roleCode === 'CUSTOMER') {
        customerRecord = dbState.customers.find((c) => c.userId === user.id);
        if (!customerRecord || customerRecord.status !== 'Active') {
          throw new Error('This Customer / Store Account is currently Inactive.');
        }
      } else if (user.roleCode === 'BILLING_EMPLOYEE') {
        employeeRecord = dbState.employees.find((e) => e.userId === user.id);
        if (!employeeRecord || employeeRecord.status !== 'Active') {
          throw new Error('This Employee Account is currently Inactive.');
        }
      }

      user.lastLoginAt = new Date().toISOString();
      saveDatabase(false);

      const session = {
        token: 'tcw_tok_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10),
        userPk: user.id,
        userId: user.userId,
        email: user.email,
        fullName: user.fullName,
        roleCode: user.roleCode,
        customerId: customerRecord ? customerRecord.id : null,
        customerCode: customerRecord ? customerRecord.customerCode : null,
        storeName: customerRecord ? customerRecord.storeName : null,
        employeeId: employeeRecord ? employeeRecord.id : null,
        loginAt: user.lastLoginAt
      };

      setActiveSession(session);
      return session;
    },

    logout() {
      clearActiveSession();
      return { success: true };
    },

    changeOwnPassword({ currentPassword, newPassword }) {
      const session = requireAuth(['SUPER_ADMIN', 'BILLING_EMPLOYEE', 'CUSTOMER']);
      if (!newPassword || String(newPassword).length < 4) {
        throw new Error('New password must be at least 4 characters long.');
      }
      const user = dbState.users.find((u) => u.id === session.userPk);
      if (!user) throw new Error('User record not found.');

      if (user.passwordHash !== sha256Hash(currentPassword)) {
        throw new Error('Current password is incorrect.');
      }

      user.passwordHash = sha256Hash(newPassword);
      user.updatedAt = new Date().toISOString();

      recordAuditLog({
        session,
        actionType: 'CHANGE_PASSWORD',
        entityType: 'USER',
        entityId: user.userId,
        fieldChanged: 'passwordHash',
        previousValue: '[HASHED]',
        newValue: '[HASHED_UPDATED]',
        description: `${session.fullName} (${session.userId}) changed their account password.`
      });

      saveDatabase();
      return { success: true };
    },

    // -------------------------------------------------------------------------
    // SUPER ADMIN DASHBOARD METRICS
    // -------------------------------------------------------------------------
    getAdminDashboardStats() {
      requireSuperAdmin();
      const joinedProducts = dbState.products.map(getJoinedProduct);

      const totalCustomers = dbState.customers.length;
      const activeCustomers = dbState.customers.filter((c) => c.status === 'Active').length;
      const inactiveCustomers = totalCustomers - activeCustomers;

      const totalProducts = joinedProducts.length;
      const activeProducts = joinedProducts.filter(
        (p) => p.adminConfiguredStatus === 'Active' && p.stock > 0
      ).length;
      const zeroStockProducts = joinedProducts.filter((p) => p.stock === 0).length;
      const lowStockProducts = joinedProducts.filter(
        (p) => p.stock > 0 && p.stock <= p.lowStockThreshold
      ).length;

      const totalCategories = dbState.categories.length;
      const totalSubcategories = dbState.subcategories.length;

      const newOrders = dbState.orders.filter((o) => o.status === 'New').length;
      const pendingOrders = dbState.orders.filter((o) =>
        ['New', 'Confirmed', 'Processing', 'Ready for Billing'].includes(o.status)
      ).length;
      const completedOrders = dbState.orders.filter((o) => o.status === 'Completed').length;

      const totalRevenue = dbState.orders
        .filter((o) => o.status !== 'Cancelled')
        .reduce((sum, o) => sum + (parseFloat(o.totalAmount) || 0), 0);

      const unreadNotifications = dbState.notifications.filter((n) => !n.isRead).length;

      return {
        totalCustomers,
        activeCustomers,
        inactiveCustomers,
        totalProducts,
        activeProducts,
        lowStockProducts,
        zeroStockProducts,
        totalCategories,
        totalSubcategories,
        newOrders,
        pendingOrders,
        completedOrders,
        totalOrders: dbState.orders.length,
        totalEmployees: dbState.employees.length,
        totalRevenue: +totalRevenue.toFixed(2),
        unreadNotifications
      };
    },

    // -------------------------------------------------------------------------
    // CATEGORIES, SUBCATEGORIES, FLEXIBLE GROUPS & GROUP ITEMS
    // -------------------------------------------------------------------------
    getCategoriesTree({ activeOnly = false } = {}) {
      requireAuth(['SUPER_ADMIN', 'BILLING_EMPLOYEE', 'CUSTOMER']);
      let cats = [...dbState.categories];
      if (activeOnly) {
        cats = cats.filter((c) => c.status === 'Active');
      }
      cats.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

      return cats.map((cat) => {
        let subs = dbState.subcategories.filter((s) => s.categoryId === cat.id);
        if (activeOnly) {
          subs = subs.filter((s) => s.status === 'Active');
        }
        subs.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        const productCount = dbState.products.filter((p) => p.categoryId === cat.id).length;
        return {
          ...cat,
          productCount,
          subcategories: subs.map((sub) => {
            const groups = getOrderedGroupsForSubcategory(sub.id, activeOnly);
            return {
              ...sub,
              productCount: dbState.products.filter((p) => p.subcategoryId === sub.id).length,
              groups
            };
          })
        };
      });
    },

    getDefaultSubcategoryGroupNames() {
      return [...DEFAULT_SUBCATEGORY_GROUPS];
    },

    getSubcategoryGroups(subcategoryId, { activeOnly = false } = {}) {
      requireAuth(['SUPER_ADMIN', 'BILLING_EMPLOYEE', 'CUSTOMER']);
      return getOrderedGroupsForSubcategory(subcategoryId, activeOnly);
    },

    seedDefaultSubcategoryGroups(subcategoryId) {
      const session = requireSuperAdmin();
      const sub = dbState.subcategories.find((s) => s.id === subcategoryId);
      if (!sub) throw new Error('Subcategory not found.');
      const cat = dbState.categories.find((c) => c.id === sub.categoryId);

      const existingGroups = (dbState.subcategory_groups || []).filter(
        (g) => g.subcategoryId === subcategoryId
      );
      let maxSort = existingGroups.reduce(
        (max, g) => Math.max(max, typeof g.sortOrder === 'number' ? g.sortOrder : 0),
        0
      );

      const now = new Date().toISOString();
      const created = [];

      DEFAULT_SUBCATEGORY_GROUPS.forEach((grpName) => {
        const exists = existingGroups.some(
          (g) => g.name.toLowerCase() === grpName.toLowerCase()
        );
        if (!exists) {
          maxSort += 1;
          const newGrp = {
            id: 'grp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '-' + maxSort,
            categoryId: sub.categoryId,
            subcategoryId,
            name: grpName,
            mrp: 0,
            sortOrder: maxSort,
            status: 'Active',
            createdAt: now,
            updatedAt: now
          };
          dbState.subcategory_groups.push(newGrp);
          created.push(newGrp);
        }
      });

      if (created.length > 0) {
        recordAuditLog({
          session,
          actionType: 'SEED_DEFAULT_GROUPS',
          entityType: 'SUBCATEGORY_GROUP',
          entityId: subcategoryId,
          fieldChanged: 'groups',
          previousValue: `${existingGroups.length} groups`,
          newValue: created.map((g) => g.name).join(', '),
          description: `Added default Sub-Category Groups (${created.map((g) => g.name).join(', ')}) under ${cat ? cat.name + ' › ' : ''}${sub.name}.`
        });
        saveDatabase();
      }
      return getOrderedGroupsForSubcategory(subcategoryId, false);
    },

    saveSubcategoryGroup({ id, subcategoryId, name, mrp, status, applyMrpToProducts = false }) {
      const session = requireSuperAdmin();
      const cleanName = String(name || '').trim();
      if (!subcategoryId || !cleanName) {
        throw new Error('Subcategory and Group Name are required.');
      }
      const sub = dbState.subcategories.find((s) => s.id === subcategoryId);
      if (!sub) throw new Error('Subcategory not found.');
      const cat = dbState.categories.find((c) => c.id === sub.categoryId);

      const dup = (dbState.subcategory_groups || []).find(
        (g) =>
          g.id !== id &&
          g.subcategoryId === subcategoryId &&
          g.name.toLowerCase() === cleanName.toLowerCase()
      );
      if (dup) {
        throw new Error(`Group "${cleanName}" already exists under "${sub.name}".`);
      }

      const parsedMrp =
        mrp !== undefined && mrp !== null && String(mrp).trim() !== ''
          ? Math.max(0, parseFloat(mrp) || 0)
          : undefined;

      const now = new Date().toISOString();
      if (id) {
        const existing = dbState.subcategory_groups.find((g) => g.id === id);
        if (!existing) throw new Error('Group not found.');
        const oldName = existing.name;
        existing.name = cleanName;
        if (parsedMrp !== undefined) {
          existing.mrp = parsedMrp;
        }
        if (status !== undefined) {
          existing.status = status === 'Inactive' ? 'Inactive' : 'Active';
        }
        existing.updatedAt = now;

        // If group was renamed, migrate existing product variantAttributes keys under this subcategory
        if (oldName !== cleanName) {
          dbState.products.forEach((p) => {
            if (
              p.subcategoryId === subcategoryId &&
              p.variantAttributes &&
              p.variantAttributes[oldName] !== undefined
            ) {
              p.variantAttributes[cleanName] = p.variantAttributes[oldName];
              delete p.variantAttributes[oldName];
            }
          });
        }

        if (applyMrpToProducts && parsedMrp !== undefined && parsedMrp > 0) {
          dbState.products.forEach((p) => {
            if (p.subcategoryId === subcategoryId) {
              p.mrp = parsedMrp;
              const prc = dbState.prices.find((pr) => pr.productId === p.id);
              if (prc) prc.mrp = parsedMrp;
            }
          });
        }

        recordAuditLog({
          session,
          actionType: 'UPDATE_SUBCATEGORY_GROUP',
          entityType: 'SUBCATEGORY_GROUP',
          entityId: existing.id,
          fieldChanged: 'name/mrp',
          previousValue: oldName,
          newValue: `${cleanName}${existing.mrp ? ` (MRP: ₹${existing.mrp})` : ''}`,
          description: `Updated group "${cleanName}"${existing.mrp ? ` with MRP ₹${existing.mrp}` : ''} under ${cat ? cat.name + ' › ' : ''}${sub.name}.`
        });
        saveDatabase();
        return existing;
      } else {
        const existingGroups = (dbState.subcategory_groups || []).filter(
          (g) => g.subcategoryId === subcategoryId
        );
        const maxSort = existingGroups.reduce(
          (max, g) => Math.max(max, typeof g.sortOrder === 'number' ? g.sortOrder : 0),
          0
        );
        const newGrp = {
          id: 'grp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          categoryId: sub.categoryId,
          subcategoryId,
          name: cleanName,
          mrp: parsedMrp || 0,
          sortOrder: maxSort + 1,
          status: status === 'Inactive' ? 'Inactive' : 'Active',
          createdAt: now,
          updatedAt: now
        };
        dbState.subcategory_groups.push(newGrp);

        if (applyMrpToProducts && newGrp.mrp > 0) {
          dbState.products.forEach((p) => {
            if (p.subcategoryId === subcategoryId) {
              p.mrp = newGrp.mrp;
              const prc = dbState.prices.find((pr) => pr.productId === p.id);
              if (prc) prc.mrp = newGrp.mrp;
            }
          });
        }

        recordAuditLog({
          session,
          actionType: 'CREATE_SUBCATEGORY_GROUP',
          entityType: 'SUBCATEGORY_GROUP',
          entityId: newGrp.id,
          fieldChanged: 'name',
          previousValue: 'NONE',
          newValue: `${cleanName}${newGrp.mrp ? ` (MRP: ₹${newGrp.mrp})` : ''}`,
          description: `Created group "${cleanName}"${newGrp.mrp ? ` (MRP: ₹${newGrp.mrp})` : ''} under ${cat ? cat.name + ' › ' : ''}${sub.name}.`
        });
        saveDatabase();
        return newGrp;
      }
    },

    updateSubcategoryGroupMrp({ groupId, mrp, applyToProducts = true }) {
      const session = requireSuperAdmin();
      const grp = (dbState.subcategory_groups || []).find((g) => g.id === groupId);
      if (!grp) throw new Error('Sub-Category Group not found.');

      const numMrp =
        mrp !== undefined && mrp !== null && String(mrp).trim() !== ''
          ? Math.max(0, parseFloat(mrp) || 0)
          : 0;
      const prevMrp = grp.mrp || 0;
      grp.mrp = numMrp;
      grp.updatedAt = new Date().toISOString();

      let updatedProductsCount = 0;
      if (applyToProducts && numMrp > 0) {
        dbState.products.forEach((p) => {
          if (p.subcategoryId === grp.subcategoryId) {
            p.mrp = numMrp;
            const prc = dbState.prices.find((pr) => pr.productId === p.id);
            if (prc) prc.mrp = numMrp;
            updatedProductsCount += 1;
          }
        });
      }

      recordAuditLog({
        session,
        actionType: 'UPDATE_GROUP_MRP',
        entityType: 'SUBCATEGORY_GROUP',
        entityId: grp.id,
        fieldChanged: 'mrp',
        previousValue: `₹${prevMrp}`,
        newValue: `₹${numMrp}`,
        description: `Updated MRP for Sub-Category Group "${grp.name}" to ₹${numMrp} (${updatedProductsCount} products synced).`
      });

      saveDatabase();
      return {
        group: grp,
        mrp: numMrp,
        updatedProductsCount
      };
    },

    deleteSubcategoryGroup(groupId) {
      const session = requireSuperAdmin();
      const grp = (dbState.subcategory_groups || []).find((g) => g.id === groupId);
      if (!grp) throw new Error('Group not found.');

      const sub = dbState.subcategories.find((s) => s.id === grp.subcategoryId);
      const removedItemsCount = (dbState.group_items || []).filter((i) => i.groupId === groupId).length;

      dbState.subcategory_groups = dbState.subcategory_groups.filter((g) => g.id !== groupId);
      dbState.group_items = dbState.group_items.filter((i) => i.groupId !== groupId);

      // Completely remove this deleted group's attribute from all products in the subcategory
      // so it never appears in category or customer product views.
      let cleanedProductsCount = 0;
      dbState.products.forEach((p) => {
        if (
          p.subcategoryId === grp.subcategoryId &&
          p.variantAttributes &&
          typeof p.variantAttributes === 'object'
        ) {
          Object.keys(p.variantAttributes).forEach((k) => {
            if (k.toLowerCase() === grp.name.toLowerCase()) {
              delete p.variantAttributes[k];
              cleanedProductsCount += 1;
            }
          });
        }
      });

      recordAuditLog({
        session,
        actionType: 'DELETE_SUBCATEGORY_GROUP',
        entityType: 'SUBCATEGORY_GROUP',
        entityId: groupId,
        fieldChanged: 'record',
        previousValue: `${grp.name} (${removedItemsCount} items)`,
        newValue: 'DELETED',
        description: `Removed Sub-Category Group "${grp.name}" (${removedItemsCount} items, ${cleanedProductsCount} product attributes cleared) from "${sub ? sub.name : ''}".`
      });
      saveDatabase();
      return {
        deletedGroupName: grp.name,
        removedItemsCount,
        deletedItemsCount: removedItemsCount,
        cleanedProductsCount
      };
    },

    reorderSubcategoryGroup(groupId, direction) {
      requireSuperAdmin();
      const grp = (dbState.subcategory_groups || []).find((g) => g.id === groupId);
      if (!grp) throw new Error('Group not found.');

      const siblings = getOrderedGroupsForSubcategory(grp.subcategoryId, false);
      const idx = siblings.findIndex((s) => s.id === groupId);
      if (idx === -1) return;
      const swapIdx = direction === 'UP' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= siblings.length) return;

      siblings.forEach((s, i) => {
        const real = dbState.subcategory_groups.find((g) => g.id === s.id);
        if (real) real.sortOrder = i + 1;
      });
      const currentReal = dbState.subcategory_groups.find((g) => g.id === siblings[idx].id);
      const targetReal = dbState.subcategory_groups.find((g) => g.id === siblings[swapIdx].id);
      if (currentReal && targetReal) {
        const tmp = currentReal.sortOrder;
        currentReal.sortOrder = targetReal.sortOrder;
        targetReal.sortOrder = tmp;
      }
      saveDatabase();
      return getOrderedGroupsForSubcategory(grp.subcategoryId, false);
    },

    addGroupItems({ groupId, rawValues, mrp }) {
      const session = requireSuperAdmin();
      const grp = (dbState.subcategory_groups || []).find((g) => g.id === groupId);
      if (!grp) throw new Error('Group not found.');

      const parts = Array.isArray(rawValues)
        ? rawValues
        : String(rawValues || '')
            .split(/[,;\n]+/)
            .map((v) => v.trim())
            .filter(Boolean);

      if (parts.length === 0) {
        throw new Error('Please enter at least one item/value to add.');
      }

      const itemMrp =
        mrp !== undefined && mrp !== null && String(mrp).trim() !== ''
          ? Math.max(0, parseFloat(mrp) || 0)
          : grp.mrp || 0;

      const existingItems = (dbState.group_items || []).filter((i) => i.groupId === groupId);
      let maxSort = existingItems.reduce(
        (max, i) => Math.max(max, typeof i.sortOrder === 'number' ? i.sortOrder : 0),
        0
      );

      const now = new Date().toISOString();
      const added = [];
      parts.forEach((val) => {
        const cleanVal = String(val || '').trim();
        if (!cleanVal) return;
        const dup = dbState.group_items.find(
          (i) => i.groupId === groupId && i.value.toLowerCase() === cleanVal.toLowerCase()
        );
        if (dup) return;
        maxSort += 1;
        const newItem = {
          id: 'gitm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '-' + maxSort,
          groupId: grp.id,
          subcategoryId: grp.subcategoryId,
          categoryId: grp.categoryId,
          value: cleanVal,
          mrp: itemMrp,
          sortOrder: maxSort,
          status: 'Active',
          createdAt: now,
          updatedAt: now
        };
        dbState.group_items.push(newItem);
        added.push(newItem);
      });

      if (added.length === 0) {
        throw new Error('All entered item values already exist in this group.');
      }

      recordAuditLog({
        session,
        actionType: 'ADD_GROUP_ITEMS',
        entityType: 'GROUP_ITEM',
        entityId: grp.id,
        fieldChanged: grp.name,
        previousValue: `${existingItems.length} items`,
        newValue: added.map((a) => a.value).join(', '),
        description: `Added ${added.length} item(s) [${added.map((a) => a.value).join(', ')}] to group "${grp.name}".`
      });

      saveDatabase();
      return Object.assign(added, {
        addedCount: added.length,
        groupName: grp.name
      });
    },

    updateGroupItem({ itemId, value, mrp, status }) {
      const session = requireSuperAdmin();
      const item = (dbState.group_items || []).find((i) => i.id === itemId);
      if (!item) throw new Error('Group item not found.');

      const cleanVal = String(value !== undefined ? value : item.value || '').trim();
      if (!cleanVal) throw new Error('Item value cannot be empty.');

      const dup = dbState.group_items.find(
        (i) =>
          i.id !== itemId &&
          i.groupId === item.groupId &&
          i.value.toLowerCase() === cleanVal.toLowerCase()
      );
      if (dup) {
        throw new Error(`Value "${cleanVal}" already exists in this group.`);
      }

      const grp = (dbState.subcategory_groups || []).find((g) => g.id === item.groupId);
      const oldVal = item.value;
      item.value = cleanVal;
      if (mrp !== undefined) {
        item.mrp =
          mrp !== null && String(mrp).trim() !== '' ? Math.max(0, parseFloat(mrp) || 0) : 0;
      }
      if (status !== undefined) {
        item.status = status === 'Inactive' ? 'Inactive' : 'Active';
      }
      item.updatedAt = new Date().toISOString();

      // Update products using this group value under this subcategory
      if (grp && oldVal !== cleanVal) {
        dbState.products.forEach((p) => {
          if (
            p.subcategoryId === grp.subcategoryId &&
            p.variantAttributes &&
            p.variantAttributes[grp.name] === oldVal
          ) {
            p.variantAttributes[grp.name] = cleanVal;
          }
        });
      }

      recordAuditLog({
        session,
        actionType: 'UPDATE_GROUP_ITEM',
        entityType: 'GROUP_ITEM',
        entityId: item.id,
        fieldChanged: grp ? grp.name : 'value',
        previousValue: oldVal,
        newValue: cleanVal,
        description: `Updated group item from "${oldVal}" to "${cleanVal}" in "${grp ? grp.name : ''}".`
      });

      saveDatabase();
      return item;
    },

    deleteGroupItem(itemId) {
      const session = requireSuperAdmin();
      const item = (dbState.group_items || []).find((i) => i.id === itemId);
      if (!item) throw new Error('Group item not found.');

      const grp = (dbState.subcategory_groups || []).find((g) => g.id === item.groupId);
      dbState.group_items = dbState.group_items.filter((i) => i.id !== itemId);

      recordAuditLog({
        session,
        actionType: 'DELETE_GROUP_ITEM',
        entityType: 'GROUP_ITEM',
        entityId: itemId,
        fieldChanged: grp ? grp.name : 'value',
        previousValue: item.value,
        newValue: 'DELETED',
        description: `Deleted item "${item.value}" from group "${grp ? grp.name : ''}".`
      });

      saveDatabase();
      return {
        deletedValue: item.value,
        groupName: grp ? grp.name : ''
      };
    },

    reorderGroupItem(itemId, direction) {
      requireSuperAdmin();
      const item = (dbState.group_items || []).find((i) => i.id === itemId);
      if (!item) throw new Error('Group item not found.');

      const grpList = getOrderedGroupsForSubcategory(item.subcategoryId, false);
      const grp = grpList.find((g) => g.id === item.groupId);
      if (!grp) return;

      const siblings = grp.items;
      const idx = siblings.findIndex((i) => i.id === itemId);
      if (idx === -1) return;
      const swapIdx = direction === 'UP' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= siblings.length) return;

      siblings.forEach((s, i) => {
        const real = dbState.group_items.find((it) => it.id === s.id);
        if (real) real.sortOrder = i + 1;
      });
      const currentReal = dbState.group_items.find((it) => it.id === siblings[idx].id);
      const targetReal = dbState.group_items.find((it) => it.id === siblings[swapIdx].id);
      if (currentReal && targetReal) {
        const tmp = currentReal.sortOrder;
        currentReal.sortOrder = targetReal.sortOrder;
        targetReal.sortOrder = tmp;
      }
      saveDatabase();
    },

    saveCategory({ id, name, code, description, status }) {
      const session = requireSuperAdmin();
      const cleanName = String(name || '').trim();
      if (!cleanName) {
        throw new Error('Category Name is required.');
      }

      const derivedCode =
        String(code || '')
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9_-]/g, '') ||
        cleanName
          .replace(/[^A-Za-z0-9]/g, '')
          .slice(0, 4)
          .toUpperCase() ||
        'CAT';

      const duplicate = dbState.categories.find(
        (c) => c.id !== id && c.name.toLowerCase() === cleanName.toLowerCase()
      );
      if (duplicate) {
        throw new Error(`Category "${cleanName}" already exists.`);
      }

      const now = new Date().toISOString();
      if (id) {
        const existing = dbState.categories.find((c) => c.id === id);
        if (!existing) throw new Error('Category not found.');
        const prevSnapshot = `${existing.name} [${existing.status}]`;
        existing.name = cleanName;
        existing.code = derivedCode;
        existing.description = String(description || '').trim();
        existing.status = status === 'Inactive' ? 'Inactive' : 'Active';
        existing.updatedAt = now;

        recordAuditLog({
          session,
          actionType: 'UPDATE_CATEGORY',
          entityType: 'CATEGORY',
          entityId: existing.id,
          fieldChanged: 'category',
          previousValue: prevSnapshot,
          newValue: `${existing.name} [${existing.status}]`,
          description: `Updated category "${existing.name}".`
        });
        saveDatabase();
        return existing;
      } else {
        const newCat = {
          id: 'cat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
          code: derivedCode,
          name: cleanName,
          description: String(description || '').trim(),
          status: status === 'Inactive' ? 'Inactive' : 'Active',
          createdAt: now,
          updatedAt: now
        };
        dbState.categories.push(newCat);
        recordAuditLog({
          session,
          actionType: 'CREATE_CATEGORY',
          entityType: 'CATEGORY',
          entityId: newCat.id,
          fieldChanged: 'name',
          previousValue: 'NONE',
          newValue: `${newCat.name}`,
          description: `Created new product category "${newCat.name}".`
        });
        saveDatabase();
        return newCat;
      }
    },

    saveSubcategory({ id, categoryId, name, code, description, status, seedDefaultGroups }) {
      const session = requireSuperAdmin();
      const cleanName = String(name || '').trim();
      if (!categoryId || !cleanName) {
        throw new Error('Parent Category and Subcategory Name are required.');
      }

      const parentCat = dbState.categories.find((c) => c.id === categoryId);
      if (!parentCat) throw new Error('Selected parent category does not exist.');

      const derivedCode =
        String(code || '')
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9_-]/g, '') ||
        cleanName
          .replace(/[^A-Za-z0-9]/g, '')
          .slice(0, 4)
          .toUpperCase() ||
        'SUB';

      const duplicate = dbState.subcategories.find(
        (s) =>
          s.id !== id &&
          s.categoryId === categoryId &&
          s.name.toLowerCase() === cleanName.toLowerCase()
      );
      if (duplicate) {
        throw new Error(
          `Subcategory "${cleanName}" already exists under "${parentCat.name}".`
        );
      }

      const now = new Date().toISOString();
      if (id) {
        const existing = dbState.subcategories.find((s) => s.id === id);
        if (!existing) throw new Error('Subcategory not found.');
        const prevSnapshot = `${existing.name} [${existing.status}]`;
        existing.categoryId = categoryId;
        existing.name = cleanName;
        existing.code = derivedCode;
        existing.description = String(description || '').trim();
        existing.status = status === 'Inactive' ? 'Inactive' : 'Active';
        existing.updatedAt = now;

        recordAuditLog({
          session,
          actionType: 'UPDATE_SUBCATEGORY',
          entityType: 'SUBCATEGORY',
          entityId: existing.id,
          fieldChanged: 'subcategory',
          previousValue: prevSnapshot,
          newValue: `${existing.name} [${existing.status}]`,
          description: `Updated subcategory "${existing.name}" under "${parentCat.name}".`
        });
        saveDatabase();
        return existing;
      } else {
        const newSub = {
          id: 'sub-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
          categoryId,
          code: derivedCode,
          name: cleanName,
          description: String(description || '').trim(),
          status: status === 'Inactive' ? 'Inactive' : 'Active',
          createdAt: now,
          updatedAt: now
        };
        dbState.subcategories.push(newSub);

        // Automatically create ONLY the required default Sub-Category Groups when requested
        // or by default under Bicycle categories so Admin doesn't have to manually create them.
        const isBicycleCat =
          parentCat.name.toLowerCase().includes('bicycle') &&
          !parentCat.name.toLowerCase().includes('accessor');
        const shouldSeedDefaults =
          seedDefaultGroups !== undefined ? !!seedDefaultGroups : isBicycleCat;

        if (shouldSeedDefaults) {
          DEFAULT_SUBCATEGORY_GROUPS.forEach((grpName, idx) => {
            dbState.subcategory_groups.push({
              id: 'grp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '-' + idx,
              categoryId: parentCat.id,
              subcategoryId: newSub.id,
              name: grpName,
              mrp: 0,
              sortOrder: idx + 1,
              status: 'Active',
              createdAt: now,
              updatedAt: now
            });
          });
        }

        recordAuditLog({
          session,
          actionType: 'CREATE_SUBCATEGORY',
          entityType: 'SUBCATEGORY',
          entityId: newSub.id,
          fieldChanged: 'name',
          previousValue: 'NONE',
          newValue: `${newSub.name}`,
          description: `Created new subcategory "${newSub.name}" under "${parentCat.name}".`
        });
        saveDatabase();
        return newSub;
      }
    },

    toggleCategoryStatus(categoryId) {
      const session = requireSuperAdmin();
      const cat = dbState.categories.find((c) => c.id === categoryId);
      if (!cat) throw new Error('Category not found.');
      const prev = cat.status;
      cat.status = cat.status === 'Inactive' ? 'Active' : 'Inactive';
      cat.updatedAt = new Date().toISOString();

      recordAuditLog({
        session,
        actionType: 'TOGGLE_CATEGORY_STATUS',
        entityType: 'CATEGORY',
        entityId: cat.id,
        fieldChanged: 'status',
        previousValue: prev,
        newValue: cat.status,
        description: `${cat.status === 'Active' ? 'Enabled' : 'Disabled'} category "${cat.name}".`
      });
      saveDatabase();
      return cat;
    },

    deleteCategory(categoryId) {
      const session = requireSuperAdmin();
      const cat = dbState.categories.find((c) => c.id === categoryId);
      if (!cat) throw new Error('Category not found.');

      const subIds = dbState.subcategories
        .filter((s) => s.categoryId === categoryId)
        .map((s) => s.id);
      const prodsToDelete = dbState.products.filter((p) => p.categoryId === categoryId);
      const prodIds = prodsToDelete.map((p) => p.id);
      const skuIds = prodsToDelete.map((p) => p.skuId);

      dbState.categories = dbState.categories.filter((c) => c.id !== categoryId);
      dbState.subcategories = dbState.subcategories.filter((s) => s.categoryId !== categoryId);
      dbState.subcategory_groups = (dbState.subcategory_groups || []).filter((g) => g.categoryId !== categoryId && !subIds.includes(g.subcategoryId));
      dbState.group_items = (dbState.group_items || []).filter((i) => i.categoryId !== categoryId && !subIds.includes(i.subcategoryId));
      dbState.products = dbState.products.filter((p) => !prodIds.includes(p.id));
      dbState.skus = dbState.skus.filter((s) => !skuIds.includes(s.id));
      dbState.stock = dbState.stock.filter((s) => !prodIds.includes(s.productId));
      dbState.prices = dbState.prices.filter((p) => !prodIds.includes(p.productId));
      dbState.gst = dbState.gst.filter((g) => !prodIds.includes(g.productId));

      recordAuditLog({
        session,
        actionType: 'DELETE_CATEGORY',
        entityType: 'CATEGORY',
        entityId: categoryId,
        fieldChanged: 'record',
        previousValue: `${cat.name} (${subIds.length} subcategories, ${prodIds.length} products)`,
        newValue: 'DELETED',
        description: `Deleted category "${cat.name}" along with ${subIds.length} subcategories and ${prodIds.length} products.`
      });
      saveDatabase();
      return {
        deletedCategoryName: cat.name,
        deletedSubcategories: subIds.length,
        deletedProducts: prodIds.length
      };
    },

    toggleSubcategoryStatus(subcategoryId) {
      const session = requireSuperAdmin();
      const sub = dbState.subcategories.find((s) => s.id === subcategoryId);
      if (!sub) throw new Error('Subcategory not found.');
      const prev = sub.status;
      sub.status = sub.status === 'Inactive' ? 'Active' : 'Inactive';
      sub.updatedAt = new Date().toISOString();

      recordAuditLog({
        session,
        actionType: 'TOGGLE_SUBCATEGORY_STATUS',
        entityType: 'SUBCATEGORY',
        entityId: sub.id,
        fieldChanged: 'status',
        previousValue: prev,
        newValue: sub.status,
        description: `${sub.status === 'Active' ? 'Enabled' : 'Disabled'} subcategory "${sub.name}".`
      });
      saveDatabase();
      return sub;
    },

    deleteSubcategory(subcategoryId) {
      const session = requireSuperAdmin();
      const sub = dbState.subcategories.find((s) => s.id === subcategoryId);
      if (!sub) throw new Error('Subcategory not found.');

      const prodsToDelete = dbState.products.filter((p) => p.subcategoryId === subcategoryId);
      const prodIds = prodsToDelete.map((p) => p.id);
      const skuIds = prodsToDelete.map((p) => p.skuId);

      dbState.subcategories = dbState.subcategories.filter((s) => s.id !== subcategoryId);
      dbState.subcategory_groups = (dbState.subcategory_groups || []).filter((g) => g.subcategoryId !== subcategoryId);
      dbState.group_items = (dbState.group_items || []).filter((i) => i.subcategoryId !== subcategoryId);
      dbState.products = dbState.products.filter((p) => !prodIds.includes(p.id));
      dbState.skus = dbState.skus.filter((s) => !skuIds.includes(s.id));
      dbState.stock = dbState.stock.filter((s) => !prodIds.includes(s.productId));
      dbState.prices = dbState.prices.filter((p) => !prodIds.includes(p.productId));
      dbState.gst = dbState.gst.filter((g) => !prodIds.includes(g.productId));

      recordAuditLog({
        session,
        actionType: 'DELETE_SUBCATEGORY',
        entityType: 'SUBCATEGORY',
        entityId: subcategoryId,
        fieldChanged: 'record',
        previousValue: `${sub.name} (${prodIds.length} products)`,
        newValue: 'DELETED',
        description: `Deleted subcategory "${sub.name}" along with ${prodIds.length} products.`
      });
      saveDatabase();
      return {
        deletedSubcategoryName: sub.name,
        deletedProducts: prodIds.length
      };
    },

    // -------------------------------------------------------------------------
    // PRODUCT MASTER, VARIANT MANAGEMENT & MANUAL SKU MANAGEMENT
    // -------------------------------------------------------------------------
    getAdminProducts() {
      requireSuperAdmin();
      const joined = dbState.products.map(getJoinedProduct);
      return joined.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      );
    },

    getCustomerCatalogProducts() {
      requireAuth(['CUSTOMER', 'SUPER_ADMIN']);
      const joined = dbState.products.map(getJoinedProduct);

      const availableOnly = joined.filter(
        (p) =>
          p.adminConfiguredStatus === 'Active' &&
          p.status === 'Active' &&
          p.stock > 0 &&
          p.categoryStatus === 'Active' &&
          p.subcategoryStatus === 'Active'
      );

      availableOnly.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      );

      return availableOnly.map((p) => ({
        id: p.id,
        skuCode: p.skuCode,
        name: p.name,
        categoryId: p.categoryId,
        categoryName: p.categoryName,
        subcategoryId: p.subcategoryId,
        subcategoryName: p.subcategoryName,
        variantAttributes: p.variantAttributes || {},
        variantList: p.variantList || [],
        variantSummary: p.variantSummary || '',
        model: p.model || '',
        size: p.size || '',
        color: p.color || '',
        type: p.type || '',
        brand: p.brand || '',
        imageUrl: p.imageUrl,
        hsnCode: p.hsnCode,
        packSize: p.packSize,
        specifications: p.specifications,
        minimumOrderQuantity: p.minimumOrderQuantity,
        mrp: p.mrp || 0,
        groupMrp: p.groupMrp || 0,
        fpPrice: p.fpPrice,
        gstPercentage: p.gstPercentage,
        gstAmountPerUnit: p.gstAmountPerUnit,
        finalPriceInclGst: p.finalPriceInclGst,
        inStock: true,
        availabilityLabel: 'In Stock'
      }));
    },

    validateCustomerQuantity(productId, requestedQty) {
      requireAuth(['CUSTOMER', 'SUPER_ADMIN']);
      const prod = dbState.products.find((p) => p.id === productId);
      if (!prod || prod.status !== 'Active') {
        return {
          allowed: false,
          approvedQty: 0,
          reason: 'This product is no longer available.'
        };
      }
      const stockRow = dbState.stock.find((s) => s.productId === productId);
      const available = stockRow ? Math.max(0, parseInt(stockRow.quantity, 10) || 0) : 0;
      const minimumOrderQuantity =
        Number.isInteger(prod.minimumOrderQuantity) && prod.minimumOrderQuantity > 0
          ? prod.minimumOrderQuantity
          : 1;
      if (available <= 0) {
        return {
          allowed: false,
          approvedQty: 0,
          reason: 'This item is currently out of stock.'
        };
      }
      if (available < minimumOrderQuantity) {
        return {
          allowed: false,
          approvedQty: 0,
          reason: `Minimum order quantity is ${minimumOrderQuantity}, but only ${available} units are in stock.`
        };
      }
      const req = Math.max(1, parseInt(requestedQty, 10) || 1);
      if (req < minimumOrderQuantity) {
        return {
          allowed: false,
          approvedQty: minimumOrderQuantity,
          reason: `Minimum order quantity for this item is ${minimumOrderQuantity} units. Quantity adjusted to the minimum.`
        };
      }
      if (req > available) {
        return {
          allowed: false,
          approvedQty: available,
          reason: `Requested quantity (${req}) exceeds available stock limit (${available} units max).`
        };
      }
      return {
        allowed: true,
        approvedQty: req,
        reason: null
      };
    },

    checkSkuAvailability(skuCode, excludeProductId = null) {
      requireSuperAdmin();
      const clean = String(skuCode || '')
        .trim()
        .toUpperCase();
      if (!clean) return { valid: false, message: 'SKU Code must be manually entered by Super Admin.' };
      const existing = dbState.products.find(
        (p) => p.skuCode.toLowerCase() === clean.toLowerCase() && p.id !== excludeProductId
      );
      if (existing) {
        return {
          valid: false,
          message: `Duplicate SKU blocked: "${clean}" is already assigned to "${existing.name}".`
        };
      }
      return { valid: true, message: `SKU "${clean}" is unique and available.` };
    },

    checkDuplicateProduct({ name, categoryId, subcategoryId, excludeProductId = null }) {
      const normName = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (!normName || !categoryId || !subcategoryId) return null;
      const found = dbState.products.find((p) => {
        if (excludeProductId && p.id === excludeProductId) return false;
        if (p.categoryId !== categoryId) return false;
        if (p.subcategoryId !== subcategoryId) return false;
        return String(p.name || '').trim().toLowerCase().replace(/\s+/g, ' ') === normName;
      });
      return found ? getJoinedProduct(found) : null;
    },

    saveProduct(payload) {
      const session = requireSuperAdmin();
      let {
        id,
        skuCode,
        name,
        categoryId,
        subcategoryId,
        variantAttributes,
        mrp,
        fpPrice,
        stock,
        franchiseQuantity,
        lowStockThreshold,
        gstPercentage,
        hsnCode,
        packSize,
        specifications,
        minimumOrderQuantity,
        imageUrl,
        iconType,
        status,
        allowUpdateDuplicate
      } = payload;

      const cleanName = String(name || '').trim();
      if (!cleanName) throw new Error('Product Name is required.');
      if (!categoryId || !subcategoryId) {
        throw new Error('Both Category and Subcategory must be selected.');
      }

      // Duplicate product detection (Rules 1, 2, 3 & 4)
      const dupProd = this.checkDuplicateProduct({
        name: cleanName,
        categoryId,
        subcategoryId,
        excludeProductId: id || null
      });

      if (dupProd && !id) {
        if (!allowUpdateDuplicate) {
          const cat = dbState.categories.find((c) => c.id === categoryId);
          const sub = dbState.subcategories.find((s) => s.id === subcategoryId);
          const catName = cat ? cat.name : 'Category';
          const subName = sub ? sub.name : 'Subcategory';
          const err = new Error(`DUPLICATE_PRODUCT: A product named "${cleanName}" already exists under ${catName} › ${subName}.`);
          err.code = 'DUPLICATE_PRODUCT';
          err.existingProduct = dupProd;
          throw err;
        }
        id = dupProd.id;
      }

      // Internal SKU generation: SKU Code is NOT mandatory for any category
      let cleanSku = String(skuCode || '').trim().toUpperCase();
      if (!cleanSku) {
        if (id) {
          const existing = dbState.products.find((p) => p.id === id);
          if (existing && existing.skuCode) {
            cleanSku = existing.skuCode;
          }
        }
        if (!cleanSku) {
          cleanSku = 'CW-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
        }
      }

      // Franchise Quantity (Live Stock)
      const rawStock = stock !== undefined ? stock : franchiseQuantity;
      const numStock = parseInt(rawStock ?? 0, 10);
      if (isNaN(numStock) || numStock < 0) {
        throw new Error('Valid Franchise Quantity (whole number ≥ 0) is required.');
      }

      const existingProduct = id ? dbState.products.find((p) => p.id === id) : null;
      const rawMinimumOrderQuantity =
        minimumOrderQuantity !== undefined && minimumOrderQuantity !== ''
          ? minimumOrderQuantity
          : existingProduct
          ? existingProduct.minimumOrderQuantity || 1
          : 1;
      const numMinimumOrderQuantity = Number(rawMinimumOrderQuantity);
      if (!Number.isInteger(numMinimumOrderQuantity) || numMinimumOrderQuantity < 1) {
        throw new Error('Minimum Order Quantity must be a whole number greater than or equal to 1.');
      }

      // GST %
      const rawGst = gstPercentage !== undefined && gstPercentage !== '' ? gstPercentage : 12;
      const numGst = parseFloat(rawGst);
      if (isNaN(numGst) || numGst < 0 || numGst > 100) {
        throw new Error('Valid GST Percentage (0%–100%) is required.');
      }

      // Optional FP Price (defaults to existing or 0)
      let numFp = 0;
      if (fpPrice !== undefined && fpPrice !== null && String(fpPrice).trim() !== '') {
        const parsedFp = parseFloat(fpPrice);
        if (!isNaN(parsedFp) && parsedFp >= 0) {
          numFp = parsedFp;
        }
      } else if (id) {
        const existingPrice = dbState.prices.find((pr) => pr.productId === id);
        if (existingPrice && !isNaN(existingPrice.fpPrice)) {
          numFp = existingPrice.fpPrice;
        }
      }

      // Optional MRP (defaults to existing or 0)
      let numMrp = 0;
      if (mrp !== undefined && mrp !== null && String(mrp).trim() !== '') {
        const parsedMrp = parseFloat(mrp);
        if (!isNaN(parsedMrp) && parsedMrp >= 0) {
          numMrp = Math.round(parsedMrp * 100) / 100;
        }
      } else if (id) {
        const existingMrp = dbState.products.find((p) => p.id === id)?.mrp;
        if (existingMrp) numMrp = existingMrp;
      }

      const cleanVariants = {};
      if (variantAttributes && typeof variantAttributes === 'object') {
        Object.keys(variantAttributes).forEach((k) => {
          const val = String(variantAttributes[k] || '').trim();
          if (k && val) {
            cleanVariants[String(k).trim()] = val;
          }
        });
      }

      // Automatically register any newly entered group values into group_items for the Sub-Category
      if (subcategoryId && Object.keys(cleanVariants).length > 0) {
        const subGroups = (dbState.subcategory_groups || []).filter(
          (g) => g.subcategoryId === subcategoryId
        );
        const nowIso = new Date().toISOString();
        Object.entries(cleanVariants).forEach(([grpName, grpVal]) => {
          const matchedGrp = subGroups.find(
            (g) => g.name.toLowerCase() === grpName.toLowerCase()
          );
          if (matchedGrp) {
            const existsItem = (dbState.group_items || []).some(
              (it) =>
                it.groupId === matchedGrp.id &&
                it.value.toLowerCase() === grpVal.toLowerCase()
            );
            if (!existsItem) {
              const existingCount = (dbState.group_items || []).filter(
                (it) => it.groupId === matchedGrp.id
              ).length;
              dbState.group_items.push({
                id: 'gitem-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
                categoryId,
                subcategoryId,
                groupId: matchedGrp.id,
                value: grpVal,
                mrp: 0,
                sortOrder: existingCount + 1,
                status: 'Active',
                createdAt: nowIso,
                updatedAt: nowIso
              });
            }
          }
        });
      }

      // If no explicit MRP was entered on the product, inherit any active Sub-Category Group MRP
      if (numMrp <= 0 && subcategoryId) {
        const activeSubcatGroups = getOrderedGroupsForSubcategory(subcategoryId, true);
        activeSubcatGroups.forEach((grp) => {
          const gMrp = parseFloat(grp.mrp);
          if (!isNaN(gMrp) && gMrp > 0) {
            const matchedVal = cleanVariants[grp.name];
            if (matchedVal || numMrp <= 0) {
              numMrp = gMrp;
            }
          }
        });
      }

      const now = new Date().toISOString();
      const configuredStatus = status === 'Inactive' ? 'Inactive' : 'Active';

      if (id) {
        const prod = dbState.products.find((p) => p.id === id);
        if (!prod) throw new Error('Product not found.');

        const skuRow = dbState.skus.find((s) => s.id === prod.skuId);
        const stockRow = dbState.stock.find((s) => s.productId === prod.id);
        const priceRow = dbState.prices.find((p) => p.productId === prod.id);
        const gstRow = dbState.gst.find((g) => g.productId === prod.id);

        if (prod.skuCode !== cleanSku) {
          recordAuditLog({
            session,
            actionType: 'UPDATE_SKU',
            entityType: 'PRODUCT',
            entityId: prod.id,
            skuCode: cleanSku,
            fieldChanged: 'skuCode',
            previousValue: prod.skuCode,
            newValue: cleanSku,
            description: `Changed SKU from ${prod.skuCode} to ${cleanSku} for "${cleanName}".`
          });
        }

        if (priceRow && +priceRow.fpPrice !== +numFp) {
          recordAuditLog({
            session,
            actionType: 'UPDATE_FP_PRICE',
            entityType: 'PRODUCT',
            entityId: prod.id,
            skuCode: cleanSku,
            fieldChanged: 'fpPrice',
            previousValue: `₹${Number(priceRow.fpPrice).toFixed(2)}`,
            newValue: `₹${numFp.toFixed(2)}`,
            description: `Updated FP Price for SKU ${cleanSku} ("${cleanName}").`
          });
        }

        if (priceRow && mrp !== undefined && +(priceRow.mrp || prod.mrp || 0) !== +numMrp) {
          recordAuditLog({
            session,
            actionType: 'UPDATE_MRP',
            entityType: 'PRODUCT',
            entityId: prod.id,
            skuCode: cleanSku,
            fieldChanged: 'mrp',
            previousValue: `₹${Number(priceRow.mrp || prod.mrp || 0).toFixed(2)}`,
            newValue: `₹${numMrp.toFixed(2)}`,
            description: `Updated MRP for SKU ${cleanSku} ("${cleanName}").`
          });
        }

        if (stockRow && parseInt(stockRow.quantity, 10) !== numStock) {
          recordAuditLog({
            session,
            actionType: 'UPDATE_STOCK',
            entityType: 'PRODUCT',
            entityId: prod.id,
            skuCode: cleanSku,
            fieldChanged: 'stock',
            previousValue: String(stockRow.quantity),
            newValue: String(numStock),
            description: `Updated live stock for SKU ${cleanSku} from ${stockRow.quantity} to ${numStock}.`
          });
        }

        if (gstRow && +gstRow.gstPercentage !== +numGst) {
          recordAuditLog({
            session,
            actionType: 'UPDATE_GST',
            entityType: 'PRODUCT',
            entityId: prod.id,
            skuCode: cleanSku,
            fieldChanged: 'gstPercentage',
            previousValue: `${gstRow.gstPercentage}%`,
            newValue: `${numGst}%`,
            description: `Updated GST rate for SKU ${cleanSku} from ${gstRow.gstPercentage}% to ${numGst}%.`
          });
        }

        if ((prod.minimumOrderQuantity || 1) !== numMinimumOrderQuantity) {
          recordAuditLog({
            session,
            actionType: 'UPDATE_PRODUCT',
            entityType: 'PRODUCT',
            entityId: prod.id,
            skuCode: cleanSku,
            fieldChanged: 'minimumOrderQuantity',
            previousValue: String(prod.minimumOrderQuantity || 1),
            newValue: String(numMinimumOrderQuantity),
            description: `Updated minimum order quantity for SKU ${cleanSku} from ${prod.minimumOrderQuantity || 1} to ${numMinimumOrderQuantity}.`
          });
        }

        if (prod.status !== configuredStatus || prod.name !== cleanName) {
          recordAuditLog({
            session,
            actionType: 'UPDATE_PRODUCT',
            entityType: 'PRODUCT',
            entityId: prod.id,
            skuCode: cleanSku,
            fieldChanged: 'name/status',
            previousValue: `${prod.name} [${prod.status}]`,
            newValue: `${cleanName} [${configuredStatus}]`,
            description: `Updated product details/status for SKU ${cleanSku}.`
          });
        }

        const isDirectImageUri = (val) =>
          /^(data:|https?:\/\/|\/|\.\/|\.\.\/|assets\/)/i.test(String(val || '').trim());

        prod.skuCode = cleanSku;
        prod.name = cleanName;
        prod.minimumOrderQuantity = numMinimumOrderQuantity;
        prod.categoryId = categoryId;
        prod.subcategoryId = subcategoryId;
        if (variantAttributes !== undefined) {
          prod.variantAttributes = cleanVariants;
        }
        if (mrp !== undefined) {
          prod.mrp = numMrp;
        }
        prod.hsnCode = String(hsnCode || '').trim();
        prod.packSize = String(packSize || '1 Unit').trim();
        prod.specifications = String(specifications || '').trim();
        if (imageUrl === 'REMOVE' || imageUrl === '') {
          if (imageUrl === 'REMOVE') {
            prod.imageUrl = '';
          }
        } else if (imageUrl) {
          prod.imageUrl = isDirectImageUri(imageUrl) ? imageUrl : '';
        }
        prod.status = configuredStatus;
        prod.updatedAt = now;

        if (skuRow) {
          skuRow.skuCode = cleanSku;
          skuRow.categoryId = categoryId;
          skuRow.subcategoryId = subcategoryId;
        }
        if (stockRow) {
          stockRow.skuCode = cleanSku;
          stockRow.quantity = numStock;
          stockRow.lowStockThreshold = parseInt(lowStockThreshold, 10) || 10;
          stockRow.updatedBy = session.userId;
          stockRow.updatedAt = now;
        }
        if (priceRow) {
          priceRow.skuCode = cleanSku;
          priceRow.fpPrice = numFp;
          if (mrp !== undefined) {
            priceRow.mrp = numMrp;
          }
          priceRow.updatedBy = session.userId;
          priceRow.updatedAt = now;
        }
        if (gstRow) {
          gstRow.skuCode = cleanSku;
          gstRow.gstPercentage = numGst;
          gstRow.hsnCode = prod.hsnCode;
          gstRow.updatedBy = session.userId;
          gstRow.updatedAt = now;
        }

        saveDatabase();
        return getJoinedProduct(prod);
      } else {
        const suffix = Date.now() + '-' + Math.random().toString(36).slice(2, 5);
        const skuId = 'sku-' + suffix;
        const prodId = 'prd-' + suffix;

        const isDirectImageUri = (val) =>
          /^(data:|https?:\/\/|\/|\.\/|\.\.\/|assets\/)/i.test(String(val || '').trim());

        const finalImg =
          imageUrl && imageUrl !== 'REMOVE' && isDirectImageUri(imageUrl) ? imageUrl : '';

        dbState.skus.push({
          id: skuId,
          skuCode: cleanSku,
          categoryId,
          subcategoryId,
          createdBy: session.userId,
          createdAt: now
        });

        const newProd = {
          id: prodId,
          skuId,
          skuCode: cleanSku,
          categoryId,
          subcategoryId,
          variantAttributes: cleanVariants,
          mrp: numMrp,
          name: cleanName,
          minimumOrderQuantity: numMinimumOrderQuantity,
          imageUrl: finalImg,
          hsnCode: String(hsnCode || '').trim(),
          packSize: String(packSize || '1 Unit').trim(),
          specifications: String(specifications || '').trim(),
          status: configuredStatus,
          createdAt: now,
          updatedAt: now
        };
        dbState.products.push(newProd);

        dbState.stock.push({
          id: 'stk-' + suffix,
          productId: prodId,
          skuCode: cleanSku,
          quantity: numStock,
          lowStockThreshold: parseInt(lowStockThreshold, 10) || 10,
          updatedBy: session.userId,
          updatedAt: now
        });

        dbState.prices.push({
          id: 'prc-' + suffix,
          productId: prodId,
          skuCode: cleanSku,
          mrp: numMrp,
          fpPrice: numFp,
          currency: 'INR',
          updatedBy: session.userId,
          updatedAt: now
        });

        dbState.gst.push({
          id: 'gst-' + suffix,
          productId: prodId,
          skuCode: cleanSku,
          gstPercentage: numGst,
          hsnCode: newProd.hsnCode,
          updatedBy: session.userId,
          updatedAt: now
        });

        recordAuditLog({
          session,
          actionType: 'CREATE_PRODUCT',
          entityType: 'PRODUCT',
          entityId: prodId,
          skuCode: cleanSku,
          fieldChanged: 'ALL',
          previousValue: 'NONE',
          newValue: `SKU: ${cleanSku} | Name: ${cleanName} | MRP: ₹${numMrp.toFixed(2)} | FP: ₹${numFp.toFixed(2)} | Stock: ${numStock} | GST: ${numGst}%`,
          description: `Created new product "${cleanName}" with manually assigned SKU ${cleanSku}.`
        });

        saveDatabase();
        return getJoinedProduct(newProd);
      }
    },

    quickUpdateProductStockAndPrice({ productId, mrp, fpPrice, stock, gstPercentage, status, imageUrl }) {
      const session = requireSuperAdmin();
      const prod = dbState.products.find((p) => p.id === productId);
      if (!prod) throw new Error('Product not found.');

      const joined = getJoinedProduct(prod);
      return this.saveProduct({
        id: prod.id,
        skuCode: prod.skuCode,
        name: prod.name,
        categoryId: prod.categoryId,
        subcategoryId: prod.subcategoryId,
        variantAttributes: prod.variantAttributes,
        mrp: mrp !== undefined ? mrp : joined.mrp,
        fpPrice: fpPrice !== undefined ? fpPrice : joined.fpPrice,
        stock: stock !== undefined ? stock : joined.stock,
        lowStockThreshold: joined.lowStockThreshold,
        gstPercentage: gstPercentage !== undefined ? gstPercentage : joined.gstPercentage,
        hsnCode: prod.hsnCode,
        packSize: prod.packSize,
        specifications: prod.specifications,
        imageUrl: imageUrl !== undefined ? imageUrl : prod.imageUrl,
        status: status !== undefined ? status : joined.adminConfiguredStatus
      });
    },

    updateProductImage(productId, imageUrl, options = {}) {
      const session = requireSuperAdmin();
      const prod = dbState.products.find((p) => p.id === productId);
      if (!prod) throw new Error('Product not found.');

      const cleanUrl = String(imageUrl || '').trim();
      prod.imageUrl = cleanUrl === 'REMOVE' ? '' : cleanUrl;
      prod.updatedAt = nowIso();

      recordAuditLog({
        session,
        actionType: 'UPDATE_PRODUCT',
        entityType: 'PRODUCT',
        entityId: prod.id,
        skuCode: prod.skuCode,
        fieldChanged: 'imageUrl',
        previousValue: 'IMAGE',
        newValue: prod.imageUrl ? 'UPLOADED_IMAGE' : 'DEFAULT_ICON',
        description: `Updated product photo for SKU ${prod.skuCode} (${prod.name}).`
      });

      saveDatabase(true, !options.silent);
      return getJoinedProduct(prod);
    },

    deleteOrDeactivateProduct(productId, mode = 'deactivate') {
      const session = requireSuperAdmin();
      const prod = dbState.products.find((p) => p.id === productId);
      if (!prod) throw new Error('Product not found.');

      if (mode === 'delete') {
        const deletedSku = prod.skuCode;
        const deletedName = prod.name;

        dbState.products = dbState.products.filter((p) => p.id !== productId);
        dbState.skus = dbState.skus.filter((s) => s.id !== prod.skuId);
        dbState.stock = dbState.stock.filter((s) => s.productId !== productId);
        dbState.prices = dbState.prices.filter((p) => p.productId !== productId);
        dbState.gst = dbState.gst.filter((g) => g.productId !== productId);

        recordAuditLog({
          session,
          actionType: 'DELETE_PRODUCT',
          entityType: 'PRODUCT',
          entityId: productId,
          skuCode: deletedSku,
          fieldChanged: 'record',
          previousValue: `${deletedSku} - ${deletedName}`,
          newValue: 'DELETED',
          description: `Permanently deleted product ${deletedSku} ("${deletedName}").`
        });
        saveDatabase();
        return {
          action: 'deleted',
          skuCode: deletedSku,
          productName: deletedName,
          message: `Product "${deletedName}" (SKU: ${deletedSku}) has been permanently deleted.`
        };
      } else {
        const prev = prod.status === 'Inactive' ? 'Inactive' : 'Active';
        prod.status = prev === 'Inactive' ? 'Active' : 'Inactive';
        prod.updatedAt = new Date().toISOString();
        recordAuditLog({
          session,
          actionType: 'TOGGLE_PRODUCT_STATUS',
          entityType: 'PRODUCT',
          entityId: prod.id,
          skuCode: prod.skuCode,
          fieldChanged: 'status',
          previousValue: prev,
          newValue: prod.status,
          description: `${prod.status === 'Active' ? 'Enabled' : 'Disabled'} product SKU ${prod.skuCode} ("${prod.name}").`
        });
        saveDatabase();
        return { action: 'status_changed', status: prod.status, skuCode: prod.skuCode, name: prod.name };
      }
    },

    // -------------------------------------------------------------------------
    // EXCEL / CSV BULK IMPORT VALIDATION & EXECUTION ENGINE (6 MANDATORY/CATALOG FIELDS)
    // 1. Product Category  2. Subcategory  3. Product Name
    // 4. Franchise Quantity  5. GST  6. Product Status (Active/Inactive)
    // SKU Code and HSN Code are NOT mandatory and not required.
    // -------------------------------------------------------------------------
    validateBulkImportRows(rows, options = {}) {
      requireSuperAdmin();
      const duplicateHandling = String(options.duplicateHandling || 'UPDATE').toUpperCase(); // 'UPDATE' or 'SKIP'
      const seenInFile = new Map(); // key -> first rowNumber
      const existingUpdates = [];
      const newProductsToAdd = [];
      const skippedDuplicates = [];
      const failedRecords = [];

      rows.forEach((rawRow, idx) => {
        const rowNumber = rawRow._rowNumber || idx + 2;
        const productName = String(rawRow.productName || rawRow.name || '').trim();
        const categoryName = String(rawRow.category || rawRow.categoryName || '').trim();
        const subcategoryName = String(rawRow.subcategory || rawRow.subcategoryName || '').trim();
        const skuCode = String(rawRow.sku || rawRow.skuCode || '').trim().toUpperCase();

        // Franchise Quantity (Live Stock)
        const rawStockVal = rawRow.franchiseQuantity !== undefined 
          ? rawRow.franchiseQuantity 
          : (rawRow.stock !== undefined ? rawRow.stock : rawRow.liveStock);
        const stock = rawStockVal !== undefined && rawStockVal !== null && String(rawStockVal).trim() !== ''
          ? parseInt(rawStockVal, 10)
          : NaN;

        // GST % (Default 12% if blank)
        const rawGstVal = rawRow.gst !== undefined 
          ? rawRow.gst 
          : (rawRow.gstPercentage !== undefined ? rawRow.gstPercentage : undefined);
        const gstPercentage = rawGstVal !== undefined && rawGstVal !== null && String(rawGstVal).trim() !== ''
          ? parseFloat(rawGstVal)
          : 12;

        const rawStatus = String(rawRow.status || rawRow.productStatus || 'Active').trim();
        const productStatus = rawStatus.toLowerCase() === 'inactive' ? 'Inactive' : 'Active';

        // FP Price
        const rawFpVal = rawRow.fpPrice !== undefined 
          ? rawRow.fpPrice 
          : (rawRow['fp price'] !== undefined 
              ? rawRow['fp price'] 
              : (rawRow['FP Price'] !== undefined 
                  ? rawRow['FP Price'] 
                  : (rawRow.price !== undefined ? rawRow.price : undefined)));
        let fpPrice = undefined;
        if (rawFpVal !== undefined && rawFpVal !== null && String(rawFpVal).trim() !== '') {
          const parsedFp = parseFloat(rawFpVal);
          if (!isNaN(parsedFp) && parsedFp >= 0) {
            fpPrice = Math.round(parsedFp * 100) / 100;
          }
        }

        // Optional MRP
        const parsedMrp = parseFloat(rawRow.mrp);
        const mrp = !isNaN(parsedMrp) && parsedMrp >= 0 ? Math.round(parsedMrp * 100) / 100 : undefined;

        const imageUrl = String(rawRow.imageUrl || rawRow.image || '').trim();
        const hsnCode = String(rawRow.hsnCode || rawRow.hsn || '').trim();
        const packSize = String(rawRow.packSize || '1 Unit').trim();
        const specifications = String(rawRow.specifications || '').trim();

        // 1. Validate Product Name
        if (!productName) {
          failedRecords.push({
            rowNumber,
            productName: '(Missing)',
            categoryName: categoryName || '(Missing)',
            subcategoryName: subcategoryName || '(Missing)',
            fpPrice: rawFpVal || '',
            franchiseQuantity: isNaN(stock) ? (rawStockVal || '') : stock,
            stock: isNaN(stock) ? 0 : stock,
            gstPercentage: isNaN(gstPercentage) ? (rawGstVal || '') : gstPercentage,
            productStatus,
            status: productStatus,
            resultStatus: 'Validation Failed',
            reason: 'Product Name is missing or empty.'
          });
          return;
        }

        // 2. Validate Category & Subcategory
        if (!categoryName || !subcategoryName) {
          failedRecords.push({
            rowNumber,
            productName,
            categoryName: categoryName || '(Missing)',
            subcategoryName: subcategoryName || '(Missing)',
            fpPrice: rawFpVal || '',
            franchiseQuantity: isNaN(stock) ? (rawStockVal || '') : stock,
            stock: isNaN(stock) ? 0 : stock,
            gstPercentage: isNaN(gstPercentage) ? (rawGstVal || '') : gstPercentage,
            productStatus,
            status: productStatus,
            resultStatus: 'Validation Failed',
            reason: 'Both Product Category and Subcategory are required.'
          });
          return;
        }

        // 3. Validate FP Price (if entered, must be ≥ 0)
        if (rawFpVal !== undefined && rawFpVal !== null && String(rawFpVal).trim() !== '' && (isNaN(parseFloat(rawFpVal)) || parseFloat(rawFpVal) < 0)) {
          failedRecords.push({
            rowNumber,
            productName,
            categoryName,
            subcategoryName,
            fpPrice: rawFpVal || '',
            franchiseQuantity: isNaN(stock) ? (rawStockVal || '') : stock,
            stock: isNaN(stock) ? 0 : stock,
            gstPercentage: isNaN(gstPercentage) ? (rawGstVal || '') : gstPercentage,
            productStatus,
            status: productStatus,
            resultStatus: 'Validation Failed',
            reason: `Invalid FP Price "${rawFpVal}". Must be a valid positive number (≥ 0).`
          });
          return;
        }

        // 4. Validate Franchise Quantity (Live Stock)
        if (isNaN(stock) || stock < 0) {
          failedRecords.push({
            rowNumber,
            productName,
            categoryName,
            subcategoryName,
            fpPrice: rawFpVal || '',
            franchiseQuantity: rawStockVal || '',
            stock: 0,
            gstPercentage: isNaN(gstPercentage) ? (rawGstVal || '') : gstPercentage,
            productStatus,
            status: productStatus,
            resultStatus: 'Validation Failed',
            reason: `Invalid Franchise Quantity "${rawStockVal ?? ''}". Must be a non-negative whole number (≥ 0).`
          });
          return;
        }

        // 5. Validate GST %
        if (isNaN(gstPercentage) || gstPercentage < 0 || gstPercentage > 100) {
          failedRecords.push({
            rowNumber,
            productName,
            categoryName,
            subcategoryName,
            fpPrice: rawFpVal || '',
            franchiseQuantity: stock,
            stock,
            gstPercentage: rawGstVal || '',
            productStatus,
            status: productStatus,
            resultStatus: 'Validation Failed',
            reason: `Invalid GST % "${rawGstVal}". Must be a percentage between 0 and 100.`
          });
          return;
        }

        // 5. In-File Duplicate Detection (Rules 5 & 8: ignore leading/trailing spaces, case-insensitive)
        const fileDupKey = `${categoryName.toLowerCase().trim()}:::${subcategoryName.toLowerCase().trim()}:::${productName.toLowerCase().trim()}`;
        if (seenInFile.has(fileDupKey)) {
          const firstSeenRow = seenInFile.get(fileDupKey);
          skippedDuplicates.push({
            rowNumber,
            productName,
            categoryName,
            subcategoryName,
            fpPrice: fpPrice !== undefined ? fpPrice : (rawFpVal || 0),
            franchiseQuantity: stock,
            stock,
            gstPercentage,
            productStatus,
            status: productStatus,
            resultStatus: 'Skipped Duplicate (In-File)',
            reason: `Duplicate row in uploaded file: Product "${productName}" in "${categoryName} › ${subcategoryName}" already appeared on row ${firstSeenRow}. Skipped duplicate.`,
            isFileDuplicate: true
          });
          return;
        }
        seenInFile.set(fileDupKey, rowNumber);

        // 6. Database Duplicate Detection (Rules 1, 2 & 8: Category + Subcategory + Product Name)
        const normName = productName.toLowerCase().trim();
        const normCat = categoryName.toLowerCase().trim();
        const normSub = subcategoryName.toLowerCase().trim();

        let existingProd = dbState.products.find((p) => {
          if (p.name.toLowerCase().trim() !== normName) return false;
          const cat = dbState.categories.find((c) => c.id === p.categoryId);
          if (!cat || cat.name.toLowerCase().trim() !== normCat) return false;
          const sub = dbState.subcategories.find((s) => s.id === p.subcategoryId);
          if (!sub || sub.name.toLowerCase().trim() !== normSub) return false;
          return true;
        });

        // Fallback match by SKU code if supplied in file
        if (!existingProd && skuCode) {
          existingProd = dbState.products.find(
            (p) => p.skuCode && p.skuCode.toLowerCase() === skuCode.toLowerCase()
          );
        }

        // Fallback match by product name alone across categories
        if (!existingProd) {
          existingProd = dbState.products.find(
            (p) => p.name.toLowerCase().trim() === normName
          );
        }

        if (existingProd) {
          const currentJoined = getJoinedProduct(existingProd);
          // Matched an existing product
          if (duplicateHandling === 'SKIP') {
            skippedDuplicates.push({
              rowNumber,
              productName,
              categoryName,
              subcategoryName,
              fpPrice: fpPrice !== undefined ? fpPrice : currentJoined.fpPrice,
              franchiseQuantity: stock,
              stock,
              gstPercentage,
              productStatus,
              status: productStatus,
              resultStatus: 'Skipped Duplicate',
              reason: `Duplicate Product: "${productName}" already exists in the catalog under ${categoryName} › ${subcategoryName}. Skipped as requested.`,
              isFileDuplicate: false
            });
            return;
          }

          // duplicateHandling === 'UPDATE'
          existingUpdates.push({
            rowNumber,
            productId: existingProd.id,
            skuCode: existingProd.skuCode,
            oldName: currentJoined.name,
            newName: productName,
            categoryName: categoryName || currentJoined.categoryName,
            subcategoryName: subcategoryName || currentJoined.subcategoryName,
            oldStock: currentJoined.stock,
            newStock: stock,
            oldGst: currentJoined.gstPercentage,
            newGst: gstPercentage,
            oldFpPrice: currentJoined.fpPrice,
            newFpPrice: fpPrice !== undefined ? fpPrice : currentJoined.fpPrice,
            oldMrp: currentJoined.mrp || 0,
            newMrp: mrp !== undefined ? mrp : (currentJoined.mrp || 0),
            hsnCode: hsnCode || currentJoined.hsnCode,
            packSize: packSize || currentJoined.packSize,
            specifications: specifications || currentJoined.specifications,
            imageUrl: imageUrl || currentJoined.imageUrl,
            productStatus,
            resultStatus: 'Updated Product'
          });
        } else {
          // Valid new product
          const autoSku = skuCode || ('CW-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase());
          newProductsToAdd.push({
            rowNumber,
            skuCode: autoSku,
            productName,
            categoryName,
            subcategoryName,
            stock,
            franchiseQuantity: stock,
            gstPercentage,
            fpPrice: fpPrice !== undefined ? fpPrice : 0,
            mrp: mrp !== undefined ? mrp : 0,
            hsnCode,
            packSize,
            specifications,
            imageUrl: imageUrl || undefined,
            productStatus,
            resultStatus: 'New Product'
          });
        }
      });

      return {
        totalRowsFound: rows.length,
        duplicateHandling,
        existingUpdates,
        newProductsToAdd,
        newSkusDetected: newProductsToAdd,
        skippedDuplicates,
        failedRecords,
        invalidRows: failedRecords,
        duplicateRowsInFile: skippedDuplicates.filter((s) => s.isFileDuplicate)
      };
    },

    applyValidatedImport({ validationResult, confirmCreateNewSkus = false, createNewProducts = false }) {
      const session = requireSuperAdmin();
      if (!validationResult) throw new Error('No validation preview data provided.');

      const allowCreateNew = confirmCreateNewSkus || createNewProducts;
      let updatedCount = 0;
      let createdCount = 0;

      (validationResult.existingUpdates || []).forEach((upd) => {
        const prod = dbState.products.find((p) => p.id === upd.productId);
        if (!prod) return;

        let catId = prod.categoryId;
        let subId = prod.subcategoryId;
        if (upd.categoryName) {
          let foundCat = dbState.categories.find(
            (c) => c.name.toLowerCase().trim() === upd.categoryName.toLowerCase().trim()
          );
          if (foundCat) {
            catId = foundCat.id;
            if (upd.subcategoryName) {
              let foundSub = dbState.subcategories.find(
                (s) =>
                  s.categoryId === foundCat.id &&
                  s.name.toLowerCase().trim() === upd.subcategoryName.toLowerCase().trim()
              );
              if (foundSub) {
                subId = foundSub.id;
              }
            }
          }
        }

        this.saveProduct({
          id: prod.id,
          skuCode: prod.skuCode,
          name: upd.newName,
          categoryId: catId,
          subcategoryId: subId,
          mrp: upd.newMrp,
          fpPrice: upd.newFpPrice,
          stock: upd.newStock,
          gstPercentage: upd.newGst,
          hsnCode: upd.hsnCode,
          packSize: upd.packSize,
          specifications: upd.specifications,
          imageUrl: upd.imageUrl,
          status: upd.productStatus,
          allowUpdateDuplicate: true
        });
        updatedCount++;
      });

      if (allowCreateNew && Array.isArray(validationResult.newProductsToAdd || validationResult.newSkusDetected)) {
        const list = validationResult.newProductsToAdd || validationResult.newSkusDetected;
        list.forEach((nw) => {
          let cat = dbState.categories.find(
            (c) => c.name.toLowerCase().trim() === nw.categoryName.toLowerCase().trim()
          );
          if (!cat) {
            cat = this.saveCategory({
              name: nw.categoryName,
              status: 'Active'
            });
          }
          let sub = dbState.subcategories.find(
            (s) =>
              s.categoryId === cat.id &&
              s.name.toLowerCase().trim() === nw.subcategoryName.toLowerCase().trim()
          );
          if (!sub) {
            sub = this.saveSubcategory({
              categoryId: cat.id,
              name: nw.subcategoryName,
              status: 'Active'
            });
          }

          this.saveProduct({
            skuCode: nw.skuCode,
            name: nw.productName,
            categoryId: cat.id,
            subcategoryId: sub.id,
            mrp: nw.mrp || 0,
            fpPrice: nw.fpPrice || 0,
            stock: nw.stock,
            gstPercentage: nw.gstPercentage,
            hsnCode: nw.hsnCode,
            packSize: nw.packSize,
            specifications: nw.specifications,
            imageUrl: nw.imageUrl || undefined,
            status: nw.productStatus,
            allowUpdateDuplicate: true
          });
          createdCount++;
        });
      }

      recordAuditLog({
        session,
        actionType: 'BULK_FILE_IMPORT',
        entityType: 'PRODUCT_MASTER',
        entityId: 'BULK_IMPORT',
        fieldChanged: 'bulk_sync',
        previousValue: `${validationResult.totalRowsFound} rows parsed`,
        newValue: `${updatedCount} updated, ${createdCount} created, ${(validationResult.skippedDuplicates || []).length} skipped`,
        description: `Completed product Excel import: ${updatedCount} products updated, ${createdCount} new products created, ${(validationResult.skippedDuplicates || []).length} skipped duplicates.`
      });

      saveDatabase(true, true);
      return {
        updatedCount,
        createdCount,
        skippedCount: (validationResult.skippedDuplicates || []).length,
        failedCount: (validationResult.failedRecords || []).length
      };
    },

    // -------------------------------------------------------------------------
    // CUSTOMER / STORE USER MANAGEMENT (Manual Creation Only by Super Admin)
    // -------------------------------------------------------------------------
    getCustomersList() {
      requireAuth(['SUPER_ADMIN', 'BILLING_EMPLOYEE']);
      return [...dbState.customers].sort((a, b) =>
        a.customerCode.localeCompare(b.customerCode, undefined, { numeric: true })
      );
    },

    getOwnCustomerProfile() {
      const session = requireAuth(['CUSTOMER']);
      const cust = dbState.customers.find((c) => c.id === session.customerId);
      if (!cust) throw new Error('Customer store profile not found.');
      return { ...cust };
    },

    saveCustomerAccount(payload) {
      const session = requireSuperAdmin();
      const {
        id,
        customerCode,
        storeName,
        contactPerson,
        email,
        password,
        phone,
        storeDetails,
        address,
        city,
        state,
        pincode,
        gstNumber,
        status
      } = payload;

      const cleanCode = String(customerCode || '').trim();
      const cleanStore = String(storeName || '').trim();
      const cleanEmail = String(email || '')
        .trim()
        .toLowerCase();
      const cleanPhone = String(phone || '').trim();
      const cleanAddress = String(address || '').trim();

      if (!cleanCode || !cleanStore || !cleanPhone || !cleanAddress) {
        throw new Error(
          'Customer/Store Name, Customer Login ID, Contact Details, and Address are required.'
        );
      }

      const dupCustomer = dbState.customers.find(
        (c) =>
          c.id !== id &&
          (c.customerCode.toLowerCase() === cleanCode.toLowerCase() ||
            (cleanEmail && c.email && c.email.toLowerCase() === cleanEmail))
      );
      if (dupCustomer) {
        throw new Error(
          `Duplicate Customer Login ID or Email: "${cleanCode}" is already assigned to "${dupCustomer.storeName}".`
        );
      }

      const now = new Date().toISOString();
      const cleanStatus = status === 'Inactive' ? 'Inactive' : 'Active';

      if (id) {
        const cust = dbState.customers.find((c) => c.id === id);
        if (!cust) throw new Error('Customer account not found.');
        const user = dbState.users.find((u) => u.id === cust.userId);

        const prevSnapshot = `${cust.storeName} (${cust.customerCode}) [${cust.status}]`;

        cust.customerCode = cleanCode;
        cust.storeName = cleanStore;
        cust.contactPerson = String(contactPerson || '').trim();
        cust.email = cleanEmail;
        cust.phone = cleanPhone;
        cust.storeDetails = String(storeDetails || '').trim();
        cust.address = cleanAddress;
        cust.city = String(city || '').trim();
        cust.state = String(state || '').trim();
        cust.pincode = String(pincode || '').trim();
        cust.gstNumber = String(gstNumber || '')
          .trim()
          .toUpperCase();
        cust.status = cleanStatus;
        cust.updatedAt = now;

        if (user) {
          user.userId = cleanCode;
          user.email = cleanEmail || null;
          user.fullName = cleanStore;
          user.status = cleanStatus;
          if (password && String(password).trim().length >= 3) {
            user.passwordHash = sha256Hash(String(password).trim());
          }
          user.updatedAt = now;
        }

        recordAuditLog({
          session,
          actionType: 'UPDATE_CUSTOMER',
          entityType: 'CUSTOMER',
          entityId: cust.id,
          fieldChanged: 'storeAccount',
          previousValue: prevSnapshot,
          newValue: `${cust.storeName} (${cust.customerCode}) [${cust.status}]`,
          description: `Updated customer store account ${cust.customerCode} (${cust.storeName}).`
        });

        saveDatabase();
        return cust;
      } else {
        if (!password || String(password).trim().length < 3) {
          throw new Error('Please enter a Password for the customer login account.');
        }

        const suffix = Date.now() + '-' + Math.random().toString(36).slice(2, 5);
        const userPk = 'usr-cust-' + suffix;
        const custPk = 'cust-' + suffix;

        dbState.users.push({
          id: userPk,
          userId: cleanCode,
          email: cleanEmail || null,
          passwordHash: sha256Hash(String(password).trim()),
          roleId: 'role-customer-store',
          roleCode: 'CUSTOMER',
          fullName: cleanStore,
          status: cleanStatus,
          lastLoginAt: null,
          createdAt: now,
          updatedAt: now
        });

        const newCust = {
          id: custPk,
          userId: userPk,
          customerCode: cleanCode,
          storeName: cleanStore,
          contactPerson: String(contactPerson || '').trim(),
          email: cleanEmail,
          phone: cleanPhone,
          storeDetails: String(storeDetails || '').trim(),
          address: cleanAddress,
          city: String(city || '').trim(),
          state: String(state || '').trim(),
          pincode: String(pincode || '').trim(),
          gstNumber: String(gstNumber || '')
            .trim()
            .toUpperCase(),
          status: cleanStatus,
          createdBy: session.userId,
          createdAt: now,
          updatedAt: now
        };
        dbState.customers.push(newCust);

        recordAuditLog({
          session,
          actionType: 'CREATE_CUSTOMER',
          entityType: 'CUSTOMER',
          entityId: custPk,
          fieldChanged: 'customerCode',
          previousValue: 'NONE',
          newValue: `${cleanCode} - ${cleanStore}`,
          description: `Created customer login credentials for "${cleanStore}" (Login ID: ${cleanCode}).`
        });

        saveDatabase();
        return newCust;
      }
    },

    toggleCustomerStatus(customerId) {
      const session = requireSuperAdmin();
      const cust = dbState.customers.find((c) => c.id === customerId);
      if (!cust) throw new Error('Customer account not found.');
      const user = dbState.users.find((u) => u.id === cust.userId);
      const prev = cust.status;
      const next = cust.status === 'Inactive' ? 'Active' : 'Inactive';
      const now = new Date().toISOString();

      cust.status = next;
      cust.updatedAt = now;
      if (user) {
        user.status = next;
        user.updatedAt = now;
      }

      recordAuditLog({
        session,
        actionType: 'TOGGLE_CUSTOMER_STATUS',
        entityType: 'CUSTOMER',
        entityId: cust.id,
        fieldChanged: 'status',
        previousValue: prev,
        newValue: next,
        description: `${next === 'Active' ? 'Enabled' : 'Disabled'} customer store account "${cust.storeName}" (${cust.customerCode}).`
      });
      saveDatabase();
      return cust;
    },

    deleteCustomerAccount(customerId) {
      const session = requireSuperAdmin();
      const cust = dbState.customers.find((c) => c.id === customerId);
      if (!cust) throw new Error('Customer account not found.');

      const deletedCode = cust.customerCode;
      const deletedStore = cust.storeName;
      const linkedUserId = cust.userId;

      dbState.customers = dbState.customers.filter((c) => c.id !== customerId);
      if (linkedUserId) {
        dbState.users = dbState.users.filter((u) => u.id !== linkedUserId);
      }

      recordAuditLog({
        session,
        actionType: 'DELETE_CUSTOMER',
        entityType: 'CUSTOMER',
        entityId: customerId,
        fieldChanged: 'record',
        previousValue: `${deletedCode} - ${deletedStore}`,
        newValue: 'DELETED',
        description: `Deleted customer store account "${deletedStore}" (Login ID: ${deletedCode}).`
      });
      saveDatabase();
      return {
        customerCode: deletedCode,
        storeName: deletedStore
      };
    },

    // -------------------------------------------------------------------------
    // EMPLOYEE / BILLING USER MANAGEMENT (SUPER ADMIN ONLY)
    // -------------------------------------------------------------------------
    getEmployeesList() {
      requireSuperAdmin();
      return [...dbState.employees];
    },

    saveEmployeeAccount(payload) {
      const session = requireSuperAdmin();
      const {
        id,
        employeeCode,
        fullName,
        email,
        password,
        phone,
        department,
        designation,
        status
      } = payload;

      const cleanCode = String(employeeCode || '').trim();
      const cleanName = String(fullName || '').trim();
      const cleanEmail = String(email || '')
        .trim()
        .toLowerCase();

      if (!cleanCode || !cleanName) {
        throw new Error('Employee Login ID and Full Name are required.');
      }

      const dup = dbState.employees.find(
        (e) =>
          e.id !== id &&
          (e.employeeCode.toLowerCase() === cleanCode.toLowerCase() ||
            (cleanEmail && e.email && e.email.toLowerCase() === cleanEmail))
      );
      if (dup) {
        throw new Error(`Employee Login ID "${cleanCode}" already exists.`);
      }

      const now = new Date().toISOString();
      const cleanStatus = status === 'Inactive' ? 'Inactive' : 'Active';

      if (id) {
        const emp = dbState.employees.find((e) => e.id === id);
        if (!emp) throw new Error('Employee record not found.');
        const user = dbState.users.find((u) => u.id === emp.userId);

        emp.employeeCode = cleanCode;
        emp.fullName = cleanName;
        emp.email = cleanEmail;
        emp.phone = String(phone || '').trim();
        emp.department = String(department || 'Billing & Order Processing').trim();
        emp.designation = String(designation || 'Billing Executive').trim();
        emp.status = cleanStatus;
        emp.updatedAt = now;

        if (user) {
          user.userId = cleanCode;
          user.email = cleanEmail || null;
          user.fullName = `${cleanName} (${emp.designation})`;
          user.status = cleanStatus;
          if (password && String(password).trim().length >= 3) {
            user.passwordHash = sha256Hash(String(password).trim());
          }
          user.updatedAt = now;
        }

        recordAuditLog({
          session,
          actionType: 'UPDATE_EMPLOYEE',
          entityType: 'EMPLOYEE',
          entityId: emp.id,
          fieldChanged: 'employeeAccount',
          previousValue: emp.employeeCode,
          newValue: `${emp.employeeCode} (${emp.status})`,
          description: `Updated billing employee account ${emp.employeeCode} (${emp.fullName}).`
        });

        saveDatabase();
        return emp;
      } else {
        if (!password || String(password).trim().length < 3) {
          throw new Error('Super Admin must set an initial Login Password for the employee.');
        }

        const suffix = Date.now() + '-' + Math.random().toString(36).slice(2, 5);
        const userPk = 'usr-emp-' + suffix;
        const empPk = 'emp-' + suffix;

        dbState.users.push({
          id: userPk,
          userId: cleanCode,
          email: cleanEmail || null,
          passwordHash: sha256Hash(String(password).trim()),
          roleId: 'role-billing-emp',
          roleCode: 'BILLING_EMPLOYEE',
          fullName: cleanName,
          status: cleanStatus,
          lastLoginAt: null,
          createdAt: now,
          updatedAt: now
        });

        const newEmp = {
          id: empPk,
          userId: userPk,
          employeeCode: cleanCode,
          fullName: cleanName,
          email: cleanEmail,
          phone: String(phone || '').trim(),
          department: String(department || 'Billing & Order Processing').trim(),
          designation: String(designation || 'Billing Executive').trim(),
          status: cleanStatus,
          createdBy: session.userId,
          createdAt: now,
          updatedAt: now
        };
        dbState.employees.push(newEmp);

        recordAuditLog({
          session,
          actionType: 'CREATE_EMPLOYEE',
          entityType: 'EMPLOYEE',
          entityId: empPk,
          fieldChanged: 'employeeCode',
          previousValue: 'NONE',
          newValue: `${cleanCode} - ${cleanName}`,
          description: `Created billing employee login ${cleanCode} for ${cleanName}.`
        });

        saveDatabase();
        return newEmp;
      }
    },

    toggleEmployeeStatus(employeeId) {
      const session = requireSuperAdmin();
      const emp = dbState.employees.find((e) => e.id === employeeId);
      if (!emp) throw new Error('Employee account not found.');
      const user = dbState.users.find((u) => u.id === emp.userId);
      const prev = emp.status;
      const next = emp.status === 'Inactive' ? 'Active' : 'Inactive';
      const now = new Date().toISOString();

      emp.status = next;
      emp.updatedAt = now;
      if (user) {
        user.status = next;
        user.updatedAt = now;
      }

      recordAuditLog({
        session,
        actionType: 'TOGGLE_EMPLOYEE_STATUS',
        entityType: 'EMPLOYEE',
        entityId: emp.id,
        fieldChanged: 'status',
        previousValue: prev,
        newValue: next,
        description: `${next === 'Active' ? 'Enabled' : 'Disabled'} billing employee account "${emp.fullName}" (${emp.employeeCode}).`
      });
      saveDatabase();
      return emp;
    },

    deleteEmployeeAccount(employeeId) {
      const session = requireSuperAdmin();
      const emp = dbState.employees.find((e) => e.id === employeeId);
      if (!emp) throw new Error('Employee account not found.');

      const deletedCode = emp.employeeCode;
      const deletedName = emp.fullName;
      const linkedUserId = emp.userId;

      dbState.employees = dbState.employees.filter((e) => e.id !== employeeId);
      if (linkedUserId) {
        dbState.users = dbState.users.filter((u) => u.id !== linkedUserId);
      }

      recordAuditLog({
        session,
        actionType: 'DELETE_EMPLOYEE',
        entityType: 'EMPLOYEE',
        entityId: employeeId,
        fieldChanged: 'record',
        previousValue: `${deletedCode} - ${deletedName}`,
        newValue: 'DELETED',
        description: `Deleted billing employee account "${deletedName}" (Login ID: ${deletedCode}).`
      });
      saveDatabase();
      return {
        employeeCode: deletedCode,
        fullName: deletedName
      };
    },

    // -------------------------------------------------------------------------
    // ORDER SUBMISSION, NOTIFICATION & ORDER MANAGEMENT
    // -------------------------------------------------------------------------
    submitCustomerOrder({ items, notes }) {
      const session = requireAuth(['CUSTOMER']);
      const customer = dbState.customers.find((c) => c.id === session.customerId);
      if (!customer || customer.status !== 'Active') {
        throw new Error('Your store account is not active for order submission.');
      }

      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('Your cart is empty. Please add products before submitting an order.');
      }

      const validatedLines = [];
      let orderSubtotal = 0;
      let orderGstAmount = 0;
      let totalUnits = 0;

      items.forEach((cartItem) => {
        const prod = dbState.products.find((p) => p.id === cartItem.productId);
        if (!prod || prod.status !== 'Active') {
          throw new Error(
            `Product "${cartItem.productName || cartItem.skuCode}" is no longer active.`
          );
        }

        const joined = getJoinedProduct(prod);
        const qty = parseInt(cartItem.quantity, 10);
        if (isNaN(qty) || qty <= 0) {
          throw new Error(`Invalid quantity for SKU ${joined.skuCode}.`);
        }

        if (qty < joined.minimumOrderQuantity) {
          throw new Error(
            `Minimum order quantity for "${joined.name}" (${joined.skuCode}) is ${joined.minimumOrderQuantity} units, but your order requested ${qty}.`
          );
        }

        if (qty > joined.stock) {
          throw new Error(
            `Stock limit exceeded for "${joined.name}" (${joined.skuCode}). Available stock is ${joined.stock}, but your order requested ${qty}.`
          );
        }

        const lineSubtotal = +(joined.fpPrice * qty).toFixed(2);
        const lineGst = +(lineSubtotal * (joined.gstPercentage / 100)).toFixed(2);
        const lineTotal = +(lineSubtotal + lineGst).toFixed(2);

        orderSubtotal = +(orderSubtotal + lineSubtotal).toFixed(2);
        orderGstAmount = +(orderGstAmount + lineGst).toFixed(2);
        totalUnits += qty;

        validatedLines.push({
          productId: joined.id,
          skuCode: joined.skuCode,
          productName: joined.name,
          categoryName: joined.categoryName,
          subcategoryName: joined.subcategoryName,
          variantAttributes: joined.variantAttributes || {},
          variantList: joined.variantList || [],
          variantSummary: joined.variantSummary || '',
          model: joined.model || '',
          size: joined.size || '',
          color: joined.color || '',
          type: joined.type || '',
          brand: joined.brand || '',
          hsnCode: joined.hsnCode,
          quantity: qty,
          fpPrice: joined.fpPrice,
          subtotal: lineSubtotal,
          gstPercentage: joined.gstPercentage,
          gstAmount: lineGst,
          totalAmount: lineTotal
        });
      });

      const orderGrandTotal = +(orderSubtotal + orderGstAmount).toFixed(2);
      const now = new Date().toISOString();

      dbState.meta.lastOrderSeq = (dbState.meta.lastOrderSeq || 100) + 1;
      const orderNumber = 'CW-' + String(dbState.meta.lastOrderSeq).padStart(6, '0');
      const orderId = 'ord-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5);

      const fullBillingAddress = [
        customer.address,
        customer.city,
        customer.state,
        customer.pincode
      ]
        .filter(Boolean)
        .join(', ');

      const newOrder = {
        id: orderId,
        orderNumber,
        customerId: customer.id,
        customerCode: customer.customerCode,
        storeName: customer.storeName,
        customerGst: customer.gstNumber || 'N/A',
        billingAddress: fullBillingAddress,
        customerPhone: customer.phone,
        itemCount: validatedLines.length,
        totalQuantity: totalUnits,
        subtotalAmount: orderSubtotal,
        gstAmount: orderGstAmount,
        totalAmount: orderGrandTotal,
        status: 'New',
        notes: String(notes || '').trim(),
        processedBy: null,
        createdAt: now,
        updatedAt: now
      };

      dbState.orders.unshift(newOrder);

      validatedLines.forEach((line, idx) => {
        dbState.order_items.push({
          id: `oi-${Date.now()}-${idx}`,
          orderId,
          ...line
        });

        const stockRow = dbState.stock.find((s) => s.productId === line.productId);
        const prodRow = dbState.products.find((p) => p.id === line.productId);
        if (stockRow) {
          const prevQty = stockRow.quantity;
          stockRow.quantity = Math.max(0, prevQty - line.quantity);
          stockRow.updatedAt = now;
          stockRow.updatedBy = customer.customerCode;

          if (stockRow.quantity === 0 && prodRow && prodRow.status === 'Active') {
            prodRow.status = 'Out of Stock';
            prodRow.updatedAt = now;
          }
        }
      });

      const newNotif = {
        id: 'notif-' + Date.now(),
        recipientRole: 'SUPER_ADMIN',
        type: 'NEW_ORDER',
        title: `New Order Received — ${orderNumber}`,
        message: `Order ID: ${orderNumber} | Customer: ${customer.storeName} | Items: ${validatedLines.length} (${totalUnits} units) | Total: ₹${orderGrandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
        orderId,
        orderNumber,
        customerName: customer.storeName,
        itemCount: validatedLines.length,
        totalAmount: orderGrandTotal,
        isRead: false,
        createdAt: now
      };
      dbState.notifications.unshift(newNotif);

      saveDatabase(true);
      return this.getOrderDetails(orderId);
    },

    getOrders() {
      const session = requireAuth(['SUPER_ADMIN', 'BILLING_EMPLOYEE', 'CUSTOMER']);
      let list = [...dbState.orders];

      if (session.roleCode === 'CUSTOMER') {
        list = list.filter((o) => o.customerId === session.customerId);
      }

      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return list.map((order) => ({
        ...order,
        productNames: dbState.order_items
          .filter((item) => item.orderId === order.id)
          .map((item) => {
            const product = dbState.products.find((p) => p.id === item.productId);
            return item.productName || (product && product.name) || '(Missing product)';
          })
      }));
    },

    getOrderDetails(orderId) {
      const session = requireAuth(['SUPER_ADMIN', 'BILLING_EMPLOYEE', 'CUSTOMER']);
      const order = dbState.orders.find((o) => o.id === orderId || o.orderNumber === orderId);
      if (!order) throw new Error('Order not found.');

      if (session.roleCode === 'CUSTOMER' && order.customerId !== session.customerId) {
        throw new Error('403 Forbidden: You are only authorized to view your own store orders.');
      }

      const items = dbState.order_items
        .filter((oi) => oi.orderId === order.id)
        .map((item) => {
          const product = dbState.products.find((p) => p.id === item.productId);
          return {
            ...item,
            imageUrl:
              item.imageUrl ||
              (product && product.imageUrl) ||
              createPartSvgDataUri('default', item.skuCode, '#16a34a')
          };
        });
      const customer = dbState.customers.find((c) => c.id === order.customerId) || null;
      return {
        ...order,
        items,
        customerDetails: customer
          ? {
              customerCode: customer.customerCode,
              storeName: customer.storeName,
              contactPerson: customer.contactPerson,
              email: customer.email,
              phone: customer.phone,
              address: customer.address,
              city: customer.city,
              state: customer.state,
              pincode: customer.pincode,
              gstNumber: customer.gstNumber
            }
          : null,
        companySettings: { ...dbState.company_settings }
      };
    },

    updateOrderStatus({ orderId, newStatus }) {
      const session = requireAuth(['SUPER_ADMIN', 'BILLING_EMPLOYEE']);
      const validStatuses = [
        'New',
        'Confirmed',
        'Processing',
        'Ready for Billing',
        'Dispatched',
        'Completed',
        'Cancelled'
      ];
      if (!validStatuses.includes(newStatus)) {
        throw new Error(`Invalid order status "${newStatus}".`);
      }

      if (newStatus === 'Cancelled' && session.roleCode !== 'SUPER_ADMIN') {
        throw new Error('Only Super Admin can cancel an order.');
      }

      const order = dbState.orders.find((o) => o.id === orderId);
      if (!order) throw new Error('Order not found.');

      const previousStatus = order.status;
      if (previousStatus === newStatus) return order;

      const now = new Date().toISOString();

      if (newStatus === 'Cancelled' && previousStatus !== 'Cancelled') {
        const items = dbState.order_items.filter((oi) => oi.orderId === order.id);
        items.forEach((item) => {
          const stockRow = dbState.stock.find((s) => s.productId === item.productId);
          const prodRow = dbState.products.find((p) => p.id === item.productId);
          if (stockRow) {
            stockRow.quantity += item.quantity;
            stockRow.updatedAt = now;
            if (prodRow && prodRow.status === 'Out of Stock' && stockRow.quantity > 0) {
              prodRow.status = 'Active';
            }
          }
        });
      }

      order.status = newStatus;
      order.processedBy = session.userId;
      order.updatedAt = now;

      recordAuditLog({
        session,
        actionType: 'UPDATE_ORDER_STATUS',
        entityType: 'ORDER',
        entityId: order.orderNumber,
        fieldChanged: 'status',
        previousValue: previousStatus,
        newValue: newStatus,
        description: `Order ${order.orderNumber} (${order.storeName}) status updated from "${previousStatus}" to "${newStatus}" by ${session.userId}.`
      });

      saveDatabase(true);
      return order;
    },

    // -------------------------------------------------------------------------
    // NOTIFICATIONS (SUPER ADMIN)
    // -------------------------------------------------------------------------
    getNotifications() {
      requireSuperAdmin();
      return [...dbState.notifications].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );
    },

    markNotificationRead(notificationId) {
      requireSuperAdmin();
      if (notificationId === 'ALL') {
        dbState.notifications.forEach((n) => {
          n.isRead = true;
        });
      } else {
        const n = dbState.notifications.find((item) => item.id === notificationId);
        if (n) n.isRead = true;
      }
      saveDatabase(false);
      return { success: true };
    },

    // -------------------------------------------------------------------------
    // COMPANY SETTINGS & AUDIT LOGS (SUPER ADMIN ONLY)
    // -------------------------------------------------------------------------
    getCompanySettings() {
      requireAuth(['SUPER_ADMIN', 'BILLING_EMPLOYEE', 'CUSTOMER']);
      return { ...dbState.company_settings };
    },

    updateCompanySettings(payload) {
      const session = requireSuperAdmin();
      const cs = dbState.company_settings;
      const prevSnapshot = `${cs.companyName} | GST: ${cs.gstNumber}`;

      cs.companyName = String(payload.companyName || cs.companyName).trim();
      cs.tagline = String(payload.tagline ?? cs.tagline).trim();
      if (payload.logoUrl) {
        cs.logoUrl = payload.logoUrl;
      }
      cs.address = String(payload.address || cs.address).trim();
      cs.city = String(payload.city ?? cs.city).trim();
      cs.state = String(payload.state ?? cs.state).trim();
      cs.pincode = String(payload.pincode ?? cs.pincode).trim();
      cs.gstNumber = String(payload.gstNumber || cs.gstNumber)
        .trim()
        .toUpperCase();
      cs.phone = String(payload.phone || cs.phone).trim();
      cs.email = String(payload.email || cs.email).trim();
      cs.website = String(payload.website ?? cs.website).trim();
      cs.bankDetails = String(payload.bankDetails ?? cs.bankDetails).trim();
      cs.orderTerms = String(payload.orderTerms ?? cs.orderTerms).trim();
      cs.updatedBy = session.userId;
      cs.updatedAt = new Date().toISOString();

      recordAuditLog({
        session,
        actionType: 'UPDATE_COMPANY_SETTINGS',
        entityType: 'COMPANY_SETTINGS',
        entityId: cs.id,
        fieldChanged: 'companyProfile',
        previousValue: prevSnapshot,
        newValue: `${cs.companyName} | GST: ${cs.gstNumber}`,
        description: 'Updated Cycle World company settings, GST, and branding details.'
      });

      saveDatabase(true);
      return { ...cs };
    },

    resetDefaultLogo() {
      const session = requireSuperAdmin();
      dbState.company_settings.logoUrl = createCycleWorldLogoDataUri();
      recordAuditLog({
        session,
        actionType: 'RESET_COMPANY_LOGO',
        entityType: 'COMPANY_SETTINGS',
        entityId: dbState.company_settings.id,
        fieldChanged: 'logoUrl',
        previousValue: 'Custom Logo',
        newValue: 'Default Cycle World Vector Emblem',
        description: 'Reset Cycle World company logo to official vector emblem.'
      });
      saveDatabase(true);
      return dbState.company_settings.logoUrl;
    },

    getAuditLogs() {
      requireSuperAdmin();
      return [...dbState.audit_logs];
    },

    getRelationalSchemaSummary() {
      requireSuperAdmin();
      return [
        { table: 'roles', rows: dbState.roles.length, pk: 'id', description: 'Role definitions & permission matrices (SUPER_ADMIN, BILLING_EMPLOYEE, CUSTOMER)' },
        { table: 'users', rows: dbState.users.length, pk: 'id', description: 'Authenticated user principals with salted SHA-256 password hashes' },
        { table: 'customers', rows: dbState.customers.length, pk: 'id', description: 'Isolated B2B Store Partner accounts (created manually by Super Admin)' },
        { table: 'employees', rows: dbState.employees.length, pk: 'id', description: 'Billing & Order Processing staff profiles' },
        { table: 'categories', rows: dbState.categories.length, pk: 'id', description: 'Dynamic top-level product categories' },
        { table: 'subcategories', rows: dbState.subcategories.length, pk: 'id', description: 'Dynamic subcategories linked via category_id' },
        { table: 'subcategory_groups', rows: (dbState.subcategory_groups || []).length, pk: 'id', description: 'Unlimited flexible multi-level groups per subcategory (e.g. Size, Model, Color, Type, Brand)' },
        { table: 'group_items', rows: (dbState.group_items || []).length, pk: 'id', description: 'Admin-created items/values inside each subcategory group (e.g. 12T, 16T, Model A, Red)' },
        { table: 'skus', rows: dbState.skus.length, pk: 'id', description: 'Unique manual SKU registry (enforces global SKU uniqueness)' },
        { table: 'products', rows: dbState.products.length, pk: 'id', description: 'Product Master records with selected multi-level group variant values' },
        { table: 'stock', rows: dbState.stock.length, pk: 'id', description: 'Live inventory quantities & low-stock thresholds' },
        { table: 'prices', rows: dbState.prices.length, pk: 'id', description: 'Franchisee / Wholesale (FP) prices in INR' },
        { table: 'gst', rows: dbState.gst.length, pk: 'id', description: 'Product GST percentages & HSN tax codes' },
        { table: 'orders', rows: dbState.orders.length, pk: 'id', description: 'Customer wholesale order headers with sequential CW-XXXXXX IDs' },
        { table: 'order_items', rows: dbState.order_items.length, pk: 'id', description: 'Normalized line items per order with snapshot variants, FP price & GST' },
        { table: 'notifications', rows: dbState.notifications.length, pk: 'id', description: 'Real-time Super Admin order notifications' },
        { table: 'company_settings', rows: 1, pk: 'id', description: 'Cycle World logo, GSTIN, address, bank & billing document config' },
        { table: 'audit_logs', rows: dbState.audit_logs.length, pk: 'id', description: 'Immutable security audit trail for price, SKU, GST, stock, and group changes' }
      ];
    },

    exportFullDatabaseJson() {
      requireSuperAdmin();
      return JSON.stringify(dbState, null, 2);
    },

    createPartSvgDataUri
  };

  global.CycleWorldAPI = CycleWorldAPI;
})(typeof window !== 'undefined' ? window : globalThis);
