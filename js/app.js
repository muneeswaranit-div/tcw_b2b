/**
 * ============================================================================
 * CYCLE WORLD (TCW B2B) - MAIN APPLICATION CONTROLLER
 * ============================================================================
 * Clean Initial Setup Workflow:
 *  Super Admin → Create Categories → Create Subcategories → Create Products
 *  & Manual SKU → Create Customer Accounts → Give Customer Login Credentials
 * ============================================================================
 */

(function (global) {
  'use strict';

  const API = global.CycleWorldAPI;
  const FileImporter = global.CycleWorldFileImporter;

  const state = {
    loginPortalMode: 'CUSTOMER',
    loginError: '',

    // Super Admin navigation tab
    adminTab: 'dashboard', // 'dashboard' | 'products' | 'import' | 'categories' | 'customers' | 'employees' | 'orders' | 'company' | 'audit'
    adminProductSearch: '',
    adminProductCatFilter: 'ALL',
    adminProductSubFilter: 'ALL',
    adminProductStatusFilter: 'ALL',
    adminCustomerSearch: '',
    adminCustomerStatusFilter: 'ALL',
    adminOrderSearch: '',
    adminOrderStatusFilter: 'ALL',
    adminAuditSearch: '',

    // Excel / PDF Import Validation State
    importFileName: '',
    importValidationResult: null,
    importConfirmNewSkus: false,

    // Billing User navigation tab
    billingTab: 'orders', // 'orders' | 'stores'
    billingOrderSearch: '',
    billingOrderStatusFilter: 'ALL',

    // Customer Portal navigation & catalog filters
    customerTab: 'catalog', // 'catalog' | 'cart' | 'orders' | 'profile'
    customerSearch: '',
    customerCategoryId: 'ALL',
    customerSubcategoryId: 'ALL',
    expandedCustomerCategoryId: null, // All main categories collapsed by default
    customerGroupFilters: {}, // Multi-level group filters: { [groupName]: selectedValue }
    customerSortBy: 'NAME_ASC',
    customerViewMode: 'GRID',
    cardQuantities: {},
    cart: [],
    orderNotes: '',

    // Active Modal State
    modal: null
  };

  function getCartStorageKey() {
    const sess = API.getSession();
    return sess && sess.customerId ? `TCW_B2B_CART_V2_${sess.customerId}` : 'TCW_B2B_CART_V2_GUEST';
  }

  function loadCustomerCart() {
    try {
      const raw = localStorage.getItem(getCartStorageKey());
      state.cart = raw ? JSON.parse(raw) : [];
    } catch (e) {
      state.cart = [];
    }
  }

  function saveCustomerCart() {
    try {
      localStorage.setItem(getCartStorageKey(), JSON.stringify(state.cart));
    } catch (e) {}
  }

  function formatCurrency(num) {
    const val = parseFloat(num) || 0;
    return '₹' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatPdfCurrency(num) {
    const val = parseFloat(num) || 0;
    return 'Rs. ' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return iso;
    }
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    toast.innerHTML = `<div style="font-weight:600;">${escapeHtml(message)}</div>`;
    container.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4200);
  }

  function getStatusBadgeClass(status) {
    switch (status) {
      case 'Active':
      case 'In Stock':
      case 'Completed':
        return 'status-active';
      case 'Low Stock':
      case 'Processing':
      case 'Ready for Billing':
      case 'Dispatched':
        return 'status-lowstock';
      case 'Out of Stock':
      case 'Inactive':
      case 'Cancelled':
        return 'status-outofstock';
      case 'New':
      case 'Confirmed':
      default:
        return 'status-new';
    }
  }

  function isBicycleAccessoriesCategory(item) {
    if (!item) return false;
    if (typeof item === 'string') {
      const s = item.trim().toLowerCase();
      return s === 'bicycle accessories' || s === 'acess';
    }
    const name = String(item.categoryName || item.name || '').trim().toLowerCase();
    const code = String(item.categoryCode || item.code || '').trim().toUpperCase();
    return name === 'bicycle accessories' || code === 'ACESS';
  }

  // Helper to render product multi-level group variant badges
  function renderVariantBadges(productOrItem, compact = false) {
    const list = Array.isArray(productOrItem.variantList) ? productOrItem.variantList : [];
    if (list.length === 0 && productOrItem.variantAttributes && typeof productOrItem.variantAttributes === 'object') {
      Object.keys(productOrItem.variantAttributes).forEach((k) => {
        if (productOrItem.variantAttributes[k]) {
          list.push({ groupName: k, value: productOrItem.variantAttributes[k] });
        }
      });
    }
    if (list.length === 0) return '';
    return `
      <div class="variant-badges-wrap ${compact ? 'compact' : ''}">
        ${list
          .map(
            (v) => `
          <span class="variant-attr-pill">
            <span class="variant-attr-key">${escapeHtml(v.groupName)}:</span>
            <strong class="variant-attr-val">${escapeHtml(v.value)}</strong>
          </span>
        `
          )
          .join('')}
      </div>
    `;
  }

  // Extract structured Model, Size, and Color / Variant columns for Order Punch & PDF
  function extractOrderItemVariantColumns(item) {
    const attrs = item.variantAttributes && typeof item.variantAttributes === 'object' ? item.variantAttributes : {};
    const list = Array.isArray(item.variantList) && item.variantList.length > 0
      ? item.variantList
      : Object.keys(attrs).map((k) => ({ groupName: k, value: attrs[k] }));

    let model = item.model || '';
    let size = item.size || '';
    const otherParts = [];

    list.forEach((entry) => {
      const g = String(entry.groupName || '').trim();
      const v = String(entry.value || '').trim();
      if (!v) return;
      const lower = g.toLowerCase();
      if (!model && (lower === 'model' || lower.includes('model'))) {
        model = v;
      } else if (!size && (lower === 'size' || lower.includes('size') || lower.includes('age'))) {
        size = v;
      } else if (lower === 'color' || lower === 'colour') {
        otherParts.unshift(v);
      } else {
        otherParts.push(`${g}: ${v}`);
      }
    });

    const colorVariant = otherParts.length > 0 ? otherParts.join(' | ') : (item.color || '—');
    return {
      model: model || '—',
      size: size || '—',
      colorVariant: colorVariant || '—',
      allVariantsText: list.map((e) => `${e.groupName}: ${e.value}`).join(', ')
    };
  }

  // ============================================================================
  // NATIVE PDF 1.4 GENERATOR & DIRECT PRINTER-FRIENDLY ENGINE FOR ORDER PUNCH
  // ============================================================================
  function pdfEscapeText(str) {
    return String(str ?? '')
      .replace(/[^\x20-\x7E]/g, ' ')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }

  function truncatePdfText(str, maxChars) {
    const clean = String(str ?? '').replace(/\s+/g, ' ').trim();
    if (clean.length <= maxChars) return clean;
    return clean.slice(0, Math.max(1, maxChars - 2)) + '..';
  }

  function loadPdfProductImage(imageUrl) {
    if (!imageUrl) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onerror = () => reject(new Error('Could not load a product image for the order PDF.'));
      image.onload = () => {
        try {
          const sourceWidth = image.naturalWidth || image.width;
          const sourceHeight = image.naturalHeight || image.height;
          const scale = Math.min(1, 240 / Math.max(sourceWidth, sourceHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(sourceWidth * scale));
          canvas.height = Math.max(1, Math.round(sourceHeight * scale));
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Could not prepare a product image for the order PDF.');
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          const base64 = canvas.toDataURL('image/jpeg', 0.82).split(',')[1];
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          resolve({ bytes, width: canvas.width, height: canvas.height });
        } catch (error) {
          reject(error);
        }
      };
      image.src = imageUrl;
    });
  }

  function asciiPdfBytes(text) {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
    return bytes;
  }

  function concatPdfBytes(parts) {
    const totalLength = parts.reduce((total, part) => total + part.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    parts.forEach((part) => {
      result.set(part, offset);
      offset += part.length;
    });
    return result;
  }

  async function generateOrderPdfBlob(ord) {
    const cs = ord.companySettings || API.getPublicCompanyBranding();
    const pageWidth = 841.89; // Landscape A4 width in pt
    const pageHeight = 595.28; // Landscape A4 height in pt
    const margin = 28;
    const contentWidth = pageWidth - margin * 2;

    const items = Array.isArray(ord.items) ? ord.items : [];
    const pdfImages = await Promise.all(items.map((item) => loadPdfProductImage(item.imageUrl)));
    const rowsPerPageFirst = 12;
    const rowsPerPageNext = 18;

    const pagesStreams = [];
    let itemIdx = 0;
    let pageNum = 1;

    while (itemIdx < items.length || pageNum === 1) {
      const isFirstPage = pageNum === 1;
      const maxRows = isFirstPage ? rowsPerPageFirst : rowsPerPageNext;
      const pageItems = items.slice(itemIdx, itemIdx + maxRows);
      itemIdx += pageItems.length;
      const isLastPage = itemIdx >= items.length;

      const cmds = [];
      let y = pageHeight - margin;

      // Top Header Banner (Forest Green #0f291e)
      cmds.push('0.059 0.161 0.118 rg');
      cmds.push(`${margin} ${y - 52} ${contentWidth} 52 re f`);

      // Green Accent Bar (#16a34a)
      cmds.push('0.086 0.639 0.290 rg');
      cmds.push(`${margin} ${y - 55} ${contentWidth} 3 re f`);

      // Header Left: Company Name & Tagline
      cmds.push('1 1 1 rg');
      cmds.push(`BT /F2 16 Tf ${margin + 12} ${y - 22} Td (${pdfEscapeText(cs.companyName || 'CYCLE WORLD')}) Tj ET`);
      cmds.push('0.73 0.96 0.81 rg');
      cmds.push(`BT /F1 8.5 Tf ${margin + 12} ${y - 35} Td (${pdfEscapeText(cs.tagline || 'B2B Wholesale Bicycle Spare Parts & Accessories Portal')}) Tj ET`);
      cmds.push('0.9 0.95 0.92 rg');
      cmds.push(`BT /F1 8 Tf ${margin + 12} ${y - 46} Td (${pdfEscapeText(`GSTIN: ${cs.gstNumber || '-'}  |  Phone: ${cs.phone || '-'}  |  ${cs.address || ''}${cs.city ? ', ' + cs.city : ''}`)}) Tj ET`);

      // Header Right: ORDER PUNCH / CONFIRMATION Title & Order Number
      cmds.push('1 1 1 rg');
      cmds.push(`BT /F2 12 Tf ${pageWidth - margin - 235} ${y - 20} Td (B2B ORDER PUNCH / CONFIRMATION) Tj ET`);
      cmds.push('0.53 0.94 0.67 rg');
      cmds.push(`BT /F2 11 Tf ${pageWidth - margin - 235} ${y - 34} Td (${pdfEscapeText('Order No: ' + ord.orderNumber)}) Tj ET`);
      cmds.push('1 1 1 rg');
      cmds.push(`BT /F1 8.5 Tf ${pageWidth - margin - 235} ${y - 46} Td (${pdfEscapeText('Date: ' + formatDateTime(ord.createdAt) + '  |  Status: ' + ord.status)}) Tj ET`);

      y -= 66;

      if (isFirstPage) {
        // Customer / Store Info Box & Order Info Box
        cmds.push('0.95 0.98 0.96 rg');
        cmds.push('0.78 0.88 0.81 RG 0.8 w');
        cmds.push(`${margin} ${y - 54} ${contentWidth} 54 re B`);

        cmds.push('0.086 0.40 0.20 rg');
        cmds.push(`BT /F2 8.5 Tf ${margin + 10} ${y - 14} Td (CUSTOMER / STORE DETAILS) Tj ET`);
        cmds.push('0.06 0.16 0.12 rg');
        cmds.push(`BT /F2 10.5 Tf ${margin + 10} ${y - 27} Td (${pdfEscapeText('Store Name: ' + (ord.storeName || '-'))}) Tj ET`);
        cmds.push(`BT /F1 8.5 Tf ${margin + 10} ${y - 39} Td (${pdfEscapeText('Customer ID: ' + (ord.customerCode || '-') + '   |   Customer GSTIN: ' + (ord.customerGst || 'N/A') + '   |   Phone: ' + (ord.customerPhone || '-'))}) Tj ET`);
        cmds.push(`BT /F1 8.5 Tf ${margin + 10} ${y - 50} Td (${pdfEscapeText('Billing Address: ' + truncatePdfText(ord.billingAddress || '-', 95))}) Tj ET`);

        // Right side of customer box: Order Summary Meta
        const rightMetaX = pageWidth - margin - 240;
        cmds.push('0.086 0.40 0.20 rg');
        cmds.push(`BT /F2 8.5 Tf ${rightMetaX} ${y - 14} Td (ORDER SUMMARY DETAILS) Tj ET`);
        cmds.push('0.06 0.16 0.12 rg');
        cmds.push(`BT /F1 8.5 Tf ${rightMetaX} ${y - 27} Td (${pdfEscapeText('Order Number: ' + ord.orderNumber)}) Tj ET`);
        cmds.push(`BT /F1 8.5 Tf ${rightMetaX} ${y - 39} Td (${pdfEscapeText('Order Status: ' + ord.status + '   |   Items: ' + ord.itemCount + ' (' + ord.totalQuantity + ' units)')}) Tj ET`);
        cmds.push(`BT /F2 9 Tf ${rightMetaX} ${y - 50} Td (${pdfEscapeText('Grand Total: ' + formatPdfCurrency(ord.totalAmount))}) Tj ET`);

        y -= 64;
      }

      // Table Columns Definition (Total width = 785.89pt)
      const cols = [
        { label: '#', width: 20 },
        { label: 'Image', width: 34 },
        { label: 'Category', width: 57 },
        { label: 'Sub-Category', width: 57 },
        { label: 'Product Name', width: 92 },
        { label: 'SKU Code', width: 58 },
        { label: 'Model', width: 54 },
        { label: 'Size', width: 40 },
        { label: 'Color / Variant', width: 98 },
        { label: 'Qty', width: 32 },
        { label: 'Unit Price', width: 58 },
        { label: 'Total Amt', width: 62 },
        { label: 'GST Tax', width: 58 },
        { label: 'Grand Total', width: 65.89 }
      ];

      // Table Header Row
      const thHeight = 20;
      cmds.push('0.09 0.23 0.17 rg');
      cmds.push(`${margin} ${y - thHeight} ${contentWidth} ${thHeight} re f`);
      cmds.push('1 1 1 rg');

      let cx = margin;
      cols.forEach((col) => {
        cmds.push(`BT /F2 7.2 Tf ${cx + 3} ${y - 13} Td (${pdfEscapeText(col.label)}) Tj ET`);
        cx += col.width;
      });
      y -= thHeight;

      // Table Body Rows
      const rowHeight = 19;
      pageItems.forEach((item, rIdx) => {
        const globalIdx = (isFirstPage ? 0 : rowsPerPageFirst + (pageNum - 2) * rowsPerPageNext) + rIdx + 1;
        const vCols = extractOrderItemVariantColumns(item);

        // Zebra stripe background
        if (rIdx % 2 === 1) {
          cmds.push('0.965 0.985 0.97 rg');
          cmds.push(`${margin} ${y - rowHeight} ${contentWidth} ${rowHeight} re f`);
        }
        cmds.push('0.82 0.89 0.84 RG 0.5 w');
        cmds.push(`${margin} ${y - rowHeight} ${contentWidth} ${rowHeight} re S`);

        const rowCells = [
          String(globalIdx),
          '',
          truncatePdfText(item.categoryName || '-', 13),
          truncatePdfText(item.subcategoryName || '-', 13),
          truncatePdfText(item.productName || '-', 24),
          truncatePdfText(item.skuCode || '-', 12),
          truncatePdfText(vCols.model, 11),
          truncatePdfText(vCols.size, 8),
          truncatePdfText(vCols.colorVariant, 21),
          String(item.quantity),
          formatPdfCurrency(item.fpPrice),
          formatPdfCurrency(item.subtotal),
          `${item.gstPercentage}% (${formatPdfCurrency(item.gstAmount)})`,
          formatPdfCurrency(item.totalAmount)
        ];

        cmds.push('0.07 0.14 0.10 rg');
        let rx = margin;
        rowCells.forEach((cellText, cIdx) => {
          if (cIdx === 1) {
            rx += cols[cIdx].width;
            return;
          }
          const fontRef = cIdx === 5 || cIdx === 9 || cIdx === 13 ? '/F2' : '/F1';
          const fontSize = cIdx === 12 ? '6.4' : '7.1';
          cmds.push(`BT ${fontRef} ${fontSize} Tf ${rx + 3} ${y - 12.5} Td (${pdfEscapeText(cellText)}) Tj ET`);
          rx += cols[cIdx].width;
        });

        const pdfImage = pdfImages[globalIdx - 1];
        if (pdfImage) {
          cmds.push('q');
          cmds.push(`16 0 0 16 ${margin + cols[0].width + 9} ${y - rowHeight + 1.5} cm`);
          cmds.push(`/Im${globalIdx - 1} Do`);
          cmds.push('Q');
        }

        y -= rowHeight;
      });

      // Totals & Footer on Last Page
      if (isLastPage) {
        y -= 10;
        const totBoxW = 255;
        const totBoxX = pageWidth - margin - totBoxW;
        const totBoxH = 62;

        cmds.push('0.95 0.98 0.96 rg');
        cmds.push('0.086 0.639 0.290 RG 1 w');
        cmds.push(`${totBoxX} ${y - totBoxH} ${totBoxW} ${totBoxH} re B`);

        cmds.push('0.1 0.2 0.15 rg');
        cmds.push(`BT /F1 8.5 Tf ${totBoxX + 10} ${y - 15} Td (Total Amount \\(Taxable Subtotal\\):) Tj ET`);
        cmds.push(`BT /F2 8.5 Tf ${totBoxX + 165} ${y - 15} Td (${pdfEscapeText(formatPdfCurrency(ord.subtotalAmount))}) Tj ET`);

        cmds.push(`BT /F1 8.5 Tf ${totBoxX + 10} ${y - 30} Td (GST / Tax Amount:) Tj ET`);
        cmds.push(`BT /F2 8.5 Tf ${totBoxX + 165} ${y - 30} Td (${pdfEscapeText('+ ' + formatPdfCurrency(ord.gstAmount))}) Tj ET`);

        cmds.push('0.06 0.16 0.12 RG 0.8 w');
        cmds.push(`${totBoxX + 8} ${y - 38} ${totBoxW - 16} 0 re S`);

        cmds.push('0.06 0.35 0.16 rg');
        cmds.push(`BT /F2 10.5 Tf ${totBoxX + 10} ${y - 52} Td (GRAND TOTAL \\(INCL. GST\\):) Tj ET`);
        cmds.push(`BT /F2 10.5 Tf ${totBoxX + 160} ${y - 52} Td (${pdfEscapeText(formatPdfCurrency(ord.totalAmount))}) Tj ET`);

        // Notes / Terms on Left
        if (ord.notes) {
          cmds.push('0.15 0.25 0.20 rg');
          cmds.push(`BT /F2 8 Tf ${margin} ${y - 16} Td (Order Notes:) Tj ET`);
          cmds.push(`BT /F1 8 Tf ${margin} ${y - 28} Td (${pdfEscapeText(truncatePdfText(ord.notes, 90))}) Tj ET`);
        }
        cmds.push('0.35 0.45 0.40 rg');
        cmds.push(`BT /F1 7.5 Tf ${margin} ${margin + 6} Td (${pdfEscapeText(`Generated by ${cs.companyName || 'Cycle World'} B2B Ordering System  |  Order Number: ${ord.orderNumber}  |  Page ${pageNum}`)}) Tj ET`);
      } else {
        cmds.push('0.35 0.45 0.40 rg');
        cmds.push(`BT /F1 7.5 Tf ${margin} ${margin + 6} Td (${pdfEscapeText(`Continued on next page...  |  Order Number: ${ord.orderNumber}  |  Page ${pageNum}`)}) Tj ET`);
      }

      pagesStreams.push(cmds.join('\n'));
      pageNum++;
      if (pageNum > 30) break;
    }

    // Assemble Valid PDF 1.4 Document
    const objects = [];
    function addObj(body) {
      objects.push(body);
      return objects.length;
    }

    const fontRegularId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const fontBoldId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const pagesRootId = addObj(''); // placeholder for /Pages

    const pdfImageObjectIds = pdfImages.map((image) => {
      if (!image) return null;
      const imageHeader = asciiPdfBytes(
        `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`
      );
      const imageFooter = asciiPdfBytes('\nendstream');
      return addObj(concatPdfBytes([imageHeader, image.bytes, imageFooter]));
    });

    const pageObjIds = [];
    pagesStreams.forEach((streamContent, pageIndex) => {
      const streamBytes = asciiPdfBytes(streamContent);
      const streamObjId = addObj(
        concatPdfBytes([
          asciiPdfBytes(`<< /Length ${streamBytes.length} >>\nstream\n`),
          streamBytes,
          asciiPdfBytes('\nendstream')
        ])
      );
      const pageStartIndex = pageIndex === 0 ? 0 : rowsPerPageFirst + (pageIndex - 1) * rowsPerPageNext;
      const pageEndIndex = Math.min(items.length, pageStartIndex + (pageIndex === 0 ? rowsPerPageFirst : rowsPerPageNext));
      const pageXObjects = [];
      for (let imageIndex = pageStartIndex; imageIndex < pageEndIndex; imageIndex++) {
        if (pdfImageObjectIds[imageIndex]) {
          pageXObjects.push(`/Im${imageIndex} ${pdfImageObjectIds[imageIndex]} 0 R`);
        }
      }
      const pageObjId = addObj(
        `<< /Type /Page /Parent ${pagesRootId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> /XObject << ${pageXObjects.join(' ')} >> >> /Contents ${streamObjId} 0 R >>`
      );
      pageObjIds.push(pageObjId);
    });

    objects[pagesRootId - 1] = `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjIds.length} >>`;
    const catalogId = addObj(`<< /Type /Catalog /Pages ${pagesRootId} 0 R >>`);

    const pdfParts = [asciiPdfBytes('%PDF-1.4\n')];
    const offsets = [0];
    let pdfLength = pdfParts[0].length;
    objects.forEach((body, idx) => {
      const bodyBytes = typeof body === 'string' ? asciiPdfBytes(body) : body;
      const objectBytes = concatPdfBytes([
        asciiPdfBytes(`${idx + 1} 0 obj\n`),
        bodyBytes,
        asciiPdfBytes('\nendobj\n')
      ]);
      offsets.push(pdfLength);
      pdfParts.push(objectBytes);
      pdfLength += objectBytes.length;
    });

    const xrefStart = pdfLength;
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objects.length; i++) {
      xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    }
    xref += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
    pdfParts.push(asciiPdfBytes(xref));

    return new Blob([concatPdfBytes(pdfParts)], { type: 'application/pdf' });
  }

  // Build Printer-Friendly HTML Document for Direct Printing
  function buildPrintableOrderHtml(ord) {
    const cs = ord.companySettings || API.getPublicCompanyBranding();
    const rowsHtml = (ord.items || [])
      .map((item, idx) => {
        const vCols = extractOrderItemVariantColumns(item);
        return `
          <tr>
            <td class="mono">${idx + 1}</td>
            <td class="order-product-image-cell">${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.productName || 'Product')}" />` : ''}</td>
            <td>${escapeHtml(item.categoryName || '—')}</td>
            <td>${escapeHtml(item.subcategoryName || '—')}</td>
            <td><strong>${escapeHtml(item.productName)}</strong></td>
            <td class="mono"><strong>${escapeHtml(item.skuCode)}</strong></td>
            <td>${escapeHtml(vCols.model)}</td>
            <td>${escapeHtml(vCols.size)}</td>
            <td>${escapeHtml(vCols.colorVariant)}</td>
            <td class="mono" style="text-align:center;"><strong>${item.quantity}</strong></td>
            <td class="mono" style="text-align:right;">${formatCurrency(item.fpPrice)}</td>
            <td class="mono" style="text-align:right;">${formatCurrency(item.subtotal)}</td>
            <td class="mono" style="text-align:right;">${item.gstPercentage}% (${formatCurrency(item.gstAmount)})</td>
            <td class="mono" style="text-align:right;"><strong>${formatCurrency(item.totalAmount)}</strong></td>
          </tr>
        `;
      })
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Order Punch ${escapeHtml(ord.orderNumber)} - ${escapeHtml(ord.storeName)}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Inter, Arial, sans-serif;
      color: #0f291e;
      margin: 0;
      padding: 12px;
      font-size: 11px;
      background: #ffffff;
    }
    .header-banner {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 3px solid #16a34a;
      padding-bottom: 10px;
      margin-bottom: 12px;
    }
    .company-title { font-size: 18px; font-weight: 800; color: #0f291e; margin: 0; }
    .company-sub { font-size: 11px; color: #355243; margin-top: 2px; }
    .order-badge-box { text-align: right; }
    .order-doc-label { font-size: 11px; font-weight: 800; color: #16a34a; text-transform: uppercase; letter-spacing: 0.6px; }
    .order-num { font-size: 18px; font-weight: 800; font-family: monospace; margin: 2px 0; }
    .parties-grid {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 12px;
      margin-bottom: 12px;
    }
    .party-box {
      border: 1px solid #bbf7d0;
      background: #f4fbf7;
      border-radius: 6px;
      padding: 8px 12px;
    }
    .party-box-title {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      color: #15803d;
      margin-bottom: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
    }
    th {
      background: #0f291e;
      color: #ffffff;
      font-size: 10px;
      font-weight: 700;
      text-align: left;
      padding: 6px 5px;
      border: 1px solid #0f291e;
    }
    td {
      padding: 5px 5px;
      border: 1px solid #cbd5e1;
      font-size: 10.5px;
      vertical-align: top;
    }
    .order-product-image-cell { width: 42px; }
    .order-product-image-cell img { display: block; width: 34px; height: 34px; object-fit: contain; }
    tr:nth-child(even) td { background: #f8fafc; }
    .mono { font-family: Consolas, monospace; }
    .totals-wrap {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-top: 8px;
    }
    .totals-card {
      width: 290px;
      border: 2px solid #16a34a;
      background: #f4fbf7;
      border-radius: 6px;
      padding: 10px 12px;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 5px;
      font-size: 11.5px;
    }
    .totals-grand {
      display: flex;
      justify-content: space-between;
      border-top: 2px solid #0f291e;
      padding-top: 6px;
      margin-top: 6px;
      font-size: 13.5px;
      font-weight: 800;
      color: #0f291e;
    }
  </style>
</head>
<body>
  <div class="header-banner">
    <div>
      <img src="${cs.logoUrl}" alt="Cycle World" style="height:40px;width:auto;margin-bottom:4px;" />
      <h1 class="company-title">${escapeHtml(cs.companyName)}</h1>
      <div class="company-sub">${escapeHtml(cs.address)}${cs.city ? ', ' + escapeHtml(cs.city) : ''}</div>
      <div class="company-sub mono"><strong>GSTIN:</strong> ${escapeHtml(cs.gstNumber)} | <strong>Phone:</strong> ${escapeHtml(cs.phone)}</div>
    </div>
    <div class="order-badge-box">
      <div class="order-doc-label">B2B Wholesale Order Punch / Confirmation</div>
      <div class="order-num">Order No: ${escapeHtml(ord.orderNumber)}</div>
      <div><strong>Order Date:</strong> ${formatDateTime(ord.createdAt)}</div>
      <div><strong>Order Status:</strong> ${escapeHtml(ord.status)}</div>
    </div>
  </div>

  <div class="parties-grid">
    <div class="party-box">
      <div class="party-box-title">Customer / Store Details</div>
      <div style="font-size:13px;font-weight:800;">${escapeHtml(ord.storeName)}</div>
      <div class="mono" style="margin:2px 0;"><strong>Customer ID:</strong> ${escapeHtml(ord.customerCode)} &nbsp;|&nbsp; <strong>GSTIN:</strong> ${escapeHtml(ord.customerGst || '—')}</div>
      <div><strong>Address:</strong> ${escapeHtml(ord.billingAddress)}</div>
      <div><strong>Contact:</strong> ${escapeHtml(ord.customerPhone || '—')}</div>
    </div>
    <div class="party-box">
      <div class="party-box-title">Order Summary</div>
      <div><strong>Order Number:</strong> <span class="mono">${escapeHtml(ord.orderNumber)}</span></div>
      <div><strong>Total Products:</strong> ${ord.itemCount} SKUs (${ord.totalQuantity} units ordered)</div>
      <div><strong>Order Status:</strong> ${escapeHtml(ord.status)}</div>
      ${ord.notes ? `<div style="margin-top:4px;"><strong>Notes:</strong> ${escapeHtml(ord.notes)}</div>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Image</th>
        <th>Category</th>
        <th>Sub-Category</th>
        <th>Product Name</th>
        <th>SKU Code</th>
        <th>Model</th>
        <th>Size</th>
        <th>Color / Variant</th>
        <th style="text-align:center;">Qty</th>
        <th style="text-align:right;">Unit Price</th>
        <th style="text-align:right;">Total Amount</th>
        <th style="text-align:right;">GST / Tax</th>
        <th style="text-align:right;">Grand Total</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="totals-wrap">
    <div style="font-size:10px;color:#475569;max-width:460px;">
      <strong>Terms &amp; Confirmation:</strong><br/>
      ${escapeHtml(cs.orderTerms || 'All wholesale orders are billed at FP Price + applicable GST.')}
    </div>
    <div class="totals-card">
      <div class="totals-row">
        <span>Total Amount (Subtotal):</span>
        <strong class="mono">${formatCurrency(ord.subtotalAmount)}</strong>
      </div>
      <div class="totals-row">
        <span>GST / Tax Details:</span>
        <strong class="mono">+ ${formatCurrency(ord.gstAmount)}</strong>
      </div>
      <div class="totals-grand">
        <span>Grand Total:</span>
        <span class="mono">${formatCurrency(ord.totalAmount)}</span>
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  // ============================================================================
  // ROOT RENDER DISPATCHER
  // ============================================================================
  let lastUnreadNotifCount = -1;

  function renderApp() {
    const root = document.getElementById('app-root');
    if (!root) return;

    const activeEl = document.activeElement;
    const activeTag = activeEl ? activeEl.tagName : null;
    const activeId = activeEl ? activeEl.id : null;
    const activePlaceholder =
      activeEl && activeEl.getAttribute ? activeEl.getAttribute('placeholder') : null;
    let selStart = null;
    let selEnd = null;
    try {
      if (activeEl && typeof activeEl.selectionStart === 'number') {
        selStart = activeEl.selectionStart;
        selEnd = activeEl.selectionEnd;
      }
    } catch (e) {}

    const session = API.getSession();

    if (!session) {
      root.innerHTML = renderLoginPortalScreen();
      renderModal();
      return;
    }

    if (session.roleCode === 'SUPER_ADMIN') {
      try {
        const notifs = API.getNotifications();
        const unread = notifs.filter((n) => !n.isRead).length;
        if (lastUnreadNotifCount !== -1 && unread > lastUnreadNotifCount) {
          const newest = notifs[0];
          if (newest) {
            showToast(`🔔 ${newest.title}: ${newest.customerName}`, 'success');
          }
        }
        lastUnreadNotifCount = unread;
      } catch (e) {}
    }

    if (session.roleCode === 'SUPER_ADMIN') {
      root.innerHTML = renderSuperAdminPortal(session);
    } else if (session.roleCode === 'BILLING_EMPLOYEE') {
      root.innerHTML = renderBillingEmployeePortal(session);
    } else if (session.roleCode === 'CUSTOMER') {
      root.innerHTML = renderCustomerStorePortal(session);
    }

    renderModal();

    if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
      let target = activeId ? document.getElementById(activeId) : null;
      if (!target && activePlaceholder) {
        target = root.querySelector(
          `${activeTag.toLowerCase()}[placeholder="${CSS.escape(activePlaceholder)}"]`
        );
      }
      if (target) {
        target.focus();
        try {
          if (selStart !== null && typeof target.setSelectionRange === 'function') {
            target.setSelectionRange(selStart, selEnd);
          }
        } catch (e) {}
      }
    }
  }

  // ============================================================================
  // 1. THREE SEPARATE LOGIN PORTALS (CUSTOMER, BILLING USER, SUPER ADMIN)
  // ============================================================================
  function renderLoginPortalScreen() {
    const branding = API.getPublicCompanyBranding();
    const lockedPortal = global.TCW_LOCKED_PORTAL || null;
    if (lockedPortal) {
      state.loginPortalMode = lockedPortal;
    }
    const mode = state.loginPortalMode;

    const isCustomer = mode === 'CUSTOMER';
    const isBilling = mode === 'BILLING_EMPLOYEE';
    const isAdmin = mode === 'SUPER_ADMIN';

    // Top bar only shown on the combined index.html page (hidden on standalone customer.html, admin.html, billing.html)
    const topPortalBarHtml = !lockedPortal
      ? `
        <div class="portal-access-bar no-print">
          <div class="portal-access-brand">
            <span class="dot"></span>
            <span><strong>${escapeHtml(branding.companyName)}</strong> — B2B Wholesale Ordering System</span>
          </div>
          <div class="portal-tabs" role="tablist" aria-label="Select Access Portal">
            <button type="button" class="portal-tab-btn ${isCustomer ? 'active' : ''}" onclick="CycleWorldApp.switchLoginPortal('CUSTOMER')">
              🏪 Customer Portal
            </button>
            <button type="button" class="portal-tab-btn ${isBilling ? 'active' : ''}" onclick="CycleWorldApp.switchLoginPortal('BILLING_EMPLOYEE')">
              🧾 Employee / Billing Portal
            </button>
            <button type="button" class="portal-tab-btn ${isAdmin ? 'active' : ''}" onclick="CycleWorldApp.switchLoginPortal('SUPER_ADMIN')">
              🛡️ Super Admin Login
            </button>
          </div>
        </div>
      `
      : '';

    // Requirement 7: Customer Login Page simply provides:
    // Customer Login ID, Password, Login button (no self-registration, no demo accounts)
    if (isCustomer) {
      return `
        ${topPortalBarHtml}
        <main class="login-viewport customer-minimal-bg" style="${lockedPortal ? 'min-height:100vh;' : ''}">
          <div class="login-card portal-customer">
            <div class="login-logo-wrap">
              <img src="${branding.logoUrl}" alt="Cycle World Logo" class="login-logo-img" />
              <h1 class="login-title" style="margin-top:0.25rem;">Customer Login</h1>
            </div>

            ${
              state.loginError
                ? `<div class="login-error-box" role="alert">⚠️ ${escapeHtml(state.loginError)}</div>`
                : ''
            }

            <form onsubmit="CycleWorldApp.handleLoginSubmit(event)" autocomplete="off">
              <div class="form-group">
                <label class="form-label" for="login-identifier">Customer Login ID</label>
                <input
                  type="text"
                  id="login-identifier"
                  name="identifier"
                  class="form-control"
                  placeholder="Enter Customer Login ID"
                  required
                  autofocus
                />
              </div>

              <div class="form-group">
                <label class="form-label" for="login-password">Password</label>
                <input
                  type="password"
                  id="login-password"
                  name="password"
                  class="form-control"
                  placeholder="Enter Password"
                  required
                />
              </div>

              <button type="submit" class="btn btn-primary btn-block" style="margin-top:0.5rem;">
                Login
              </button>
            </form>
          </div>
        </main>
      `;
    }

    if (isBilling) {
      return `
        ${topPortalBarHtml}
        <main class="login-viewport" style="${lockedPortal ? 'min-height:100vh;' : ''}">
          <div class="login-card portal-billing">
            <div class="login-logo-wrap">
              <img src="${branding.logoUrl}" alt="Cycle World Logo" class="login-logo-img" />
              <span class="login-portal-badge badge-billing">Employee / Billing Portal</span>
              <h1 class="login-title">Employee / Billing Login</h1>
              <p class="login-subtitle">Enter the Employee Login ID and Password created by Super Admin.</p>
            </div>

            ${
              state.loginError
                ? `<div class="login-error-box" role="alert">⚠️ ${escapeHtml(state.loginError)}</div>`
                : ''
            }

            <form onsubmit="CycleWorldApp.handleLoginSubmit(event)" autocomplete="off">
              <div class="form-group">
                <label class="form-label" for="login-identifier">Employee Login ID</label>
                <input
                  type="text"
                  id="login-identifier"
                  name="identifier"
                  class="form-control"
                  placeholder="Enter Employee Login ID"
                  required
                  autofocus
                />
              </div>

              <div class="form-group">
                <label class="form-label" for="login-password">Password</label>
                <input
                  type="password"
                  id="login-password"
                  name="password"
                  class="form-control"
                  placeholder="Enter Password"
                  required
                />
              </div>

              <button type="submit" class="btn btn-primary btn-block" style="margin-top:0.5rem;">
                Login
              </button>
            </form>
          </div>
        </main>
      `;
    }

    // Super Admin Login Screen
    return `
      ${topPortalBarHtml}
      <main class="login-viewport" style="${lockedPortal ? 'min-height:100vh;' : ''}">
        <div class="login-card portal-super-admin">
          <div class="login-logo-wrap">
            <img src="${branding.logoUrl}" alt="Cycle World Logo" class="login-logo-img" />
            <span class="login-portal-badge badge-admin">Super Admin Portal</span>
            <h1 class="login-title">Super Admin Login</h1>
            <p class="login-subtitle">Sign in with your Super Admin ID and Password.</p>
          </div>

          ${
            state.loginError
              ? `<div class="login-error-box" role="alert">⚠️ ${escapeHtml(state.loginError)}</div>`
              : ''
          }

          <form onsubmit="CycleWorldApp.handleLoginSubmit(event)" autocomplete="off">
            <div class="form-group">
              <label class="form-label" for="login-identifier">Admin / User ID</label>
              <input
                type="text"
                id="login-identifier"
                name="identifier"
                class="form-control"
                placeholder="Enter Admin / User ID"
                required
                autofocus
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="login-password">Password</label>
              <input
                type="password"
                id="login-password"
                name="password"
                class="form-control"
                placeholder="Enter Password"
                required
              />
            </div>

            <button type="submit" class="btn btn-primary btn-block" style="margin-top:0.5rem;">
              Login
            </button>
          </form>

          <div class="login-policy-note">
            Master Admin ID: <span class="mono">CW-ADMIN</span> &nbsp;|&nbsp; Initial Password: <span class="mono">Admin@123</span>
          </div>
        </div>
      </main>
    `;
  }

  // ============================================================================
  // 2. SUPER ADMIN PORTAL
  // ============================================================================
  function renderSuperAdminPortal(session) {
    const branding = API.getPublicCompanyBranding();
    const stats = API.getAdminDashboardStats();

    const navItems = [
      { id: 'dashboard', label: '📊 Dashboard', badge: null },
      { id: 'categories', label: '🗂️ Categories & Subcategories', badge: stats.totalCategories },
      { id: 'products', label: '⚙️ Product Master & SKUs', badge: stats.totalProducts },
      { id: 'import', label: '📥 Excel / PDF Upload', badge: null },
      { id: 'customers', label: '🏪 Customers / Stores', badge: stats.totalCustomers },
      { id: 'employees', label: '🧾 Billing Employees', badge: stats.totalEmployees },
      { id: 'orders', label: '📦 Incoming Orders', badge: stats.newOrders > 0 ? `${stats.newOrders} New` : stats.totalOrders },
      { id: 'company', label: '🏢 Company & GST Settings', badge: null },
      { id: 'audit', label: '🔒 Security & Audit Logs', badge: null }
    ];

    let mainViewHtml = '';
    switch (state.adminTab) {
      case 'products':
        mainViewHtml = renderAdminProductsTab();
        break;
      case 'import':
        mainViewHtml = renderAdminImportTab();
        break;
      case 'categories':
        mainViewHtml = renderAdminCategoriesTab();
        break;
      case 'customers':
        mainViewHtml = renderAdminCustomersTab();
        break;
      case 'employees':
        mainViewHtml = renderAdminEmployeesTab();
        break;
      case 'orders':
        mainViewHtml = renderAdminOrdersTab();
        break;
      case 'company':
        mainViewHtml = renderAdminCompanyTab();
        break;
      case 'audit':
        mainViewHtml = renderAdminAuditTab();
        break;
      case 'dashboard':
      default:
        mainViewHtml = renderAdminDashboardTab(stats);
        break;
    }

    return `
      <!-- Super Admin Top Header -->
      <header class="app-header no-print">
        <div class="app-header-inner">
          <div class="header-brand">
            <img src="${branding.logoUrl}" alt="Cycle World" class="header-logo" />
            <span class="header-role-pill badge-admin">🛡️ Super Admin Portal</span>
          </div>
          <div class="header-actions">
            <button type="button" class="notif-btn" onclick="CycleWorldApp.openNotificationsModal()" title="View Order Notifications">
              🔔 Notifications
              ${
                stats.unreadNotifications > 0
                  ? `<span class="notif-count-badge">${stats.unreadNotifications}</span>`
                  : `<span class="mono" style="font-size:0.75rem;color:var(--text-muted);">0</span>`
              }
            </button>
            <div class="user-info-pill">
              <div>
                <div class="user-info-name">${escapeHtml(session.fullName)}</div>
                <div class="user-info-id">ID: ${escapeHtml(session.userId)}</div>
              </div>
            </div>
            <button type="button" class="btn btn-outline btn-sm" onclick="CycleWorldApp.handleLogout()">
              Logout
            </button>
          </div>
        </div>
      </header>

      <div class="portal-layout">
        <aside class="portal-sidebar no-print">
          <div class="sidebar-section-header">
            <span>Super Admin Controls</span>
          </div>
          <ul class="sidebar-nav-list">
            ${navItems
              .map(
                (item) => `
              <li class="sidebar-nav-item">
                <button
                  type="button"
                  class="sidebar-nav-btn ${state.adminTab === item.id ? 'active' : ''}"
                  onclick="CycleWorldApp.setAdminTab('${item.id}')"
                >
                  <span>${item.label}</span>
                  ${
                    item.badge !== null
                      ? `<span class="status-badge ${
                          item.id === 'orders' && stats.newOrders > 0 ? 'status-new' : ''
                        }" style="background:rgba(15,41,30,0.08);color:inherit;">${item.badge}</span>`
                      : ''
                  }
                </button>
              </li>
            `
              )
              .join('')}
          </ul>
        </aside>

        <main>
          ${mainViewHtml}
        </main>
      </div>
    `;
  }

  // ----------------------------------------------------------------------------
  // SUPER ADMIN TAB 1: DASHBOARD (Clean Initial Setup Workflow + KPIs)
  // ----------------------------------------------------------------------------
  function renderAdminDashboardTab(stats) {
    const orders = API.getOrders().slice(0, 6);
    const products = API.getAdminProducts();
    const stockAlerts = products.filter((p) => p.stock === 0 || p.stock <= p.lowStockThreshold);

    return `
      <!-- Step-by-Step Initial Setup Workflow Guide (Requirement 8) -->
      <div class="panel-card" style="border-color:var(--primary-border);background:linear-gradient(180deg,#ffffff 0%,#f3faf5 100%);">
        <div class="panel-header" style="background:var(--primary-soft);">
          <div>
            <h2 class="panel-title">🚲 Cycle World B2B — Step-by-Step Master Setup Workflow</h2>
            <p style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.15rem;">
              Start from a clean database: create your Categories, Subcategories, Products &amp; Manual SKUs, and Customer Login Credentials.
            </p>
          </div>
        </div>
        <div class="panel-body">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:0.85rem;">
            <div style="background:#fff;border:1px solid var(--border-color);border-radius:var(--radius-sm);padding:0.9rem;">
              <div style="font-size:0.73rem;font-weight:800;color:var(--primary-hover);text-transform:uppercase;">Step 1 • Categories (${stats.totalCategories})</div>
              <div style="font-weight:700;margin:0.2rem 0 0.5rem;font-size:0.9rem;">Create Categories &amp; Subcategories</div>
              <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
                <button type="button" class="btn btn-primary btn-xs" onclick="CycleWorldApp.openCategoryModal(null)">+ Create Category</button>
                <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.openSubcategoryModal(null)">+ Subcategory</button>
              </div>
            </div>

            <div style="background:#fff;border:1px solid var(--border-color);border-radius:var(--radius-sm);padding:0.9rem;">
              <div style="font-size:0.73rem;font-weight:800;color:var(--primary-hover);text-transform:uppercase;">Step 2 • Products &amp; SKUs (${stats.totalProducts})</div>
              <div style="font-weight:700;margin:0.2rem 0 0.5rem;font-size:0.9rem;">Create Products &amp; Manual SKU</div>
              <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
                <button type="button" class="btn btn-primary btn-xs" onclick="CycleWorldApp.openProductModal(null)">+ Create Product</button>
                <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.setAdminTab('import')">📥 Upload Excel</button>
              </div>
            </div>

            <div style="background:#fff;border:1px solid var(--border-color);border-radius:var(--radius-sm);padding:0.9rem;">
              <div style="font-size:0.73rem;font-weight:800;color:var(--primary-hover);text-transform:uppercase;">Step 3 • Customer Logins (${stats.totalCustomers})</div>
              <div style="font-weight:700;margin:0.2rem 0 0.5rem;font-size:0.9rem;">Create Customer / Store Accounts</div>
              <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
                <button type="button" class="btn btn-primary btn-xs" onclick="CycleWorldApp.openCustomerModal(null)">+ Create Customer Login</button>
                <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.setAdminTab('customers')">Manage Stores</button>
              </div>
            </div>

            <div style="background:#fff;border:1px solid var(--border-color);border-radius:var(--radius-sm);padding:0.9rem;">
              <div style="font-size:0.73rem;font-weight:800;color:var(--primary-hover);text-transform:uppercase;">Step 4 • Billing Staff (${stats.totalEmployees})</div>
              <div style="font-weight:700;margin:0.2rem 0 0.5rem;font-size:0.9rem;">Create Employee / Billing Logins</div>
              <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
                <button type="button" class="btn btn-primary btn-xs" onclick="CycleWorldApp.openEmployeeModal(null)">+ Create Billing User</button>
                <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.setAdminTab('orders')">View Orders</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Actions Bar -->
      <div class="quick-actions-grid">
        <span style="font-size:0.78rem;font-weight:800;text-transform:uppercase;color:var(--text-muted);margin-right:0.35rem;">
          ⚡ Quick Actions:
        </span>
        <button type="button" class="btn btn-primary btn-sm" onclick="CycleWorldApp.openProductModal(null)">
          + Add Product
        </button>
        <button type="button" class="btn btn-navy btn-sm" onclick="CycleWorldApp.setAdminTab('import')">
          📥 Upload Excel / PDF
        </button>
        <button type="button" class="btn btn-outline btn-sm" onclick="CycleWorldApp.setAdminTab('products')">
          ⚙️ Manage Products
        </button>
        <button type="button" class="btn btn-outline btn-sm" onclick="CycleWorldApp.setAdminTab('categories')">
          🗂️ Manage Categories
        </button>
        <button type="button" class="btn btn-outline btn-sm" onclick="CycleWorldApp.setAdminTab('customers')">
          🏪 Manage Customers
        </button>
        <button type="button" class="btn btn-outline btn-sm" onclick="CycleWorldApp.setAdminTab('employees')">
          🧾 Manage Employees
        </button>
        <button type="button" class="btn btn-outline btn-sm" onclick="CycleWorldApp.setAdminTab('orders')">
          📦 View Orders
        </button>
        <button type="button" class="btn btn-outline btn-sm" onclick="CycleWorldApp.setAdminTab('company')">
          🏢 Company Settings
        </button>
      </div>

      <!-- 12 Mandatory Admin KPI Cards -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Total Customers / Stores</div>
          <div class="kpi-value">${stats.totalCustomers}</div>
          <div class="kpi-sub">Created by Super Admin</div>
        </div>
        <div class="kpi-card kpi-success">
          <div class="kpi-label">Active Customers</div>
          <div class="kpi-value">${stats.activeCustomers}</div>
          <div class="kpi-sub">Authorized for ordering</div>
        </div>
        <div class="kpi-card kpi-danger">
          <div class="kpi-label">Inactive Customers</div>
          <div class="kpi-value">${stats.inactiveCustomers}</div>
          <div class="kpi-sub">Login access disabled</div>
        </div>
        <div class="kpi-card kpi-navy">
          <div class="kpi-label">Total Products</div>
          <div class="kpi-value">${stats.totalProducts}</div>
          <div class="kpi-sub">Manual unique SKUs</div>
        </div>
        <div class="kpi-card kpi-success">
          <div class="kpi-label">Active Products</div>
          <div class="kpi-value">${stats.activeProducts}</div>
          <div class="kpi-sub">Visible on Customer Portal</div>
        </div>
        <div class="kpi-card kpi-warning">
          <div class="kpi-label">Low Stock Products</div>
          <div class="kpi-value">${stats.lowStockProducts}</div>
          <div class="kpi-sub">At or below threshold</div>
        </div>
        <div class="kpi-card kpi-danger">
          <div class="kpi-label">Zero Stock Products</div>
          <div class="kpi-value">${stats.zeroStockProducts}</div>
          <div class="kpi-sub">Hidden from Customer Portal</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Total Categories</div>
          <div class="kpi-value">${stats.totalCategories}</div>
          <div class="kpi-sub">Alphabetically organized</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Total Subcategories</div>
          <div class="kpi-value">${stats.totalSubcategories}</div>
          <div class="kpi-sub">Dynamic hierarchy</div>
        </div>
        <div class="kpi-card kpi-warning">
          <div class="kpi-label">New Orders</div>
          <div class="kpi-value">${stats.newOrders}</div>
          <div class="kpi-sub">Awaiting confirmation</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Pending Orders</div>
          <div class="kpi-value">${stats.pendingOrders}</div>
          <div class="kpi-sub">In active fulfillment</div>
        </div>
        <div class="kpi-card kpi-success">
          <div class="kpi-label">Completed Orders</div>
          <div class="kpi-value">${stats.completedOrders}</div>
          <div class="kpi-sub">Value: ${formatCurrency(stats.totalRevenue)}</div>
        </div>
      </div>

      <div class="form-grid-2">
        <!-- Incoming Orders Panel -->
        <div class="panel-card">
          <div class="panel-header">
            <h2 class="panel-title">📦 Recent Incoming Store Orders</h2>
            <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.setAdminTab('orders')">
              View All Orders →
            </button>
          </div>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Customer / Store</th>
                  <th>Items</th>
                  <th>Total (Incl. GST)</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${
                  orders.length === 0
                    ? `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:1.75rem;">No incoming orders yet.</td></tr>`
                    : orders
                        .map(
                          (o) => `
                  <tr>
                    <td class="mono" style="font-weight:700;">${escapeHtml(o.orderNumber)}</td>
                    <td>
                      <div style="font-weight:600;">${escapeHtml(o.storeName)}</div>
                      <div class="mono" style="font-size:0.73rem;color:var(--text-muted);">${escapeHtml(o.customerCode)} • ${formatDateTime(o.createdAt)}</div>
                    </td>
                    <td class="mono">${o.itemCount} (${o.totalQuantity} pcs)</td>
                    <td class="mono" style="font-weight:700;">${formatCurrency(o.totalAmount)}</td>
                    <td><span class="status-badge ${getStatusBadgeClass(o.status)}">${escapeHtml(o.status)}</span></td>
                    <td>
                      <button type="button" class="btn btn-soft btn-xs" onclick="CycleWorldApp.openOrderDetailModal('${o.id}')">
                        Open
                      </button>
                    </td>
                  </tr>
                `
                        )
                        .join('')
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- Zero & Low Stock Watchlist -->
        <div class="panel-card">
          <div class="panel-header">
            <h2 class="panel-title">⚠️ Live Stock Watchlist (Zero &amp; Low Stock)</h2>
            <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.setAdminTab('products')">
              Manage Products →
            </button>
          </div>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product Name</th>
                  <th>Live Stock</th>
                  <th>Customer Visibility</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${
                  stockAlerts.length === 0
                    ? `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1.75rem;">No zero-stock or low-stock alerts.</td></tr>`
                    : stockAlerts
                        .map(
                          (p) => `
                  <tr>
                    <td class="mono" style="font-weight:700;">${escapeHtml(p.skuCode)}</td>
                    <td>
                      <div style="font-weight:600;">${escapeHtml(p.name)}</div>
                      <div style="font-size:0.74rem;color:var(--text-muted);">${escapeHtml(p.categoryName)} › ${escapeHtml(p.subcategoryName)}</div>
                    </td>
                    <td class="mono" style="font-weight:800;color:${p.stock === 0 ? 'var(--danger)' : 'var(--warning)'};">
                      ${p.stock} units
                    </td>
                    <td>
                      ${
                        p.stock === 0
                          ? `<span class="status-badge status-outofstock">Hidden (Stock = 0)</span>`
                          : `<span class="status-badge status-lowstock">Low Stock (Visible)</span>`
                      }
                    </td>
                    <td>
                      <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.openQuickStockModal('${p.id}')">
                        Update Stock
                      </button>
                    </td>
                  </tr>
                `
                        )
                        .join('')
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // ----------------------------------------------------------------------------
  // SUPER ADMIN TAB 2: PRODUCT MASTER & MANUAL SKU MANAGEMENT (Requirement 4)
  // ----------------------------------------------------------------------------
  function renderAdminProductsTab() {
    const allProducts = API.getAdminProducts();
    const catsTree = API.getCategoriesTree({ activeOnly: false });

    const q = state.adminProductSearch.trim().toLowerCase();
    const filtered = allProducts.filter((p) => {
      if (state.adminProductCatFilter !== 'ALL' && p.categoryId !== state.adminProductCatFilter) {
        return false;
      }
      if (
        state.adminProductSubFilter !== 'ALL' &&
        p.subcategoryId !== state.adminProductSubFilter
      ) {
        return false;
      }
      if (state.adminProductStatusFilter === 'ZERO_STOCK' && p.stock !== 0) return false;
      if (
        state.adminProductStatusFilter === 'LOW_STOCK' &&
        !(p.stock > 0 && p.stock <= p.lowStockThreshold)
      ) {
        return false;
      }
      if (
        ['Active', 'Inactive', 'Out of Stock'].includes(state.adminProductStatusFilter) &&
        p.status !== state.adminProductStatusFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        p.skuCode.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.categoryName.toLowerCase().includes(q) ||
        p.subcategoryName.toLowerCase().includes(q) ||
        (p.variantSummary && p.variantSummary.toLowerCase().includes(q))
      );
    });

    const selectedCatObj = catsTree.find((c) => c.id === state.adminProductCatFilter);
    const availableSubcats = selectedCatObj ? selectedCatObj.subcategories : [];

    return `
      <div class="panel-card">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">📦 Product Catalog (${allProducts.length} Products)</h2>
            <p style="font-size:0.79rem;color:var(--text-muted);margin-top:0.15rem;">
              Product Catalog with 7 standard fields: Product Category, Product Subcategory, Product Name, Available Quantity, Product Price, GST, and Product Status – Active or Inactive.
            </p>
          </div>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            <button type="button" class="btn btn-outline btn-sm" onclick="CycleWorldApp.setAdminTab('categories')">
              🗂️ Manage Categories
            </button>
            <button type="button" class="btn btn-outline btn-sm" onclick="CycleWorldApp.setAdminTab('import')">
              📥 Upload Product Excel
            </button>
            <button type="button" class="btn btn-primary btn-sm" onclick="CycleWorldApp.openProductModal(null)">
              + Create Product
            </button>
          </div>
        </div>

        <div class="panel-body">
          <div class="toolbar-row">
            <div class="search-input-wrap">
              <span class="search-icon">🔍</span>
              <input
                type="text"
                class="form-control"
                placeholder="Search by Product Name, Category, or Subcategory..."
                value="${escapeHtml(state.adminProductSearch)}"
                oninput="CycleWorldApp.updateAdminProductFilter('search', this.value)"
              />
            </div>

            <select class="form-control" style="width:auto;min-width:185px;" onchange="CycleWorldApp.updateAdminProductFilter('cat', this.value)">
              <option value="ALL">All Categories (A–Z)</option>
              ${catsTree
                .map(
                  (c) =>
                    `<option value="${c.id}" ${
                      state.adminProductCatFilter === c.id ? 'selected' : ''
                    }>${escapeHtml(c.name)}</option>`
                )
                .join('')}
            </select>

            <select class="form-control" style="width:auto;min-width:175px;" onchange="CycleWorldApp.updateAdminProductFilter('sub', this.value)">
              <option value="ALL">All Subcategories</option>
              ${availableSubcats
                .map(
                  (s) =>
                    `<option value="${s.id}" ${
                      state.adminProductSubFilter === s.id ? 'selected' : ''
                    }>${escapeHtml(s.name)}</option>`
                )
                .join('')}
            </select>

            <select class="form-control" style="width:auto;min-width:165px;" onchange="CycleWorldApp.updateAdminProductFilter('status', this.value)">
              <option value="ALL" ${state.adminProductStatusFilter === 'ALL' ? 'selected' : ''}>All Statuses (${allProducts.length})</option>
              <option value="Active" ${state.adminProductStatusFilter === 'Active' ? 'selected' : ''}>Active &amp; In Stock</option>
              <option value="LOW_STOCK" ${state.adminProductStatusFilter === 'LOW_STOCK' ? 'selected' : ''}>Low Stock Alert</option>
              <option value="ZERO_STOCK" ${state.adminProductStatusFilter === 'ZERO_STOCK' ? 'selected' : ''}>Zero Stock (Hidden)</option>
              <option value="Inactive" ${state.adminProductStatusFilter === 'Inactive' ? 'selected' : ''}>Inactive (Hidden)</option>
            </select>
          </div>

          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Image</th>
                  <th>Product Category</th>
                  <th>Product Subcategory</th>
                  <th>Product Name</th>
                  <th>Available Quantity</th>
                  <th>Product Price</th>
                  <th>GST %</th>
                  <th>Product Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${
                  filtered.length === 0
                    ? `
                      <tr>
                        <td colspan="9" style="text-align:center;padding:2.5rem 1rem;color:var(--text-muted);">
                          <div style="font-weight:700;font-size:0.95rem;color:var(--text-main);margin-bottom:0.3rem;">
                            No products created yet.
                          </div>
                          <div style="font-size:0.82rem;margin-bottom:0.85rem;">
                            Create your Categories and Subcategories, then click <strong>+ Create Product</strong> or <strong>Upload Product Excel</strong>.
                          </div>
                          <button type="button" class="btn btn-primary btn-sm" onclick="CycleWorldApp.openProductModal(null)">
                            + Create First Product
                          </button>
                        </td>
                      </tr>
                    `
                    : filtered
                        .map(
                          (p) => `
                  <tr>
                    <td>
                      <div
                        onclick="CycleWorldApp.triggerRowImageUpload('${p.id}')"
                        title="Click to upload or change product image for ${escapeHtml(p.name)}"
                        style="position:relative;width:48px;height:48px;cursor:pointer;display:inline-block;"
                      >
                        <img data-row-img-id="${p.id}" src="${p.imageUrl}" alt="${escapeHtml(p.name)}" style="width:48px;height:48px;border-radius:6px;border:1px solid ${p.hasCustomImage ? '#16a34a' : 'var(--border-color)'};object-fit:contain;background:#f3faf5;" />
                        <span style="position:absolute;bottom:-3px;right:-3px;background:#16a34a;color:#fff;font-size:0.62rem;line-height:1;padding:2px 3px;border-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,0.2);">📷</span>
                      </div>
                    </td>
                    <td>
                      <div style="font-weight:700;font-size:0.84rem;color:var(--text-main);">${escapeHtml(p.categoryName)}</div>
                    </td>
                    <td>
                      <div style="font-size:0.81rem;color:var(--primary);font-weight:700;">${escapeHtml(p.subcategoryName)}</div>
                    </td>
                    <td>
                      <div style="font-weight:700;color:var(--text-main);font-size:0.88rem;">${escapeHtml(p.name)}</div>
                    </td>
                    <td>
                      <div class="mono" style="font-weight:800;font-size:0.95rem;color:${
                        p.stock === 0
                          ? 'var(--danger)'
                          : p.stock <= p.lowStockThreshold
                          ? 'var(--warning)'
                          : 'var(--success)'
                      };">
                        ${p.stock}
                      </div>
                    </td>
                    <td>
                      <div class="mono" style="font-weight:700;font-size:0.88rem;color:var(--text-main);">
                        ${formatCurrency(p.fpPrice)}
                      </div>
                    </td>
                    <td class="mono" style="font-weight:600;">${p.gstPercentage}%</td>
                    <td>
                      <span class="status-badge ${getStatusBadgeClass(p.status)}">${escapeHtml(p.status === 'Inactive' ? 'Inactive' : 'Active')}</span>
                      <div style="font-size:0.69rem;color:var(--text-muted);margin-top:0.2rem;">
                        ${
                          p.adminConfiguredStatus === 'Active' &&
                          p.stock > 0 &&
                          p.categoryStatus === 'Active' &&
                          p.subcategoryStatus === 'Active'
                            ? '🟢 Active'
                            : p.categoryStatus !== 'Active' || p.subcategoryStatus !== 'Active'
                            ? '🚫 Category Disabled'
                            : p.adminConfiguredStatus === 'Inactive'
                            ? '🚫 Inactive'
                            : '🚫 Zero Stock'
                        }
                      </div>
                    </td>
                    <td>
                      <div style="display:flex;gap:0.35rem;flex-wrap:wrap;">
                        <button type="button" class="btn btn-soft btn-xs" onclick="CycleWorldApp.triggerRowImageUpload('${p.id}')" title="Upload or Change Product Image">
                          📷 ${p.hasCustomImage ? 'Photo' : 'Add Photo'}
                        </button>
                        <button type="button" class="btn btn-soft btn-xs" onclick="CycleWorldApp.openQuickStockModal('${p.id}')" title="Quick Update Franchise Quantity, GST & Status">
                          ⚡ Update
                        </button>
                        <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.openProductModal('${p.id}')" title="Edit Product">
                          ✏️ Edit
                        </button>
                        <button
                          type="button"
                          class="btn ${p.adminConfiguredStatus === 'Inactive' ? 'btn-success' : 'btn-outline'} btn-xs"
                          onclick="CycleWorldApp.toggleProductActive('${p.id}')"
                          title="${p.adminConfiguredStatus === 'Inactive' ? 'Set Active' : 'Set Inactive'}"
                        >
                          ${p.adminConfiguredStatus === 'Inactive' ? '✅ Active' : '🚫 Inactive'}
                        </button>
                        <button
                          type="button"
                          class="btn btn-danger btn-xs"
                          onclick="CycleWorldApp.confirmDeleteEntity('PRODUCT', '${p.id}')"
                          title="Delete Product"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                `
                        )
                        .join('')
                }
              </tbody>
            </table>
            <input type="file" id="direct-row-image-input" accept="image/*" style="display:none;" onchange="CycleWorldApp.handleDirectRowImageUpload(event)" />
          </div>
        </div>
      </div>
    `;
  }

  // ----------------------------------------------------------------------------
  // SUPER ADMIN TAB 3: COMMON PRODUCT UPLOAD EXCEL FORMAT (ALL CATEGORIES)
  // ----------------------------------------------------------------------------
  // ----------------------------------------------------------------------------
  // SUPER ADMIN TAB 3: STANDARDIZED PRODUCT UPLOAD (6 COLUMNS)
  // ----------------------------------------------------------------------------
  function renderAdminImportTab() {
    const val = state.importValidationResult;
    const dupMode = state.importDuplicateMode || 'UPDATE';

    return `
      <div class="panel-card">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">ðŸ“¥ Product Excel &amp; CSV Bulk Upload (Standard 6 Columns)</h2>
            <p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.15rem;">
              Standardized Excel template containing 7 fields: <strong>Product Category</strong>, <strong>Product Subcategory</strong>, <strong>Product Name</strong>, <strong>Available Quantity</strong>, <strong>Product Price</strong>, <strong>GST</strong>, and <strong>Product Status â€“ Active or Inactive</strong>. No SKU or HSN codes required.
            </p>
          </div>
          <div style="display:flex;gap:0.6rem;flex-wrap:wrap;">
            <button type="button" class="btn btn-primary btn-sm" onclick="CycleWorldFileImporter.downloadCommonProductExcelTemplate('xls')">
              ðŸ“¥ Download Excel Template (.xls)
            </button>
            <button type="button" class="btn btn-outline btn-sm" onclick="CycleWorldFileImporter.downloadCommonProductExcelTemplate('csv')">
              ðŸ“„ Download CSV Template (.csv)
            </button>
          </div>
        </div>

        <div class="panel-body">
          <!-- Upload Dropzone -->
          <div style="border:2px dashed var(--primary-border);background:var(--bg-subtle);border-radius:var(--radius-md);padding:1.65rem 1.25rem;text-align:center;margin-bottom:1.35rem;">
            <div style="font-size:2rem;margin-bottom:0.35rem;">ðŸ“Š ðŸ“¦</div>
            <h3 style="font-size:1.05rem;font-weight:800;margin-bottom:0.35rem;">
              Upload Product Catalog Excel or CSV File (.XLSX, .XLS, .CSV)
            </h3>
            <p style="font-size:0.82rem;color:var(--text-muted);max-width:820px;margin:0 auto 0.65rem;line-height:1.5;">
              <strong>Standard Columns:</strong> <span class="mono" style="font-weight:700;color:var(--text-main);">Product Category | Product Subcategory | Product Name | Available Quantity | Product Price | GST | Product Status â€“ Active or Inactive</span>
            </p>

            <!-- Duplicate Handling Option -->
            <div style="margin:0 auto 1.1rem;max-width:540px;background:#ffffff;border:1px solid var(--border-color);border-radius:8px;padding:0.75rem 1rem;text-align:left;">
              <div style="font-weight:700;font-size:0.82rem;color:var(--text-main);margin-bottom:0.4rem;">
                âš™ï¸ Duplicate Product Handling Rule:
              </div>
              <div style="display:flex;gap:1.25rem;flex-wrap:wrap;font-size:0.8rem;">
                <label style="display:flex;align-items:center;gap:0.35rem;cursor:pointer;">
                  <input type="radio" name="dupMode" value="UPDATE" ${dupMode !== 'SKIP' ? 'checked' : ''} onchange="CycleWorldApp.setImportDuplicateMode('UPDATE')" />
                  <span><strong>Update Existing Products</strong> (Update Available Qty, Price, GST &amp; Status)</span>
                </label>
                <label style="display:flex;align-items:center;gap:0.35rem;cursor:pointer;">
                  <input type="radio" name="dupMode" value="SKIP" ${dupMode === 'SKIP' ? 'checked' : ''} onchange="CycleWorldApp.setImportDuplicateMode('SKIP')" />
                  <span><strong>Skip Duplicates</strong> (Keep existing products unchanged)</span>
                </label>
              </div>
            </div>

            <div style="display:flex;justify-content:center;gap:0.85rem;flex-wrap:wrap;">
              <button type="button" class="btn btn-outline" onclick="CycleWorldFileImporter.downloadCommonProductExcelTemplate('xls')">
                ðŸ“¥ Download Excel Template (.xls)
              </button>
              <button type="button" class="btn btn-outline" onclick="CycleWorldFileImporter.downloadCommonProductExcelTemplate('csv')">
                ðŸ“„ Download CSV Template (.csv)
              </button>
              <label class="btn btn-primary" style="cursor:pointer;">
                ðŸ“¤ Upload Product Excel / CSV
                <input type="file" accept=".xlsx,.xls,.csv,.tsv" style="display:none;" onchange="CycleWorldApp.handleFileUploadChange(event)" />
              </label>
            </div>
          </div>

          ${
            !val
              ? `
                <!-- Reference Table Showing 6 Columns -->
                <div style="background:#fff;border:1px solid var(--border-color);border-radius:var(--radius-sm);padding:1.1rem;">
                  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.65rem;">
                    <div style="font-weight:800;font-size:0.9rem;color:var(--text-main);">
                      ðŸ“‹ Standard 6-Column Format Preview
                    </div>
                    <span class="status-badge status-active">Standard 7-Field Format</span>
                  </div>
                  <div class="table-responsive">
                    <table class="data-table" style="font-size:0.78rem;">
                      <thead>
                        <tr>
                          <th>Product Category</th>
                          <th>Product Subcategory</th>
                          <th>Product Name</th>
                          <th>Available Quantity</th>
                          <th>Product Price</th>
                          <th>GST</th>
                          <th>Product Status â€“ Active or Inactive</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><strong>Bicycle</strong></td>
                          <td>Kids</td>
                          <td>Cycle World Champ 16T Kids Bicycle (Red)</td>
                          <td class="mono" style="font-weight:700;">â‚¹3,499</td>
                          <td class="mono" style="font-weight:700;">30</td>
                          <td class="mono">12</td>
                          <td><span class="status-badge status-active">Active</span></td>
                        </tr>
                        <tr>
                          <td><strong>Bicycle</strong></td>
                          <td>Junior</td>
                          <td>Cycle World Velocity 24T Junior Geared Bicycle (Black)</td>
                          <td class="mono" style="font-weight:700;">â‚¹6,499</td>
                          <td class="mono" style="font-weight:700;">15</td>
                          <td class="mono">12</td>
                          <td><span class="status-badge status-active">Active</span></td>
                        </tr>
                        <tr>
                          <td><strong>Bicycle Accessories</strong></td>
                          <td>BELL</td>
                          <td>Premium Brass Dome Cycle Bell</td>
                          <td class="mono" style="font-weight:700;">â‚¹149</td>
                          <td class="mono" style="font-weight:700;">50</td>
                          <td class="mono">18</td>
                          <td><span class="status-badge status-active">Active</span></td>
                        </tr>
                        <tr>
                          <td><strong>Bicycle Accessories</strong></td>
                          <td>HELMET</td>
                          <td>Cycle World AeroPro Adult Cycling Helmet (Matte Black)</td>
                          <td class="mono" style="font-weight:700;">â‚¹899</td>
                          <td class="mono" style="font-weight:700;">35</td>
                          <td class="mono">18</td>
                          <td><span class="status-badge status-active">Active</span></td>
                        </tr>
                        <tr>
                          <td><strong>Tricycle</strong></td>
                          <td>Kids Tricycle</td>
                          <td>Cycle World JoyRide Deluxe Kids Tricycle (Pink)</td>
                          <td class="mono" style="font-weight:700;">â‚¹1,899</td>
                          <td class="mono" style="font-weight:700;">20</td>
                          <td class="mono">12</td>
                          <td><span class="status-badge status-active">Active</span></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              `
              : `
                <!-- VALIDATION PREVIEW REPORT -->
                <div style="border:2px solid var(--primary);border-radius:var(--radius-md);padding:1.25rem;background:#ffffff;">
                  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.75rem;margin-bottom:1rem;padding-bottom:0.85rem;border-bottom:1px solid var(--border-color);">
                    <div>
                      <span class="status-badge status-new">EXCEL IMPORT VALIDATION PREVIEW</span>
                      <h3 style="font-size:1.1rem;font-weight:800;margin-top:0.3rem;">
                        File: ${escapeHtml(state.importFileName)} â€” ${val.totalRowsFound} Rows Analyzed
                      </h3>
                      <div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.2rem;">
                        Duplicate Mode: <strong>${val.duplicateHandling === 'SKIP' ? 'Skip Duplicates' : 'Update Existing Products'}</strong>
                      </div>
                    </div>
                    <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">
                      ${
                        (val.skippedDuplicates.length > 0 || val.failedRecords.length > 0)
                          ? `<button type="button" class="btn btn-danger btn-sm" onclick="CycleWorldApp.downloadImportErrorReport()">
                              ðŸ“¥ Download Error &amp; Skipped Report (${val.skippedDuplicates.length + val.failedRecords.length} Rows)
                            </button>`
                          : ''
                      }
                      <button type="button" class="btn btn-outline btn-sm" onclick="CycleWorldApp.clearImportPreview()">
                        âœ• Cancel Preview
                      </button>
                    </div>
                  </div>

                  <!-- 4 SUMMARY BUCKETS (REQUIREMENT 6) -->
                  <div class="kpi-grid" style="margin-bottom:1.15rem;">
                    <div class="kpi-card kpi-success">
                      <div class="kpi-label">Existing Products to Update</div>
                      <div class="kpi-value">${val.existingUpdates.length}</div>
                      <div class="kpi-sub">Matched by Category + Subcat + Name</div>
                    </div>
                    <div class="kpi-card kpi-info">
                      <div class="kpi-label">New Products to Create</div>
                      <div class="kpi-value">${val.newProductsToAdd.length}</div>
                      <div class="kpi-sub">Ready to add to catalog</div>
                    </div>
                    <div class="kpi-card kpi-warning">
                      <div class="kpi-label">Skipped Duplicates</div>
                      <div class="kpi-value">${val.skippedDuplicates.length}</div>
                      <div class="kpi-sub">Duplicates skipped</div>
                    </div>
                    <div class="kpi-card kpi-danger">
                      <div class="kpi-label">Failed Records</div>
                      <div class="kpi-value">${val.failedRecords.length}</div>
                      <div class="kpi-sub">Missing required data</div>
                    </div>
                  </div>

                  <!-- EXISTING PRODUCTS TO UPDATE TABLE -->
                  ${
                    val.existingUpdates.length > 0
                      ? `
                    <h4 style="font-size:0.9rem;font-weight:700;margin-bottom:0.5rem;color:var(--success);">
                      âœ… ${val.existingUpdates.length} Existing Products Will Be Updated
                    </h4>
                    <div class="table-responsive" style="margin-bottom:1.2rem;">
                      <table class="data-table">
                        <thead>
                          <tr>
                            <th>Row</th>
                            <th>Product Category</th>
                            <th>Subcategory</th>
                            <th>Product Name</th>
                            <th>FP Price (Old â†’ New)</th>
                            <th>Franchise Qty (Old â†’ New)</th>
                            <th>GST % (Old â†’ New)</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${val.existingUpdates
                            .map(
                              (u) => `
                            <tr>
                              <td class="mono">#${u.rowNumber}</td>
                              <td>${escapeHtml(u.categoryName)}</td>
                              <td>${escapeHtml(u.subcategoryName)}</td>
                              <td style="font-weight:600;">${escapeHtml(u.newName)}</td>
                              <td class="mono">${formatCurrency(u.oldFpPrice)} â†’ <strong>${formatCurrency(u.newFpPrice)}</strong></td>
                              <td class="mono">${u.oldStock} â†’ <strong>${u.newStock}</strong></td>
                              <td class="mono">${u.oldGst}% â†’ <strong>${u.newGst}%</strong></td>
                              <td><span class="status-badge ${getStatusBadgeClass(u.productStatus)}">${escapeHtml(u.productStatus)}</span></td>
                            </tr>
                          `
                            )
                            .join('')}
                        </tbody>
                      </table>
                    </div>
                  `
                      : ''
                  }

                  <!-- NEW PRODUCTS TO CREATE TABLE -->
                  ${
                    val.newProductsToAdd.length > 0
                      ? `
                    <div style="background:var(--primary-soft);border:1px solid var(--primary-border);border-radius:var(--radius-sm);padding:0.95rem;margin-bottom:1.2rem;">
                      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;margin-bottom:0.65rem;">
                        <div>
                          <h4 style="font-size:0.9rem;font-weight:800;color:var(--text-main);">
                            ðŸ†• ${val.newProductsToAdd.length} New Product(s) Ready to Create
                          </h4>
                          <p style="font-size:0.78rem;color:var(--text-secondary);">
                            Keep confirmation box checked to add these new products to your catalog.
                          </p>
                        </div>
                        <label style="display:flex;align-items:center;gap:0.5rem;background:#ffffff;padding:0.45rem 0.8rem;border-radius:6px;border:1px solid var(--primary);font-weight:700;font-size:0.83rem;cursor:pointer;">
                          <input
                            type="checkbox"
                            ${state.importConfirmNewSkus ? 'checked' : ''}
                            onchange="CycleWorldApp.toggleConfirmNewSkus(this.checked)"
                            style="width:16px;height:16px;"
                          />
                          Confirm Creation of ${val.newProductsToAdd.length} New Product(s)
                        </label>
                      </div>
                      <div class="table-responsive">
                        <table class="data-table" style="background:#ffffff;">
                          <thead>
                            <tr>
                              <th>Row</th>
                              <th>Product Category</th>
                              <th>Subcategory</th>
                              <th>Product Name</th>
                              <th>FP Price (â‚¹)</th>
                              <th>Franchise Quantity</th>
                              <th>GST %</th>
                              <th>Product Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${val.newProductsToAdd
                              .map(
                                (nw) => `
                              <tr>
                                <td class="mono">#${nw.rowNumber}</td>
                                <td>${escapeHtml(nw.categoryName)}</td>
                                <td>${escapeHtml(nw.subcategoryName)}</td>
                                <td style="font-weight:600;">${escapeHtml(nw.productName)}</td>
                                <td class="mono" style="font-weight:700;">${nw.stock}</td>
                                <td class="mono" style="font-weight:700;">${formatCurrency(nw.fpPrice)}</td>
                                <td class="mono">${nw.gstPercentage}%</td>
                                <td><span class="status-badge ${getStatusBadgeClass(nw.productStatus)}">${escapeHtml(nw.productStatus)}</span></td>
                              </tr>
                            `
                              )
                              .join('')}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  `
                      : ''
                  }

                  <!-- SKIPPED DUPLICATES -->
                  ${
                    val.skippedDuplicates.length > 0
                      ? `
                    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:var(--radius-sm);padding:0.95rem;margin-bottom:1.2rem;">
                      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;flex-wrap:wrap;gap:0.4rem;">
                        <h4 style="font-size:0.9rem;font-weight:800;color:#92400e;margin:0;">
                          âš ï¸ Skipped Duplicates (${val.skippedDuplicates.length} Rows)
                        </h4>
                        <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.downloadImportErrorReport()">
                          ðŸ“¥ Download Skipped &amp; Error Report
                        </button>
                      </div>
                      <ul style="padding-left:1.25rem;font-size:0.81rem;color:#92400e;line-height:1.6;margin:0;">
                        ${val.skippedDuplicates
                          .map(
                            (s) =>
                              `<li><strong>Row #${s.rowNumber} [${escapeHtml(s.productName)}]:</strong> ${escapeHtml(s.reason)}</li>`
                          )
                          .join('')}
                      </ul>
                    </div>
                  `
                      : ''
                  }

                  <!-- FAILED RECORDS -->
                  ${
                    val.failedRecords.length > 0
                      ? `
                    <div style="background:var(--danger-soft);border:1px solid #fecaca;border-radius:var(--radius-sm);padding:0.95rem;margin-bottom:1.2rem;">
                      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;flex-wrap:wrap;gap:0.4rem;">
                        <h4 style="font-size:0.9rem;font-weight:800;color:#991b1b;margin:0;">
                          ðŸš« Failed / Invalid Records (${val.failedRecords.length} Rows)
                        </h4>
                        <button type="button" class="btn btn-danger btn-xs" onclick="CycleWorldApp.downloadImportErrorReport()">
                          ðŸ“¥ Download Error Report (.csv)
                        </button>
                      </div>
                      <ul style="padding-left:1.25rem;font-size:0.81rem;color:#991b1b;line-height:1.6;margin:0;">
                        ${val.failedRecords
                          .map(
                            (inv) =>
                              `<li><strong>Row #${inv.rowNumber} [${escapeHtml(inv.productName)}]:</strong> ${escapeHtml(inv.reason)}</li>`
                          )
                          .join('')}
                      </ul>
                    </div>
                  `
                      : ''
                  }

                  <!-- ACTION BUTTONS -->
                  <div style="display:flex;justify-content:flex-end;gap:0.75rem;align-items:center;flex-wrap:wrap;">
                    ${
                      (val.skippedDuplicates.length > 0 || val.failedRecords.length > 0)
                        ? `<button type="button" class="btn btn-outline" onclick="CycleWorldApp.downloadImportErrorReport()">
                            ðŸ“¥ Download Error &amp; Skipped Report (.csv)
                          </button>`
                        : ''
                    }
                    <button type="button" class="btn btn-outline" onclick="CycleWorldApp.clearImportPreview()">
                      Cancel
                    </button>
                    <button type="button" class="btn btn-success" onclick="CycleWorldApp.confirmApplyBulkImport()">
                      âœ… Confirm &amp; Apply Import (${
                        val.existingUpdates.length +
                        (state.importConfirmNewSkus ? val.newProductsToAdd.length : 0)
                      } Products)
                    </button>
                  </div>
                </div>
              `
          }
        </div>
      </div>
    `;
  }
  // SUPER ADMIN TAB 4: MULTI-LEVEL CATEGORIES, SUB-CATEGORIES, GROUPS & MRP
  // ----------------------------------------------------------------------------
  function renderAdminCategoriesTab() {
    const catsTree = API.getCategoriesTree({ activeOnly: false });

    return `
      <div class="panel-card">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">🗂️ Multi-Level Category, Sub-Category Groups &amp; MRP Management (${catsTree.length} Categories)</h2>
            <p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.15rem;">
              Manage Categories → Sub-Categories → Default &amp; Custom Sub-Category Groups (Size, Model, Color, Type, Brand / Series), set Group MRP, and Remove/Delete any unwanted group at any time.
            </p>
          </div>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            <button type="button" class="btn btn-outline btn-sm" onclick="CycleWorldApp.openSubcategoryModal(null)">
              + Create Subcategory
            </button>
            <button type="button" class="btn btn-primary btn-sm" onclick="CycleWorldApp.openCategoryModal(null)">
              + Create Category
            </button>
          </div>
        </div>

        <div class="panel-body">
          ${
            catsTree.length === 0
              ? `
                <div style="text-align:center;padding:2.75rem 1rem;border:1px dashed var(--border-strong);border-radius:var(--radius-md);background:var(--bg-subtle);">
                  <div style="font-size:2rem;margin-bottom:0.4rem;">🗂️</div>
                  <h3 style="font-size:1.02rem;font-weight:700;">No Categories Created Yet</h3>
                  <p style="font-size:0.83rem;color:var(--text-muted);margin:0.25rem 0 1rem;">
                    Click <strong>+ Create Category</strong> to add your first category (e.g., Bicycle, Tricycle, Bicycle Accessories), then add sub-categories and manage Sub-Category Groups &amp; MRP under it.
                  </p>
                  <button type="button" class="btn btn-primary btn-sm" onclick="CycleWorldApp.openCategoryModal(null)">
                    + Create First Category
                  </button>
                </div>
              `
              : `
                <div style="display:grid;gap:1.15rem;">
                  ${catsTree
                    .map(
                      (cat) => `
                    <div style="border:1px solid var(--border-color);border-radius:var(--radius-md);background:#fff;overflow:hidden;">
                      <div style="padding:0.9rem 1.15rem;background:var(--bg-subtle);border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
                        <div>
                          <div style="display:flex;align-items:center;gap:0.5rem;">
                            <span style="font-size:0.73rem;font-weight:800;text-transform:uppercase;color:var(--primary);background:var(--primary-soft);padding:0.15rem 0.5rem;border-radius:4px;border:1px solid var(--primary-border);">Category</span>
                            <strong style="font-size:1.04rem;">${escapeHtml(cat.name)}</strong>
                            <span class="status-badge ${getStatusBadgeClass(cat.status)}">${cat.status === 'Inactive' ? 'Disabled (Inactive)' : 'Enabled (Active)'}</span>
                          </div>
                          <div style="font-size:0.76rem;color:var(--text-muted);margin-top:0.2rem;">
                            ${escapeHtml(cat.description || 'Top-level category')} • ${cat.subcategories.length} Sub-Categories • ${cat.productCount} Products
                          </div>
                        </div>
                        <div style="display:flex;gap:0.35rem;flex-wrap:wrap;">
                          <button type="button" class="btn btn-primary btn-xs" onclick="CycleWorldApp.openSubcategoryModal(null, '${cat.id}')">
                            + Add Subcategory
                          </button>
                          <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.openCategoryModal('${cat.id}')">
                            ✏️ Edit
                          </button>
                          <button
                            type="button"
                            class="btn ${cat.status === 'Inactive' ? 'btn-success' : 'btn-outline'} btn-xs"
                            onclick="CycleWorldApp.toggleCategoryActive('${cat.id}')"
                          >
                            ${cat.status === 'Inactive' ? '✅ Enable' : '🚫 Disable'}
                          </button>
                          <button
                            type="button"
                            class="btn btn-danger btn-xs"
                            onclick="CycleWorldApp.confirmDeleteEntity('CATEGORY', '${cat.id}')"
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </div>

                      <div style="padding:0.85rem 1.15rem;">
                        ${
                          cat.subcategories.length === 0
                            ? `<div style="font-size:0.82rem;color:var(--text-muted);padding:0.4rem 0;">No sub-categories yet under <strong>${escapeHtml(cat.name)}</strong>. Click <strong>+ Add Subcategory</strong> above.</div>`
                            : `
                          <div class="table-responsive">
                            <table class="data-table">
                              <thead>
                                <tr>
                                  <th style="width:20%;">Sub-Category</th>
                                  <th style="width:48%;">Sub-Category Groups, MRP &amp; Values (Add / Edit / Remove Groups)</th>
                                  <th style="width:8%;">Products</th>
                                  <th style="width:9%;">Status</th>
                                  <th style="width:15%;">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                ${cat.subcategories
                                  .map((sub) => {
                                    const groups = sub.groups || [];
                                    return `
                                    <tr>
                                      <td>
                                        <div style="font-weight:700;font-size:0.9rem;color:var(--text-main);">↳ ${escapeHtml(sub.name)}</div>
                                        ${sub.description ? `<div style="font-size:0.73rem;color:var(--text-muted);">${escapeHtml(sub.description)}</div>` : ''}
                                      </td>
                                      <td>
                                        ${
                                          groups.length === 0
                                            ? `<div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                                                <span style="font-size:0.78rem;color:var(--text-muted);">No Sub-Category Groups active.</span>
                                                <button type="button" class="btn btn-soft btn-xs" onclick="CycleWorldApp.handleSeedDefaultSubcategoryGroups('${sub.id}')">
                                                  ⚡ Load Default Groups (Size, Model, Color, Type, Brand / Series)
                                                </button>
                                                <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.openSubcategoryGroupsModal('${sub.id}')">
                                                  + Custom Groups &amp; MRP
                                                </button>
                                              </div>`
                                            : `<div style="display:flex;flex-direction:column;gap:0.4rem;">
                                                ${groups
                                                  .map(
                                                    (g) => `
                                                  <div style="font-size:0.78rem;line-height:1.4;display:flex;align-items:center;justify-content:space-between;gap:0.5rem;background:var(--bg-subtle);border:1px solid var(--border-color);border-radius:6px;padding:0.28rem 0.55rem;flex-wrap:wrap;">
                                                    <div>
                                                      <strong style="color:var(--primary-hover);">${escapeHtml(g.name)}</strong>
                                                      ${
                                                        g.mrp > 0
                                                          ? `<span style="display:inline-block;background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;border-radius:4px;padding:0.05rem 0.4rem;margin-left:0.35rem;font-size:0.71rem;font-weight:800;">MRP: ${formatCurrency(g.mrp)}</span>`
                                                          : ''
                                                      }:
                                                      ${
                                                        g.items.length === 0
                                                          ? `<span style="color:var(--text-muted);font-style:italic;margin-left:0.25rem;">(no values yet)</span>`
                                                          : g.items
                                                              .map(
                                                                (it) =>
                                                                  `<span style="display:inline-block;background:#ffffff;border:1px solid var(--border-color);border-radius:4px;padding:0.05rem 0.4rem;margin:0.1rem 0.15rem;font-size:0.73rem;font-weight:600;">${escapeHtml(it.value)}</span>`
                                                              )
                                                              .join('')
                                                      }
                                                    </div>
                                                    <div style="display:flex;align-items:center;gap:0.25rem;">
                                                      <button
                                                        type="button"
                                                        class="btn btn-outline btn-xs"
                                                        style="padding:0.12rem 0.4rem;font-size:0.69rem;"
                                                        title="Set or Edit MRP for ${escapeHtml(g.name)}"
                                                        onclick="CycleWorldApp.promptEditSubcategoryGroupMrp('${g.id}', '${escapeHtml(g.name).replace(/'/g, "\\'")}', '${g.mrp || 0}')"
                                                      >
                                                        ₹ MRP
                                                      </button>
                                                      <button
                                                        type="button"
                                                        class="btn btn-danger btn-xs"
                                                        style="padding:0.12rem 0.4rem;font-size:0.69rem;"
                                                        title="Remove / Delete Group ${escapeHtml(g.name)}"
                                                        onclick="CycleWorldApp.handleDeleteSubcategoryGroup('${g.id}', '${escapeHtml(g.name).replace(/'/g, "\\'")}')"
                                                      >
                                                        ✕ Remove
                                                      </button>
                                                    </div>
                                                  </div>
                                                `
                                                  )
                                                  .join('')}
                                                <div style="margin-top:0.2rem;display:flex;gap:0.4rem;flex-wrap:wrap;">
                                                  <button type="button" class="btn btn-soft btn-xs" onclick="CycleWorldApp.openSubcategoryGroupsModal('${sub.id}')">
                                                    ⚙️ Manage Groups, MRP &amp; Values (${groups.length} Groups)
                                                  </button>
                                                </div>
                                              </div>`
                                        }
                                      </td>
                                      <td class="mono" style="font-weight:700;">${sub.productCount}</td>
                                      <td><span class="status-badge ${getStatusBadgeClass(sub.status)}">${sub.status === 'Inactive' ? 'Disabled' : 'Enabled'}</span></td>
                                      <td>
                                        <div style="display:flex;gap:0.35rem;flex-wrap:wrap;">
                                          <button type="button" class="btn btn-primary btn-xs" onclick="CycleWorldApp.openSubcategoryGroupsModal('${sub.id}')" title="Add, Edit, Set MRP & Remove Sub-Category Groups">
                                            🧩 Groups &amp; MRP (${groups.length})
                                          </button>
                                          <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.openSubcategoryModal('${sub.id}')">
                                            ✏️ Edit
                                          </button>
                                          <button
                                            type="button"
                                            class="btn ${sub.status === 'Inactive' ? 'btn-success' : 'btn-outline'} btn-xs"
                                            onclick="CycleWorldApp.toggleSubcategoryActive('${sub.id}')"
                                          >
                                            ${sub.status === 'Inactive' ? '✅ Enable' : '🚫 Disable'}
                                          </button>
                                          <button
                                            type="button"
                                            class="btn btn-danger btn-xs"
                                            onclick="CycleWorldApp.confirmDeleteEntity('SUBCATEGORY', '${sub.id}')"
                                          >
                                            🗑️ Delete
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  `;
                                  })
                                  .join('')}
                              </tbody>
                            </table>
                          </div>
                        `
                        }
                      </div>
                    </div>
                  `
                    )
                    .join('')}
                </div>
              `
          }
        </div>
      </div>
    `;
  }

  // ----------------------------------------------------------------------------
  // SUPER ADMIN TAB 5: CUSTOMER / STORE USER MANAGEMENT (Requirement 6)
  // ----------------------------------------------------------------------------
  function renderAdminCustomersTab() {
    const allCustomers = API.getCustomersList();
    const q = state.adminCustomerSearch.trim().toLowerCase();

    const filtered = allCustomers.filter((c) => {
      if (
        state.adminCustomerStatusFilter !== 'ALL' &&
        c.status !== state.adminCustomerStatusFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        c.customerCode.toLowerCase().includes(q) ||
        c.storeName.toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.city && c.city.toLowerCase().includes(q)) ||
        (c.gstNumber && c.gstNumber.toLowerCase().includes(q))
      );
    });

    return `
      <div class="panel-card">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">🏪 Customer / Store Login Management (${allCustomers.length} Accounts)</h2>
            <p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.15rem;">
              Manually create individual customer/store login accounts and share the Customer Login ID and Password with the store.
            </p>
          </div>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            <button type="button" class="btn btn-primary btn-sm" onclick="CycleWorldApp.openCustomerModal(null)">
              + Create Customer Account
            </button>
          </div>
        </div>

        <div class="panel-body">
          <div class="toolbar-row">
            <div class="search-input-wrap">
              <span class="search-icon">🔍</span>
              <input
                type="text"
                class="form-control"
                placeholder="Search by Customer Login ID, Store Name, Contact, or GST..."
                value="${escapeHtml(state.adminCustomerSearch)}"
                oninput="CycleWorldApp.updateAdminCustomerFilter('search', this.value)"
              />
            </div>

            <select class="form-control" style="width:auto;min-width:180px;" onchange="CycleWorldApp.updateAdminCustomerFilter('status', this.value)">
              <option value="ALL" ${state.adminCustomerStatusFilter === 'ALL' ? 'selected' : ''}>All Accounts (${allCustomers.length})</option>
              <option value="Active" ${state.adminCustomerStatusFilter === 'Active' ? 'selected' : ''}>Active (Enabled)</option>
              <option value="Inactive" ${state.adminCustomerStatusFilter === 'Inactive' ? 'selected' : ''}>Inactive (Disabled)</option>
            </select>
          </div>

          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Customer Login ID</th>
                  <th>Customer / Store Name</th>
                  <th>Email ID</th>
                  <th>Contact Details</th>
                  <th>Address</th>
                  <th>GST Details</th>
                  <th>Account Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${
                  filtered.length === 0
                    ? `
                      <tr>
                        <td colspan="8" style="text-align:center;padding:2.5rem 1rem;color:var(--text-muted);">
                          <div style="font-weight:700;font-size:0.95rem;color:var(--text-main);margin-bottom:0.3rem;">
                            No Customer Accounts Created Yet
                          </div>
                          <div style="font-size:0.82rem;margin-bottom:0.85rem;">
                            Click <strong>+ Create Customer Account</strong> to manually create a Customer Login ID and Password for a store.
                          </div>
                          <button type="button" class="btn btn-primary btn-sm" onclick="CycleWorldApp.openCustomerModal(null)">
                            + Create Customer Account
                          </button>
                        </td>
                      </tr>
                    `
                    : filtered
                        .map(
                          (c) => `
                  <tr>
                    <td><span class="sku-pill">${escapeHtml(c.customerCode)}</span></td>
                    <td>
                      <div style="font-weight:700;">${escapeHtml(c.storeName)}</div>
                      ${c.storeDetails ? `<div style="font-size:0.74rem;color:var(--text-muted);">${escapeHtml(c.storeDetails)}</div>` : ''}
                    </td>
                    <td class="mono" style="font-size:0.8rem;">${escapeHtml(c.email || '—')}</td>
                    <td>
                      ${c.contactPerson ? `<div style="font-weight:600;">${escapeHtml(c.contactPerson)}</div>` : ''}
                      <div style="font-size:0.78rem;color:var(--text-secondary);">${escapeHtml(c.phone)}</div>
                    </td>
                    <td style="font-size:0.8rem;">${escapeHtml(c.address)}${c.city ? ', ' + escapeHtml(c.city) : ''}</td>
                    <td class="mono" style="font-size:0.79rem;">${escapeHtml(c.gstNumber || '—')}</td>
                    <td><span class="status-badge ${getStatusBadgeClass(c.status)}">${c.status === 'Inactive' ? 'Disabled (Inactive)' : 'Enabled (Active)'}</span></td>
                    <td>
                      <div style="display:flex;gap:0.35rem;flex-wrap:wrap;">
                        <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.openCustomerModal('${c.id}')">
                          ✏️ Edit
                        </button>
                        <button
                          type="button"
                          class="btn ${c.status === 'Inactive' ? 'btn-success' : 'btn-outline'} btn-xs"
                          onclick="CycleWorldApp.toggleCustomerActive('${c.id}')"
                        >
                          ${c.status === 'Inactive' ? '✅ Enable' : '🚫 Disable'}
                        </button>
                        <button
                          type="button"
                          class="btn btn-danger btn-xs"
                          onclick="CycleWorldApp.confirmDeleteEntity('CUSTOMER', '${c.id}')"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                `
                        )
                        .join('')
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // ----------------------------------------------------------------------------
  // SUPER ADMIN TAB 6: EMPLOYEE / BILLING USER MANAGEMENT
  // ----------------------------------------------------------------------------
  function renderAdminEmployeesTab() {
    const employees = API.getEmployeesList();

    return `
      <div class="panel-card">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">🧾 Employee / Billing User Management (${employees.length})</h2>
            <p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.15rem;">
              Create login credentials for billing/order processing employees.
            </p>
          </div>
          <button type="button" class="btn btn-primary btn-sm" onclick="CycleWorldApp.openEmployeeModal(null)">
            + Create Employee / Billing Login
          </button>
        </div>

        <div class="panel-body">
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Employee Login ID</th>
                  <th>Employee Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Designation</th>
                  <th>Account Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${
                  employees.length === 0
                    ? `<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-muted);">No employee/billing accounts created yet.</td></tr>`
                    : employees
                        .map(
                          (e) => `
                  <tr>
                    <td><span class="sku-pill">${escapeHtml(e.employeeCode)}</span></td>
                    <td style="font-weight:700;">${escapeHtml(e.fullName)}</td>
                    <td class="mono">${escapeHtml(e.email || '—')}</td>
                    <td>${escapeHtml(e.phone || '—')}</td>
                    <td>${escapeHtml(e.designation)}</td>
                    <td><span class="status-badge ${getStatusBadgeClass(e.status)}">${e.status === 'Inactive' ? 'Disabled (Inactive)' : 'Enabled (Active)'}</span></td>
                    <td>
                      <div style="display:flex;gap:0.35rem;flex-wrap:wrap;">
                        <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.openEmployeeModal('${e.id}')">
                          ✏️ Edit
                        </button>
                        <button
                          type="button"
                          class="btn ${e.status === 'Inactive' ? 'btn-success' : 'btn-outline'} btn-xs"
                          onclick="CycleWorldApp.toggleEmployeeActive('${e.id}')"
                        >
                          ${e.status === 'Inactive' ? '✅ Enable' : '🚫 Disable'}
                        </button>
                        <button
                          type="button"
                          class="btn btn-danger btn-xs"
                          onclick="CycleWorldApp.confirmDeleteEntity('EMPLOYEE', '${e.id}')"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                `
                        )
                        .join('')
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // ----------------------------------------------------------------------------
  // SUPER ADMIN TAB 7: ORDER MANAGEMENT
  // ----------------------------------------------------------------------------
  function renderAdminOrdersTab() {
    const allOrders = API.getOrders();
    const q = state.adminOrderSearch.trim().toLowerCase();

    const filtered = allOrders.filter((o) => {
      if (state.adminOrderStatusFilter !== 'ALL' && o.status !== state.adminOrderStatusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        o.orderNumber.toLowerCase().includes(q) ||
        o.storeName.toLowerCase().includes(q) ||
        o.customerCode.toLowerCase().includes(q)
      );
    });

    const statuses = [
      'New',
      'Confirmed',
      'Processing',
      'Ready for Billing',
      'Dispatched',
      'Completed',
      'Cancelled'
    ];

    return `
      <div class="panel-card">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">📦 Wholesale Order Management &amp; Order Punch Register (${allOrders.length} Total Orders)</h2>
            <p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.15rem;">
              View complete customer orders &amp; product variants, track/update order status, download Order PDF, and print directly on A4.
            </p>
          </div>
          ${
            allOrders.length > 0
              ? `<button type="button" class="btn btn-outline btn-sm" onclick="CycleWorldApp.exportAllOrdersCsv()">
                  📥 Export Orders Summary (CSV)
                </button>`
              : ''
          }
        </div>

        <div class="panel-body">
          <div class="toolbar-row">
            <div class="search-input-wrap">
              <span class="search-icon">🔍</span>
              <input
                type="text"
                class="form-control"
                placeholder="Search by Order Number, Customer Store Name, or Customer ID..."
                value="${escapeHtml(state.adminOrderSearch)}"
                oninput="CycleWorldApp.updateAdminOrderFilter('search', this.value)"
              />
            </div>

            <select class="form-control" style="width:auto;min-width:195px;" onchange="CycleWorldApp.updateAdminOrderFilter('status', this.value)">
              <option value="ALL">All Order Statuses (${allOrders.length})</option>
              ${statuses
                .map(
                  (st) =>
                    `<option value="${st}" ${
                      state.adminOrderStatusFilter === st ? 'selected' : ''
                    }>${st}</option>`
                )
                .join('')}
            </select>
          </div>

          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Order Number</th>
                  <th>Order Date</th>
                  <th>Customer / Store</th>
                  <th>Items / Qty</th>
                  <th>Total Amount</th>
                  <th>GST Amount</th>
                  <th>Grand Total</th>
                  <th>Order Status</th>
                  <th>Order Punch / PDF / Print</th>
                </tr>
              </thead>
              <tbody>
                ${
                  filtered.length === 0
                    ? `<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--text-muted);">No orders found.</td></tr>`
                    : filtered
                        .map(
                          (o) => `
                  <tr>
                    <td class="mono" style="font-weight:800;color:var(--primary-hover);">${escapeHtml(o.orderNumber)}</td>
                    <td style="font-size:0.79rem;">${formatDateTime(o.createdAt)}</td>
                    <td>
                      <div style="font-weight:700;">${escapeHtml(o.storeName)}</div>
                      <div class="mono" style="font-size:0.73rem;color:var(--text-muted);">ID: ${escapeHtml(o.customerCode)}</div>
                    </td>
                    <td class="mono">${o.itemCount} SKUs (${o.totalQuantity} pcs)</td>
                    <td class="mono">${formatCurrency(o.subtotalAmount)}</td>
                    <td class="mono">${formatCurrency(o.gstAmount)}</td>
                    <td class="mono" style="font-weight:800;">${formatCurrency(o.totalAmount)}</td>
                    <td>
                      <select
                        class="form-control"
                        style="padding:0.28rem 0.5rem;font-size:0.78rem;font-weight:700;width:auto;"
                        onchange="CycleWorldApp.handleOrderStatusChange('${o.id}', this.value)"
                      >
                        ${statuses
                          .map(
                            (st) =>
                              `<option value="${st}" ${o.status === st ? 'selected' : ''}>${st}</option>`
                          )
                          .join('')}
                      </select>
                    </td>
                    <td>
                      <div style="display:flex;gap:0.35rem;flex-wrap:wrap;">
                        <button type="button" class="btn btn-primary btn-xs" onclick="CycleWorldApp.openOrderDetailModal('${o.id}')">
                          👁️ View Order
                        </button>
                        <button type="button" class="btn btn-navy btn-xs" onclick="CycleWorldApp.downloadOrderPdf('${o.id}')">
                          📥 Download PDF
                        </button>
                        <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.printOrderDirectly('${o.id}')">
                          🖨️ Print
                        </button>
                        <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.downloadSingleOrderCsv('${o.id}')">
                          CSV
                        </button>
                      </div>
                    </td>
                  </tr>
                `
                        )
                        .join('')
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // ----------------------------------------------------------------------------
  // SUPER ADMIN TAB 8: COMPANY SETTINGS
  // ----------------------------------------------------------------------------
  function renderAdminCompanyTab() {
    const cs = API.getCompanySettings();

    return `
      <div class="form-grid-2">
        <div class="panel-card">
          <div class="panel-header">
            <h2 class="panel-title">🏢 Cycle World Company &amp; GST Settings</h2>
          </div>
          <div class="panel-body">
            <form onsubmit="CycleWorldApp.handleSaveCompanySettings(event)">
              <div style="display:flex;align-items:center;gap:1rem;padding:0.85rem;background:var(--bg-subtle);border:1px solid var(--border-color);border-radius:var(--radius-sm);margin-bottom:1.1rem;">
                <img id="company-logo-preview" src="${cs.logoUrl}" alt="Cycle World Logo" style="height:48px;width:auto;background:#fff;padding:4px;border-radius:6px;border:1px solid var(--border-color);" />
                <div style="flex:1;">
                  <div style="font-size:0.82rem;font-weight:700;">Cycle World Official Logo</div>
                  <div style="display:flex;gap:0.45rem;flex-wrap:wrap;margin-top:0.35rem;">
                    <label class="btn btn-outline btn-xs" style="cursor:pointer;">
                      Upload Logo Image
                      <input type="file" accept="image/*" style="display:none;" onchange="CycleWorldApp.handleLogoUpload(event)" />
                    </label>
                    <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.handleResetDefaultLogo()">
                      Reset Default Logo
                    </button>
                  </div>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Company Name</label>
                <input type="text" name="companyName" class="form-control" value="${escapeHtml(cs.companyName)}" required />
              </div>

              <div class="form-group">
                <label class="form-label">Tagline / Subtitle</label>
                <input type="text" name="tagline" class="form-control" value="${escapeHtml(cs.tagline)}" />
              </div>

              <div class="form-grid-2">
                <div class="form-group">
                  <label class="form-label">Company GST Number (GSTIN)</label>
                  <input type="text" name="gstNumber" class="form-control mono" value="${escapeHtml(cs.gstNumber)}" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Phone Number</label>
                  <input type="text" name="phone" class="form-control" value="${escapeHtml(cs.phone)}" required />
                </div>
              </div>

              <div class="form-grid-2">
                <div class="form-group">
                  <label class="form-label">Email</label>
                  <input type="email" name="email" class="form-control" value="${escapeHtml(cs.email)}" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Website</label>
                  <input type="text" name="website" class="form-control" value="${escapeHtml(cs.website)}" />
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Company Address</label>
                <input type="text" name="address" class="form-control" value="${escapeHtml(cs.address)}" required />
              </div>

              <div class="form-grid-3">
                <div class="form-group">
                  <label class="form-label">City</label>
                  <input type="text" name="city" class="form-control" value="${escapeHtml(cs.city)}" />
                </div>
                <div class="form-group">
                  <label class="form-label">State</label>
                  <input type="text" name="state" class="form-control" value="${escapeHtml(cs.state)}" />
                </div>
                <div class="form-group">
                  <label class="form-label">Pincode</label>
                  <input type="text" name="pincode" class="form-control mono" value="${escapeHtml(cs.pincode)}" />
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Bank / Billing Notes</label>
                <textarea name="bankDetails" class="form-control" rows="2">${escapeHtml(cs.bankDetails)}</textarea>
              </div>

              <div class="form-group">
                <label class="form-label">Order Terms</label>
                <textarea name="orderTerms" class="form-control" rows="2">${escapeHtml(cs.orderTerms)}</textarea>
              </div>

              <button type="submit" class="btn btn-primary">
                💾 Save Company Information
              </button>
            </form>
          </div>
        </div>

        <div>
          <div class="panel-card">
            <div class="panel-header">
              <h2 class="panel-title">🔐 Change Super Admin Password</h2>
            </div>
            <div class="panel-body">
              <form onsubmit="CycleWorldApp.handleChangePassword(event)">
                <div class="form-group">
                  <label class="form-label">Current Super Admin Password</label>
                  <input type="password" name="currentPassword" class="form-control" required />
                </div>
                <div class="form-group">
                  <label class="form-label">New Password</label>
                  <input type="password" name="newPassword" class="form-control" minlength="4" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Confirm New Password</label>
                  <input type="password" name="confirmPassword" class="form-control" minlength="4" required />
                </div>
                <button type="submit" class="btn btn-navy">
                  🔒 Update Super Admin Password
                </button>
              </form>
            </div>
          </div>

          <div class="panel-card">
            <div class="panel-header">
              <h2 class="panel-title">🗄️ Relational Database Structure</h2>
              <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.downloadDatabaseBackup()">
                📥 Export DB JSON
              </button>
            </div>
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Table Name</th>
                    <th>Rows</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  ${API.getRelationalSchemaSummary()
                    .map(
                      (t) => `
                    <tr>
                      <td class="mono" style="font-weight:700;color:var(--primary-hover);">${escapeHtml(t.table)}</td>
                      <td class="mono" style="font-weight:700;">${t.rows}</td>
                      <td style="font-size:0.77rem;color:var(--text-secondary);">${escapeHtml(t.description)}</td>
                    </tr>
                  `
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ----------------------------------------------------------------------------
  // SUPER ADMIN TAB 9: SECURITY & AUDIT LOGS
  // ----------------------------------------------------------------------------
  function renderAdminAuditTab() {
    const logs = API.getAuditLogs();
    const q = state.adminAuditSearch.trim().toLowerCase();

    const filtered = logs.filter((l) => {
      if (!q) return true;
      return (
        (l.skuCode && l.skuCode.toLowerCase().includes(q)) ||
        l.actionType.toLowerCase().includes(q) ||
        l.fieldChanged.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q) ||
        l.actorUserId.toLowerCase().includes(q)
      );
    });

    return `
      <div class="panel-card">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">🔒 Security Audit Trail (${logs.length} Events)</h2>
            <p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.15rem;">
              Records all admin changes to SKU, FP price, GST, stock, categories, and customer accounts.
            </p>
          </div>
        </div>
        <div class="panel-body">
          <div class="toolbar-row">
            <div class="search-input-wrap">
              <span class="search-icon">🔍</span>
              <input
                type="text"
                class="form-control"
                placeholder="Filter audit logs by SKU, Action Type, Field, or User ID..."
                value="${escapeHtml(state.adminAuditSearch)}"
                oninput="CycleWorldApp.updateAdminAuditSearch(this.value)"
              />
            </div>
          </div>

          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Date &amp; Time</th>
                  <th>Actor</th>
                  <th>Action Type</th>
                  <th>SKU / Entity</th>
                  <th>Field Changed</th>
                  <th>Previous Value</th>
                  <th>New Value</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                ${
                  filtered.length === 0
                    ? `<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-muted);">No audit log entries recorded yet.</td></tr>`
                    : filtered
                        .map(
                          (l) => `
                  <tr>
                    <td style="font-size:0.78rem;white-space:nowrap;">${formatDateTime(l.createdAt)}</td>
                    <td>
                      <div style="font-weight:700;">${escapeHtml(l.actorUserId)}</div>
                      <div style="font-size:0.72rem;color:var(--text-muted);">${escapeHtml(l.actorRole)}</div>
                    </td>
                    <td><span class="status-badge status-new">${escapeHtml(l.actionType)}</span></td>
                    <td class="mono" style="font-weight:700;">${escapeHtml(l.skuCode || l.entityId)}</td>
                    <td class="mono">${escapeHtml(l.fieldChanged)}</td>
                    <td class="mono" style="color:var(--danger);font-size:0.78rem;">${escapeHtml(l.previousValue || '—')}</td>
                    <td class="mono" style="color:var(--success);font-weight:700;font-size:0.78rem;">${escapeHtml(l.newValue || '—')}</td>
                    <td style="font-size:0.79rem;color:var(--text-secondary);">${escapeHtml(l.description)}</td>
                  </tr>
                `
                        )
                        .join('')
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // ============================================================================
  // 3. EMPLOYEE / BILLING USER PORTAL
  // ============================================================================
  function renderBillingEmployeePortal(session) {
    const branding = API.getPublicCompanyBranding();
    const allOrders = API.getOrders();
    const customers = API.getCustomersList();

    const newCount = allOrders.filter((o) => o.status === 'New').length;
    const confirmedCount = allOrders.filter((o) => o.status === 'Confirmed').length;
    const processingCount = allOrders.filter((o) => o.status === 'Processing').length;
    const readyBillingCount = allOrders.filter((o) => o.status === 'Ready for Billing').length;
    const completedCount = allOrders.filter((o) => o.status === 'Completed').length;

    const q = state.billingOrderSearch.trim().toLowerCase();
    const filteredOrders = allOrders.filter((o) => {
      if (
        state.billingOrderStatusFilter !== 'ALL' &&
        o.status !== state.billingOrderStatusFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        o.orderNumber.toLowerCase().includes(q) ||
        o.storeName.toLowerCase().includes(q) ||
        o.customerCode.toLowerCase().includes(q) ||
        (o.customerGst && o.customerGst.toLowerCase().includes(q))
      );
    });

    const allowedBillingStatuses = [
      'New',
      'Confirmed',
      'Processing',
      'Ready for Billing',
      'Dispatched',
      'Completed'
    ];

    return `
      <header class="app-header no-print">
        <div class="app-header-inner">
          <div class="header-brand">
            <img src="${branding.logoUrl}" alt="Cycle World" class="header-logo" />
            <span class="header-role-pill badge-billing">🧾 Employee / Billing Portal</span>
          </div>
          <div class="header-actions">
            <div class="user-info-pill">
              <div>
                <div class="user-info-name">${escapeHtml(session.fullName)}</div>
                <div class="user-info-id">Billing ID: ${escapeHtml(session.userId)}</div>
              </div>
            </div>
            <button type="button" class="btn btn-outline btn-sm" onclick="CycleWorldApp.handleLogout()">
              Logout
            </button>
          </div>
        </div>
      </header>

      <div class="portal-layout">
        <aside class="portal-sidebar no-print">
          <div class="sidebar-section-header">
            <span>Billing &amp; Order Desk</span>
          </div>
          <ul class="sidebar-nav-list">
            <li class="sidebar-nav-item">
              <button
                type="button"
                class="sidebar-nav-btn ${state.billingTab === 'orders' ? 'active' : ''}"
                onclick="CycleWorldApp.setBillingTab('orders')"
              >
                <span>📦 Incoming Orders</span>
                <span class="status-badge status-new">${allOrders.length}</span>
              </button>
            </li>
            <li class="sidebar-nav-item">
              <button
                type="button"
                class="sidebar-nav-btn ${state.billingTab === 'stores' ? 'active' : ''}"
                onclick="CycleWorldApp.setBillingTab('stores')"
              >
                <span>🏪 Customer Billing Details</span>
                <span class="mono" style="font-size:0.75rem;">${customers.length}</span>
              </button>
            </li>
          </ul>
        </aside>

        <main>
          <div class="kpi-grid">
            <div class="kpi-card kpi-warning">
              <div class="kpi-label">New Orders</div>
              <div class="kpi-value">${newCount}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Confirmed</div>
              <div class="kpi-value">${confirmedCount}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Processing</div>
              <div class="kpi-value">${processingCount}</div>
            </div>
            <div class="kpi-card kpi-warning">
              <div class="kpi-label">Ready for Billing</div>
              <div class="kpi-value">${readyBillingCount}</div>
            </div>
            <div class="kpi-card kpi-success">
              <div class="kpi-label">Completed</div>
              <div class="kpi-value">${completedCount}</div>
            </div>
          </div>

          ${
            state.billingTab === 'orders'
              ? `
                <div class="panel-card">
                  <div class="panel-header">
                    <h2 class="panel-title">📦 Incoming Orders &amp; Billing Queue</h2>
                    ${
                      allOrders.length > 0
                        ? `<button type="button" class="btn btn-outline btn-sm" onclick="CycleWorldApp.exportAllOrdersCsv()">
                            📥 Download Orders (CSV)
                          </button>`
                        : ''
                    }
                  </div>

                  <div class="panel-body">
                    <div class="toolbar-row">
                      <div class="search-input-wrap">
                        <span class="search-icon">🔍</span>
                        <input
                          type="text"
                          class="form-control"
                          placeholder="Search by Order ID, Store Name, or Customer ID..."
                          value="${escapeHtml(state.billingOrderSearch)}"
                          oninput="CycleWorldApp.updateBillingFilter('search', this.value)"
                        />
                      </div>

                      <select class="form-control" style="width:auto;min-width:190px;" onchange="CycleWorldApp.updateBillingFilter('status', this.value)">
                        <option value="ALL">All Statuses (${allOrders.length})</option>
                        ${allowedBillingStatuses
                          .map(
                            (st) =>
                              `<option value="${st}" ${
                                state.billingOrderStatusFilter === st ? 'selected' : ''
                              }>${st}</option>`
                          )
                          .join('')}
                      </select>
                    </div>

                    <div class="table-responsive">
                      <table class="data-table">
                        <thead>
                          <tr>
                            <th>Order ID</th>
                            <th>Date</th>
                            <th>Customer / Store</th>
                            <th>Products Ordered</th>
                            <th>Items / Qty</th>
                            <th>Taxable Subtotal</th>
                            <th>GST Amount</th>
                            <th>Total Amount</th>
                            <th>Status</th>
                            <th>Order Punch / PDF / Print</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${
                            filteredOrders.length === 0
                              ? `<tr><td colspan="10" style="text-align:center;padding:2rem;color:var(--text-muted);">No incoming orders yet.</td></tr>`
                              : filteredOrders
                                  .map(
                                    (o) => `
                            <tr>
                              <td class="mono" style="font-weight:800;color:var(--primary-hover);">${escapeHtml(o.orderNumber)}</td>
                              <td style="font-size:0.79rem;">${formatDateTime(o.createdAt)}</td>
                              <td>
                                <div style="font-weight:700;">${escapeHtml(o.storeName)}</div>
                                <div class="mono" style="font-size:0.73rem;color:var(--text-muted);">
                                  ${escapeHtml(o.customerCode)} | GST: ${escapeHtml(o.customerGst || '—')}
                                </div>
                              </td>
                              <td style="font-size:0.8rem;min-width:150px;">
                                ${(o.productNames || []).map((name) => escapeHtml(name)).join('<br>') || '—'}
                              </td>
                              <td class="mono">${o.itemCount} items (${o.totalQuantity} pcs)</td>
                              <td class="mono">${formatCurrency(o.subtotalAmount)}</td>
                              <td class="mono">${formatCurrency(o.gstAmount)}</td>
                              <td class="mono" style="font-weight:800;">${formatCurrency(o.totalAmount)}</td>
                              <td>
                                <select
                                  class="form-control"
                                  style="padding:0.28rem 0.5rem;font-size:0.78rem;font-weight:700;width:auto;"
                                  onchange="CycleWorldApp.handleOrderStatusChange('${o.id}', this.value)"
                                >
                                  ${allowedBillingStatuses
                                    .map(
                                      (st) =>
                                        `<option value="${st}" ${
                                          o.status === st ? 'selected' : ''
                                        }>${st}</option>`
                                    )
                                    .join('')}
                                </select>
                              </td>
                              <td>
                                <div style="display:flex;gap:0.35rem;flex-wrap:wrap;">
                                  <button type="button" class="btn btn-primary btn-xs" onclick="CycleWorldApp.openOrderDetailModal('${o.id}')">
                                    👁️ View
                                  </button>
                                  <button type="button" class="btn btn-navy btn-xs" onclick="CycleWorldApp.downloadOrderPdf('${o.id}')">
                                    📥 PDF
                                  </button>
                                  <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.printOrderDirectly('${o.id}')">
                                    🖨️ Print
                                  </button>
                                  <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.downloadSingleOrderCsv('${o.id}')">
                                    CSV
                                  </button>
                                </div>
                              </td>
                            </tr>
                          `
                                  )
                                  .join('')
                          }
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              `
              : `
                <div class="panel-card">
                  <div class="panel-header">
                    <h2 class="panel-title">🏪 Customer / Store Billing Directory (Read-Only)</h2>
                  </div>
                  <div class="panel-body">
                    <div class="table-responsive">
                      <table class="data-table">
                        <thead>
                          <tr>
                            <th>Customer Login ID</th>
                            <th>Customer / Store Name</th>
                            <th>GST Details</th>
                            <th>Address</th>
                            <th>Contact Details</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${
                            customers.length === 0
                              ? `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted);">No customer accounts created yet.</td></tr>`
                              : customers
                                  .map(
                                    (c) => `
                            <tr>
                              <td><span class="sku-pill">${escapeHtml(c.customerCode)}</span></td>
                              <td style="font-weight:700;">${escapeHtml(c.storeName)}</td>
                              <td class="mono">${escapeHtml(c.gstNumber || '—')}</td>
                              <td style="font-size:0.8rem;">${escapeHtml(c.address)}</td>
                              <td>${escapeHtml(c.phone)}</td>
                              <td><span class="status-badge ${getStatusBadgeClass(c.status)}">${c.status}</span></td>
                            </tr>
                          `
                                  )
                                  .join('')
                          }
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              `
          }
        </main>
      </div>
    `;
  }

  // ============================================================================
  // 4. CUSTOMER / STORE PORTAL
  // ============================================================================
  function calculateCartSummary(catalogProducts) {
    const validLines = [];
    let subtotal = 0;
    let totalGst = 0;
    let totalUnits = 0;

    state.cart.forEach((item) => {
      const prod = catalogProducts.find((p) => p.id === item.productId);
      if (!prod) return;
      const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
      const lineSub = +(prod.fpPrice * qty).toFixed(2);
      const lineGst = +(lineSub * (prod.gstPercentage / 100)).toFixed(2);
      const lineTotal = +(lineSub + lineGst).toFixed(2);

      subtotal = +(subtotal + lineSub).toFixed(2);
      totalGst = +(totalGst + lineGst).toFixed(2);
      totalUnits += qty;

      validLines.push({
        productId: prod.id,
        skuCode: prod.skuCode,
        name: prod.name,
        categoryName: prod.categoryName,
        subcategoryName: prod.subcategoryName,
        variantAttributes: prod.variantAttributes || {},
        variantList: prod.variantList || [],
        variantSummary: prod.variantSummary || '',
        model: prod.model || '',
        size: prod.size || '',
        color: prod.color || '',
        type: prod.type || '',
        brand: prod.brand || '',
        imageUrl: prod.imageUrl,
        hsnCode: prod.hsnCode,
        packSize: prod.packSize,
        fpPrice: prod.fpPrice,
        gstPercentage: prod.gstPercentage,
        quantity: qty,
        lineSubtotal: lineSub,
        lineGstAmount: lineGst,
        lineFinalTotal: lineTotal
      });
    });

    return {
      lines: validLines,
      itemCount: validLines.length,
      totalUnits,
      subtotal,
      totalGst,
      grandTotal: +(subtotal + totalGst).toFixed(2)
    };
  }

  function renderCustomerStorePortal(session) {
    loadCustomerCart();
    const branding = API.getPublicCompanyBranding();
    const catalogProducts = API.getCustomerCatalogProducts();
    const categoriesTree = API.getCategoriesTree({ activeOnly: true });
    const myOrders = API.getOrders();
    const cartSummary = calculateCartSummary(catalogProducts);

    return `
      <header class="app-header no-print">
        <div class="app-header-inner">
          <div class="header-brand">
            <img src="${branding.logoUrl}" alt="Cycle World" class="header-logo" />
            <span class="header-role-pill badge-customer">🏪 Customer Portal</span>
          </div>

          <div class="header-actions">
            <button
              type="button"
              class="btn ${state.customerTab === 'catalog' ? 'btn-primary' : 'btn-outline'} btn-sm"
              onclick="CycleWorldApp.setCustomerTab('catalog')"
            >
              🚲 Products (${catalogProducts.length})
            </button>

            <button
              type="button"
              class="btn ${state.customerTab === 'orders' ? 'btn-primary' : 'btn-outline'} btn-sm"
              onclick="CycleWorldApp.setCustomerTab('orders')"
            >
              📋 My Orders (${myOrders.length})
            </button>

            <button
              type="button"
              class="btn ${state.customerTab === 'cart' ? 'btn-success' : 'btn-navy'} btn-sm"
              onclick="CycleWorldApp.setCustomerTab('cart')"
            >
              🛒 Cart (${cartSummary.itemCount}) — ${formatCurrency(cartSummary.grandTotal)}
            </button>

            <div class="user-info-pill" style="cursor:pointer;" onclick="CycleWorldApp.setCustomerTab('profile')">
              <div>
                <div class="user-info-name">${escapeHtml(session.storeName || session.fullName)}</div>
                <div class="user-info-id">ID: ${escapeHtml(session.customerCode || session.userId)}</div>
              </div>
            </div>

            <button type="button" class="btn btn-outline btn-sm" onclick="CycleWorldApp.handleLogout()">
              Logout
            </button>
          </div>
        </div>
      </header>

      ${
        state.customerTab === 'catalog'
          ? renderCustomerCatalogView(catalogProducts, categoriesTree, cartSummary)
          : state.customerTab === 'cart'
          ? renderCustomerCartView(cartSummary)
          : state.customerTab === 'orders'
          ? renderCustomerOrdersView(myOrders)
          : renderCustomerProfileView()
      }

      <div class="mobile-cart-bar no-print ${cartSummary.itemCount > 0 ? 'has-items' : ''}">
        <div>
          <div style="font-size:0.75rem;color:#dcfce7;">${cartSummary.itemCount} items (${cartSummary.totalUnits} units)</div>
          <div class="mono" style="font-size:1.05rem;font-weight:800;">${formatCurrency(cartSummary.grandTotal)} <span style="font-size:0.7rem;font-weight:400;">Incl. GST</span></div>
        </div>
        <button type="button" class="btn btn-success btn-sm" onclick="CycleWorldApp.setCustomerTab('cart')">
          View Cart &amp; Submit Order →
        </button>
      </div>
    `;
  }

  function renderCustomerCatalogView(catalogProducts, categoriesTree, cartSummary) {
    const q = state.customerSearch.trim().toLowerCase();

    const activeCatObj =
      state.customerCategoryId !== 'ALL'
        ? categoriesTree.find((c) => c.id === state.customerCategoryId) || null
        : null;
    const activeSubObj =
      activeCatObj && state.customerSubcategoryId !== 'ALL'
        ? activeCatObj.subcategories.find((s) => s.id === state.customerSubcategoryId) || null
        : null;

    const activeSubGroups = activeSubObj && Array.isArray(activeSubObj.groups) ? activeSubObj.groups : [];
    const activeGroupFilterEntries = Object.entries(state.customerGroupFilters || {}).filter(
      ([, val]) => val && val !== 'ALL'
    );

    let filtered = catalogProducts.filter((p) => {
      if (state.customerCategoryId !== 'ALL' && p.categoryId !== state.customerCategoryId) {
        return false;
      }
      if (
        state.customerSubcategoryId !== 'ALL' &&
        p.subcategoryId !== state.customerSubcategoryId
      ) {
        return false;
      }
      if (activeGroupFilterEntries.length > 0) {
        for (const [grpName, selectedVal] of activeGroupFilterEntries) {
          const prodAttrs = p.variantAttributes || {};
          const matchKey = Object.keys(prodAttrs).find(
            (k) => k.toLowerCase() === grpName.toLowerCase()
          );
          const actualVal = matchKey ? String(prodAttrs[matchKey]).trim() : '';
          if (actualVal.toLowerCase() !== String(selectedVal).trim().toLowerCase()) {
            return false;
          }
        }
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.skuCode.toLowerCase().includes(q) ||
        p.categoryName.toLowerCase().includes(q) ||
        p.subcategoryName.toLowerCase().includes(q) ||
        (p.variantSummary && p.variantSummary.toLowerCase().includes(q))
      );
    });

    filtered.sort((a, b) => {
      switch (state.customerSortBy) {
        case 'NAME_DESC':
          return b.name.localeCompare(a.name, undefined, { sensitivity: 'base' });
        case 'SKU_ASC':
          return a.skuCode.localeCompare(b.skuCode, undefined, { numeric: true });
        case 'PRICE_ASC':
          return a.fpPrice - b.fpPrice;
        case 'PRICE_DESC':
          return b.fpPrice - a.fpPrice;
        case 'NAME_ASC':
        default:
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      }
    });

    return `
      <div class="portal-layout">
        <aside class="portal-sidebar no-print">
          <div class="sidebar-section-header">
            <span>All Available Products</span>
            ${
              state.customerCategoryId !== 'ALL' || state.expandedCustomerCategoryId !== null
                ? `<button type="button" style="font-size:0.72rem;color:var(--primary);font-weight:700;" onclick="CycleWorldApp.selectCustomerCategory('ALL','ALL')">Reset</button>`
                : ''
            }
          </div>

          <ul class="sidebar-nav-list">
            <li class="sidebar-nav-item">
              <button
                type="button"
                class="sidebar-nav-btn ${state.customerCategoryId === 'ALL' && !state.expandedCustomerCategoryId ? 'active' : ''}"
                onclick="CycleWorldApp.selectCustomerCategory('ALL', 'ALL')"
              >
                <span>All Available Products</span>
              </button>
            </li>

            ${categoriesTree
              .map((cat) => {
                const isExpanded = state.expandedCustomerCategoryId === cat.id;
                const isCatActive = state.customerCategoryId === cat.id;
                return `
                  <li class="sidebar-nav-item">
                    <button
                      type="button"
                      class="sidebar-nav-btn ${isExpanded ? 'expanded' : ''} ${isCatActive ? 'active' : ''}"
                      onclick="CycleWorldApp.toggleCustomerCategoryExpand('${cat.id}')"
                      aria-expanded="${isExpanded ? 'true' : 'false'}"
                    >
                      <span>${escapeHtml(cat.name)}</span>
                      <span class="cat-toggle-icon" aria-hidden="true">${isExpanded ? '−' : '+'}</span>
                    </button>
                    ${
                      isExpanded
                        ? `
                          <ul class="sidebar-subcat-list">
                            ${
                              cat.subcategories.length === 0
                                ? `<li style="padding:0.35rem 0.65rem;font-size:0.78rem;color:var(--text-muted);">No subcategories available</li>`
                                : cat.subcategories
                                    .map((sub) => {
                                      const isSubActive =
                                        state.customerCategoryId === cat.id &&
                                        state.customerSubcategoryId === sub.id;
                                      return `
                                        <li>
                                          <button
                                            type="button"
                                            class="sidebar-subcat-btn ${isSubActive ? 'active' : ''}"
                                            onclick="CycleWorldApp.selectCustomerSubcategory('${cat.id}', '${sub.id}')"
                                          >
                                            <span>• ${escapeHtml(sub.name)}</span>
                                          </button>
                                        </li>
                                      `;
                                    })
                                    .join('')
                            }
                          </ul>
                        `
                        : ''
                    }
                  </li>
                `;
              })
              .join('')}
          </ul>
        </aside>

        <main>
          <div class="panel-card" style="margin-bottom:1.1rem;">
            <div class="panel-header" style="padding:0.85rem 1.1rem;">
              <div style="display:flex;align-items:center;justify-content:space-between;width:100%;flex-wrap:wrap;gap:0.5rem;">
                <div>
                  <h2 class="panel-title">🚲 All Available Products</h2>
                  <p style="font-size:0.79rem;color:var(--text-muted);margin-top:0.1rem;">
                    Click <strong>+</strong> on any category below to expand its subcategories, then select a subcategory &amp; variant group filters to view products.
                  </p>
                </div>
                ${
                  activeCatObj || activeSubObj
                    ? `<div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                        <span class="status-badge status-instock" style="font-size:0.78rem;padding:0.3rem 0.7rem;">
                          ${escapeHtml(activeCatObj ? activeCatObj.name : '')}${activeSubObj ? ' › ' + escapeHtml(activeSubObj.name) : ''}
                        </span>
                        <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.selectCustomerCategory('ALL', 'ALL')">
                          ✕ Show All Products
                        </button>
                      </div>`
                    : ''
                }
              </div>
            </div>
            <div class="panel-body" style="padding:0.9rem 1.1rem;">
              <div class="toolbar-row" style="margin-bottom:0;">
                <div class="search-input-wrap">
                  <span class="search-icon">🔍</span>
                  <input
                    type="text"
                    class="form-control"
                    placeholder="Search by Product Name, SKU, Category, Subcategory, Model, Size, Color, or Variant..."
                    value="${escapeHtml(state.customerSearch)}"
                    oninput="CycleWorldApp.updateCustomerSearch(this.value)"
                  />
                </div>

                <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                  <label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);">Sort:</label>
                  <select class="form-control" style="width:auto;min-width:195px;" onchange="CycleWorldApp.updateCustomerSort(this.value)">
                    <option value="NAME_ASC" ${state.customerSortBy === 'NAME_ASC' ? 'selected' : ''}>Alphabetical: A to Z</option>
                    <option value="NAME_DESC" ${state.customerSortBy === 'NAME_DESC' ? 'selected' : ''}>Alphabetical: Z to A</option>
                    <option value="SKU_ASC" ${state.customerSortBy === 'SKU_ASC' ? 'selected' : ''}>SKU Code: A to Z</option>
                    <option value="PRICE_ASC" ${state.customerSortBy === 'PRICE_ASC' ? 'selected' : ''}>FP Price: Low to High</option>
                    <option value="PRICE_DESC" ${state.customerSortBy === 'PRICE_DESC' ? 'selected' : ''}>FP Price: High to Low</option>
                  </select>
                </div>
              </div>

              ${
                categoriesTree.length > 0
                  ? `
                    <div class="cat-accordion-grid">
                      ${categoriesTree
                        .map((cat) => {
                          const isExpanded = state.expandedCustomerCategoryId === cat.id;
                          return `
                            <div class="cat-accordion-item ${isExpanded ? 'expanded' : ''}">
                              <button
                                type="button"
                                class="cat-accordion-header"
                                onclick="CycleWorldApp.toggleCustomerCategoryExpand('${cat.id}')"
                                aria-expanded="${isExpanded ? 'true' : 'false'}"
                              >
                                <span>${escapeHtml(cat.name)}</span>
                                <span class="cat-toggle-icon" aria-hidden="true">${isExpanded ? '−' : '+'}</span>
                              </button>
                              ${
                                isExpanded
                                  ? `
                                    <div class="cat-accordion-body">
                                      ${
                                        cat.subcategories.length === 0
                                          ? `<span style="font-size:0.82rem;color:var(--text-muted);">No subcategories under ${escapeHtml(cat.name)}.</span>`
                                          : cat.subcategories
                                              .map((sub) => {
                                                const isSubActive =
                                                  state.customerCategoryId === cat.id &&
                                                  state.customerSubcategoryId === sub.id;
                                                return `
                                                  <button
                                                    type="button"
                                                    class="subcat-chip-btn ${isSubActive ? 'active' : ''}"
                                                    onclick="CycleWorldApp.selectCustomerSubcategory('${cat.id}', '${sub.id}')"
                                                  >
                                                    <span>${escapeHtml(sub.name)}</span>
                                                  </button>
                                                `;
                                              })
                                              .join('')
                                      }
                                    </div>
                                  `
                                  : ''
                              }
                            </div>
                          `;
                        })
                        .join('')}
                    </div>
                  `
                  : ''
              }

              ${
                activeSubObj && activeSubGroups.length > 0
                  ? `
                    <div style="margin-top:0.85rem;padding:0.75rem 0.9rem;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:var(--radius-sm);">
                      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.55rem;">
                        <span style="font-size:0.77rem;font-weight:800;color:#14532d;text-transform:uppercase;letter-spacing:0.04em;">
                          🧩 Filter ${escapeHtml(activeCatObj.name)} › ${escapeHtml(activeSubObj.name)} by Sub-Category Group / Variant:
                        </span>
                        ${
                          activeGroupFilterEntries.length > 0
                            ? `<button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.clearCustomerGroupFilters()">
                                ✕ Clear Variant Filters
                              </button>`
                            : ''
                        }
                      </div>
                      <div style="display:flex;flex-wrap:wrap;gap:0.65rem;align-items:center;">
                        ${activeSubGroups
                          .map((grp) => {
                            const selectedVal =
                              (state.customerGroupFilters && state.customerGroupFilters[grp.name]) || 'ALL';
                            return `
                              <div style="display:flex;align-items:center;gap:0.35rem;background:#fff;border:1px solid #86efac;border-radius:8px;padding:0.25rem 0.55rem;">
                                <label style="font-size:0.76rem;font-weight:800;color:#14532d;white-space:nowrap;">
                                  ${escapeHtml(grp.name)}${grp.mrp > 0 ? ` <span style="color:#1d4ed8;font-weight:700;">(MRP: ${formatCurrency(grp.mrp)})</span>` : ''}:
                                </label>
                                <select
                                  class="form-control"
                                  style="padding:0.2rem 0.45rem;font-size:0.78rem;width:auto;min-width:115px;border:none;background:transparent;font-weight:700;"
                                  onchange="CycleWorldApp.setCustomerGroupFilter('${escapeHtml(grp.name).replace(/'/g, "\\'")}', this.value)"
                                >
                                  <option value="ALL">All ${escapeHtml(grp.name)}</option>
                                  ${(grp.items || [])
                                    .map(
                                      (it) =>
                                        `<option value="${escapeHtml(it.value)}" ${
                                          selectedVal === it.value ? 'selected' : ''
                                        }>${escapeHtml(it.value)}</option>`
                                    )
                                    .join('')}
                                </select>
                              </div>
                            `;
                          })
                          .join('')}
                      </div>
                    </div>
                  `
                  : ''
              }
            </div>
          </div>

          ${
            filtered.length === 0
              ? `
                <div class="panel-card">
                  <div class="panel-body" style="text-align:center;padding:3rem 1rem;">
                    <div style="font-size:2.2rem;margin-bottom:0.5rem;">🚲</div>
                    <h3 style="font-size:1.05rem;font-weight:700;">No Available Products Found</h3>
                    <p style="font-size:0.84rem;color:var(--text-muted);margin-top:0.25rem;">
                      Only active products with live stock greater than zero matching your selected category &amp; variant filters are displayed here.
                    </p>
                  </div>
                </div>
              `
              : `
                <div class="product-grid">
                  ${filtered
                    .map((p) => {
                      const inCartItem = state.cart.find((c) => c.productId === p.id);
                      const draftQty = state.cardQuantities[p.id] || (inCartItem ? inCartItem.quantity : 1);
                      const isAcc = isBicycleAccessoriesCategory(p);
                      return `
                        <article class="product-card">
                          <div class="product-card-img-wrap">
                            <div class="product-card-top-badges">
                              <span class="status-badge status-instock">
                                <span class="live-dot"></span> In Stock (${p.stock})
                              </span>
                            </div>
                            <img src="${p.imageUrl}" alt="${escapeHtml(p.name)}" class="product-card-img" />
                          </div>

                          <div class="product-card-body">
                            <div class="product-cat-crumb">
                              ${escapeHtml(p.categoryName)} › ${escapeHtml(p.subcategoryName)}
                            </div>
                            <h3 class="product-title">${escapeHtml(p.name)}</h3>

                            <div class="product-price-box">
                              <div class="price-row-main">
                                <span class="fp-price-label">Price:</span>
                                <span class="fp-price-value">${formatCurrency(p.fpPrice)}</span>
                              </div>
                              <div class="price-row-gst">
                                <span>GST (${p.gstPercentage}%): +${formatCurrency(p.gstAmountPerUnit)}</span>
                                <span class="final-price-incl">Final: ${formatCurrency(p.finalPriceInclGst)}</span>
                              </div>
                            </div>

                            <div class="card-cart-actions">
                              <div class="qty-stepper" aria-label="Select Quantity">
                                <button type="button" class="qty-btn" onclick="CycleWorldApp.stepCardQty('${p.id}', -1)">−</button>
                                <input
                                  type="number"
                                  min="1"
                                  class="qty-input"
                                  id="card-qty-${p.id}"
                                  value="${draftQty}"
                                  onchange="CycleWorldApp.setCardQtyInput('${p.id}', this.value)"
                                />
                                <button type="button" class="qty-btn" onclick="CycleWorldApp.stepCardQty('${p.id}', 1)">+</button>
                              </div>

                              <button
                                type="button"
                                class="btn ${inCartItem ? 'btn-success' : 'btn-primary'}"
                                style="flex:1;padding:0.55rem 0.75rem;"
                                onclick="CycleWorldApp.addToCartFromCard('${p.id}')"
                              >
                                ${inCartItem ? `✓ In Cart (${inCartItem.quantity})` : 'Add to Cart'}
                              </button>
                            </div>
                          </div>
                        </article>
                      `;
                    })
                    .join('')}
                </div>
              `
          }
        </main>
      </div>
    `;
  }

  function renderCustomerCartView(cartSummary) {
    return `
      <div class="portal-layout single-col">
        <div class="panel-card">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">🛒 Customer Cart &amp; Automatic GST Calculation</h2>
            </div>
            <div style="display:flex;gap:0.5rem;">
              <button type="button" class="btn btn-outline btn-sm" onclick="CycleWorldApp.setCustomerTab('catalog')">
                ← Back to Products
              </button>
              ${
                cartSummary.itemCount > 0
                  ? `<button type="button" class="btn btn-outline btn-sm" style="color:var(--danger);" onclick="CycleWorldApp.clearCart()">
                      Clear Cart
                    </button>`
                  : ''
              }
            </div>
          </div>

          <div class="panel-body">
            ${
              cartSummary.itemCount === 0
                ? `
                  <div style="text-align:center;padding:3rem 1rem;">
                    <div style="font-size:2.4rem;margin-bottom:0.5rem;">🛒</div>
                    <h3 style="font-size:1.1rem;font-weight:700;">Your Cart is Empty</h3>
                    <button type="button" class="btn btn-primary" style="margin-top:0.85rem;" onclick="CycleWorldApp.setCustomerTab('catalog')">
                      Browse Products →
                    </button>
                  </div>
                `
                : `
                  <div class="table-responsive" style="margin-bottom:1.35rem;">
                    <table class="data-table">
                      <thead>
                        <tr>
                          <th>Product &amp; SKU</th>
                          <th>Category &amp; Variants</th>
                          <th>Product Price (FP)</th>
                          <th>Quantity</th>
                          <th>Subtotal</th>
                          <th>GST %</th>
                          <th>GST Amount</th>
                          <th>Final Total</th>
                          <th>Remove</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${cartSummary.lines
                          .map(
                            (line) => `
                          <tr>
                            <td>
                              <div style="display:flex;align-items:center;gap:0.7rem;">
                                <img src="${line.imageUrl}" alt="" style="width:42px;height:42px;border-radius:6px;border:1px solid var(--border-color);" />
                                <div>
                                  <span class="sku-pill">${escapeHtml(line.skuCode)}</span>
                                  <div style="font-weight:700;margin-top:0.15rem;">${escapeHtml(line.name)}</div>
                                </div>
                              </div>
                            </td>
                            <td style="font-size:0.79rem;">
                              <div style="font-weight:600;">${escapeHtml(line.categoryName)} › ${escapeHtml(line.subcategoryName)}</div>
                              ${renderVariantBadges(line, true)}
                            </td>
                            <td class="mono" style="font-weight:700;">${formatCurrency(line.fpPrice)}</td>
                            <td>
                              <div class="qty-stepper">
                                <button type="button" class="qty-btn" onclick="CycleWorldApp.updateCartItemQty('${line.productId}', ${line.quantity - 1})">−</button>
                                <input
                                  type="number"
                                  min="1"
                                  class="qty-input"
                                  value="${line.quantity}"
                                  onchange="CycleWorldApp.updateCartItemQty('${line.productId}', this.value)"
                                />
                                <button type="button" class="qty-btn" onclick="CycleWorldApp.updateCartItemQty('${line.productId}', ${line.quantity + 1})">+</button>
                              </div>
                            </td>
                            <td class="mono" style="font-weight:700;">${formatCurrency(line.lineSubtotal)}</td>
                            <td class="mono">${line.gstPercentage}%</td>
                            <td class="mono">${formatCurrency(line.lineGstAmount)}</td>
                            <td class="mono" style="font-weight:800;color:var(--primary-hover);">${formatCurrency(line.lineFinalTotal)}</td>
                            <td>
                              <button type="button" class="btn btn-outline btn-xs" style="color:var(--danger);" onclick="CycleWorldApp.removeCartItem('${line.productId}')">
                                ✕ Remove
                              </button>
                            </td>
                          </tr>
                        `
                          )
                          .join('')}
                      </tbody>
                    </table>
                  </div>

                  <div class="form-grid-2" style="align-items:start;">
                    <div class="form-group">
                      <label class="form-label">Order Notes (Optional)</label>
                      <textarea
                        class="form-control"
                        rows="3"
                        placeholder="Add any store notes..."
                        oninput="CycleWorldApp.updateOrderNotes(this.value)"
                      >${escapeHtml(state.orderNotes)}</textarea>
                    </div>

                    <div style="background:var(--bg-subtle);border:2px solid var(--border-strong);border-radius:var(--radius-md);padding:1.25rem;">
                      <h3 style="font-size:0.98rem;font-weight:800;margin-bottom:0.75rem;border-bottom:1px solid var(--border-color);padding-bottom:0.5rem;">
                        Order Summary
                      </h3>
                      <div style="display:flex;justify-content:space-between;margin-bottom:0.45rem;font-size:0.88rem;">
                        <span>Total Items / Quantity:</span>
                        <strong class="mono">${cartSummary.itemCount} Items (${cartSummary.totalUnits} Qty)</strong>
                      </div>
                      <div style="display:flex;justify-content:space-between;margin-bottom:0.45rem;font-size:0.88rem;">
                        <span>Subtotal:</span>
                        <strong class="mono">${formatCurrency(cartSummary.subtotal)}</strong>
                      </div>
                      <div style="display:flex;justify-content:space-between;margin-bottom:0.65rem;font-size:0.88rem;color:var(--text-secondary);">
                        <span>GST Amount:</span>
                        <strong class="mono">+ ${formatCurrency(cartSummary.totalGst)}</strong>
                      </div>
                      <div style="display:flex;justify-content:space-between;padding-top:0.65rem;border-top:2px solid var(--bg-navy);font-size:1.15rem;font-weight:800;color:var(--text-main);margin-bottom:1rem;">
                        <span>Final Total (Incl. GST):</span>
                        <span class="mono" style="color:var(--primary-hover);">${formatCurrency(cartSummary.grandTotal)}</span>
                      </div>

                      <button type="button" class="btn btn-success btn-block" onclick="CycleWorldApp.openOrderConfirmationModal()">
                        Submit Order &amp; Generate Order Punch →
                      </button>
                    </div>
                  </div>
                `
            }
          </div>
        </div>
      </div>
    `;
  }

  function renderCustomerOrdersView(myOrders) {
    return `
      <div class="portal-layout single-col">
        <div class="panel-card">
          <div class="panel-header">
            <h2 class="panel-title">📋 My Store Orders &amp; Order Punch History (${myOrders.length})</h2>
            <button type="button" class="btn btn-primary btn-sm" onclick="CycleWorldApp.setCustomerTab('catalog')">
              + New Order
            </button>
          </div>
          <div class="panel-body">
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Order Number</th>
                    <th>Order Date</th>
                    <th>Products Ordered</th>
                    <th>Items / Qty</th>
                    <th>Total Amount</th>
                    <th>GST Amount</th>
                    <th>Grand Total</th>
                    <th>Order Status</th>
                    <th>Order Punch / PDF / Print</th>
                  </tr>
                </thead>
                <tbody>
                  ${
                    myOrders.length === 0
                      ? `<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--text-muted);">No orders submitted yet.</td></tr>`
                      : myOrders
                          .map(
                            (o) => `
                    <tr>
                      <td class="mono" style="font-weight:800;color:var(--primary-hover);">${escapeHtml(o.orderNumber)}</td>
                      <td>${formatDateTime(o.createdAt)}</td>
                      <td style="font-size:0.8rem;min-width:150px;">
                        ${(o.productNames || []).map((name) => escapeHtml(name)).join('<br>') || '—'}
                      </td>
                      <td class="mono">${o.itemCount} items (${o.totalQuantity} units)</td>
                      <td class="mono">${formatCurrency(o.subtotalAmount)}</td>
                      <td class="mono">${formatCurrency(o.gstAmount)}</td>
                      <td class="mono" style="font-weight:800;">${formatCurrency(o.totalAmount)}</td>
                      <td><span class="status-badge ${getStatusBadgeClass(o.status)}">${escapeHtml(o.status)}</span></td>
                      <td>
                        <div style="display:flex;gap:0.35rem;flex-wrap:wrap;">
                          <button type="button" class="btn btn-primary btn-xs" onclick="CycleWorldApp.openOrderDetailModal('${o.id}')">
                            👁️ View Order
                          </button>
                          <button type="button" class="btn btn-navy btn-xs" onclick="CycleWorldApp.downloadOrderPdf('${o.id}')">
                            📥 Download PDF
                          </button>
                          <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.printOrderDirectly('${o.id}')">
                            🖨️ Print Order
                          </button>
                        </div>
                      </td>
                    </tr>
                  `
                          )
                          .join('')
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderCustomerProfileView() {
    const profile = API.getOwnCustomerProfile();
    return `
      <div class="portal-layout single-col">
        <div class="panel-card">
          <div class="panel-header">
            <h2 class="panel-title">🏪 My Store Account Details</h2>
          </div>
          <div class="panel-body">
            <div style="display:grid;gap:0.75rem;font-size:0.88rem;">
              <div><span style="color:var(--text-muted);">Customer Login ID:</span> <span class="sku-pill">${escapeHtml(profile.customerCode)}</span></div>
              <div><span style="color:var(--text-muted);">Customer / Store Name:</span> <strong>${escapeHtml(profile.storeName)}</strong></div>
              <div><span style="color:var(--text-muted);">Email ID:</span> <span class="mono">${escapeHtml(profile.email || '—')}</span></div>
              <div><span style="color:var(--text-muted);">Contact Details:</span> ${escapeHtml(profile.phone)} ${profile.contactPerson ? `(${escapeHtml(profile.contactPerson)})` : ''}</div>
              <div><span style="color:var(--text-muted);">Address:</span> ${escapeHtml(profile.address)}</div>
              <div><span style="color:var(--text-muted);">GST Details:</span> <span class="mono" style="font-weight:700;">${escapeHtml(profile.gstNumber || '—')}</span></div>
              <div><span style="color:var(--text-muted);">Account Status:</span> <span class="status-badge status-active">${escapeHtml(profile.status)}</span></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ============================================================================
  // 5. MODALS RENDERER
  // ============================================================================
  function renderModal() {
    const container = document.getElementById('modal-root');
    if (!container) return;
    if (!state.modal) {
      container.innerHTML = '';
      return;
    }

    const { type, data } = state.modal;

    // PRODUCT CREATION / EDIT MODAL (Manual Category, Subcategory, Sub-Category Group Variants, SKU Code, Name, Image, MRP, FP Price, Live Stock, GST, Status)
    if (type === 'PRODUCT_FORM') {
      const catsTree = API.getCategoriesTree({ activeOnly: false });
      const prod = data.product || null;
      const draft = data.draftProduct || {};

      if (catsTree.length === 0) {
        container.innerHTML = `
          <div class="modal-backdrop" onclick="if(event.target===this)CycleWorldApp.closeModal()">
            <div class="modal-dialog" style="max-width:480px;">
              <div class="modal-header">
                <h3 class="modal-title">Create Category &amp; Subcategory First</h3>
                <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.closeModal()">✕</button>
              </div>
              <div class="modal-body" style="text-align:center;padding:2rem 1.5rem;">
                <p style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:1.2rem;">
                  Please create at least one <strong>Category</strong> and <strong>Subcategory</strong> before creating a product.
                </p>
                <button type="button" class="btn btn-primary" onclick="CycleWorldApp.openCategoryModal(null)">
                  + Create Category Now
                </button>
              </div>
            </div>
          </div>
        `;
        return;
      }

      const selectedCatId =
        data.selectedCatId || (prod ? prod.categoryId : catsTree[0].id);
      const catObj = catsTree.find((c) => c.id === selectedCatId) || catsTree[0];
      const subcats = catObj ? catObj.subcategories : [];
      const selectedSubId =
        data.selectedSubId ||
        (prod && prod.categoryId === catObj.id
          ? prod.subcategoryId
          : (subcats[0] && subcats[0].id) || '');
      const subObj = subcats.find((s) => s.id === selectedSubId) || subcats[0] || null;
      const subGroups = subObj ? API.getSubcategoryGroups(subObj.id, { activeOnly: false }) : [];

      const inheritedGroupMrp = subGroups.reduce((acc, g) => {
        const gMrp = parseFloat(g.mrp) || 0;
        return gMrp > 0 ? gMrp : acc;
      }, 0);

      const currentVariants = Object.assign(
        {},
        prod && prod.variantAttributes ? prod.variantAttributes : {},
        draft.variantAttributes || {}
      );

      const getVariantVal = (grpName) => {
        const key = Object.keys(currentVariants).find(
          (k) => k.toLowerCase() === String(grpName).toLowerCase()
        );
        return key ? currentVariants[key] : '';
      };

      const valSku = draft.skuCode !== undefined ? draft.skuCode : prod ? prod.skuCode : '';
      const valName = draft.name !== undefined ? draft.name : prod ? prod.name : '';
      const valMrp =
        draft.mrp !== undefined
          ? draft.mrp
          : prod && prod.mrp > 0
          ? prod.mrp
          : inheritedGroupMrp > 0
          ? inheritedGroupMrp
          : '';
      const valFpPrice = draft.fpPrice !== undefined ? draft.fpPrice : prod ? prod.fpPrice : '';
      const valStock = draft.stock !== undefined ? draft.stock : prod ? prod.stock : '';
      const valGst =
        draft.gstPercentage !== undefined
          ? draft.gstPercentage
          : prod
          ? prod.gstPercentage
          : '12';
      const valStatus =
        draft.status !== undefined
          ? draft.status
          : prod
          ? prod.adminConfiguredStatus
          : 'Active';
      const valSpecs =
        draft.specifications !== undefined
          ? draft.specifications
          : prod
          ? prod.specifications
          : '';
      const valImageUrl =
        draft.imageUrl !== undefined
          ? draft.imageUrl
          : prod
          ? prod.rawImageUrl || ''
          : '';
      const hasCustomPhoto = Boolean(
        valImageUrl &&
          valImageUrl !== 'REMOVE' &&
          !String(valImageUrl).startsWith('data:image/svg+xml')
      );
      const previewImgSrc = hasCustomPhoto
        ? valImageUrl
        : prod
        ? prod.imageUrl
        : '';

      const isBicycleAccessories = isBicycleAccessoriesCategory(catObj);

      container.innerHTML = `
        <div class="modal-backdrop" onclick="if(event.target===this)CycleWorldApp.closeModal()">
          <div class="modal-dialog" style="max-width:540px;">
            <div class="modal-header">
              <h3 class="modal-title">${prod ? `Edit Product — ${escapeHtml(prod.name)}` : 'Create Product'}</h3>
              <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.closeModal()">✕</button>
            </div>
            <form id="product-modal-form" onsubmit="CycleWorldApp.handleSaveProductForm(event)" autocomplete="off">
              <input type="hidden" name="id" value="${prod ? escapeHtml(prod.id) : ''}" />
              <input type="hidden" name="allowUpdateDuplicate" id="modal-allow-update-dup" value="false" />
              <input type="hidden" name="skuCode" value="${escapeHtml(valSku)}" />
              <input type="hidden" name="mrp" value="${valMrp}" />
              <input type="hidden" name="imageUrl" id="modal-prod-image-url" value="${escapeHtml(valImageUrl)}" />
              <div class="modal-body">
                <div class="form-grid-2">
                        <div class="form-group">
                          <label class="form-label">1. Product Category *</label>
                          <select name="categoryId" id="modal-prod-cat" class="form-control" required onchange="CycleWorldApp.handleModalProductCatChange(this.value)">
                            ${catsTree
                              .map(
                                (c) =>
                                  `<option value="${c.id}" ${c.id === catObj.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
                              )
                              .join('')}
                          </select>
                        </div>
                        <div class="form-group">
                          <label class="form-label">2. Product Subcategory *</label>
                          ${
                            subcats.length === 0
                              ? `<div style="display:flex;gap:0.5rem;align-items:center;">
                                  <input type="text" class="form-control" value="No subcategory under this category" disabled />
                                  <button type="button" class="btn btn-soft btn-sm" onclick="CycleWorldApp.openSubcategoryModal(null, '${catObj.id}')">+ Add Subcategory</button>
                                </div>`
                              : `<select name="subcategoryId" id="modal-prod-sub" class="form-control" required onchange="CycleWorldApp.handleModalProductSubChange(this.value)">
                                  ${subcats
                                    .map(
                                      (s) =>
                                        `<option value="${s.id}" ${subObj && s.id === subObj.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`
                                    )
                                    .join('')}
                                </select>`
                          }
                        </div>
                      </div>

                      <div class="form-group">
                        <label class="form-label">3. Product Name *</label>
                        <input
                          type="text"
                          name="name"
                          id="modal-prod-name"
                          class="form-control"
                          value="${escapeHtml(valName)}"
                          placeholder="Enter Product Name"
                          oninput="CycleWorldApp.checkDuplicateProductNameLive()"
                          required
                        />
                        <div id="duplicate-warning-box" style="display:none;margin-top:0.45rem;"></div>
                      </div>

                      <div class="form-grid-2">
                        <div class="form-group">
                          <label class="form-label">4. Available Quantity *</label>
                          <input
                            type="number"
                            step="1"
                            min="0"
                            name="stock"
                            class="form-control mono"
                            value="${valStock}"
                            placeholder="e.g. 50"
                            required
                          />
                        </div>
                        <div class="form-group">
                          <label class="form-label">5. Product Price (₹) *</label>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            name="fpPrice"
                            id="modal-prod-fp-price"
                            class="form-control mono"
                            value="${valFpPrice !== undefined && valFpPrice !== '' ? valFpPrice : ''}"
                            placeholder="e.g. 2999"
                            required
                          />
                        </div>
                      </div>

                      <div class="form-grid-2">
                        <div class="form-group">
                          <label class="form-label">6. GST (%) *</label>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            max="100"
                            name="gstPercentage"
                            class="form-control mono"
                            value="${valGst || 12}"
                            placeholder="e.g. 12"
                            required
                          />
                        </div>
                        <div class="form-group">
                          <label class="form-label">7. Product Status – Active or Inactive *</label>
                          <select name="status" class="form-control">
                            <option value="Active" ${valStatus !== 'Inactive' ? 'selected' : ''}>Active</option>
                            <option value="Inactive" ${valStatus === 'Inactive' ? 'selected' : ''}>Inactive</option>
                          </select>
                        </div>
                      </div>

                      <div class="form-group">
                        <label class="form-label">Product Image (Optional Photo)</label>
                        <div style="display:flex;align-items:center;gap:0.55rem;background:#f8fafc;border:1px solid var(--border-color);border-radius:8px;padding:0.4rem 0.5rem;">
                          <img
                            id="modal-prod-image-preview"
                            src="${previewImgSrc}"
                            alt="Preview"
                            style="width:40px;height:40px;border-radius:6px;border:1px solid #cbd5e1;object-fit:contain;background:#fff;flex-shrink:0;${previewImgSrc ? '' : 'display:none;'}"
                          />
                          <div style="flex:1;min-width:0;">
                            <input
                              type="file"
                              id="modal-prod-image-file"
                              accept="image/*"
                              class="form-control"
                              style="padding:0.22rem 0.35rem;font-size:0.75rem;"
                              onchange="CycleWorldApp.handleProductImageUpload(event)"
                            />
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.2rem;gap:0.3rem;">
                              <span id="modal-prod-image-status" style="font-size:0.68rem;font-weight:600;color:${hasCustomPhoto ? '#15803d' : 'var(--text-muted)'};">
                                ${hasCustomPhoto ? '✅ Custom Photo Attached' : 'Upload Photo'}
                              </span>
                              <button
                                type="button"
                                id="modal-prod-image-clear-btn"
                                class="btn btn-outline btn-xs"
                                style="padding:0.08rem 0.32rem;font-size:0.65rem;color:var(--danger);${hasCustomPhoto ? '' : 'display:none;'}"
                                onclick="CycleWorldApp.clearModalProductImage()"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

              </div>
              <div class="modal-footer" style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                  ${
                    prod
                      ? `<button type="button" class="btn btn-danger btn-sm" onclick="CycleWorldApp.confirmDeleteEntity('PRODUCT', '${prod.id}')">🗑️ Delete Product</button>`
                      : ''
                  }
                </div>
                <div style="display:flex;gap:0.5rem;">
                  <button type="button" class="btn btn-outline" onclick="CycleWorldApp.closeModal()">Cancel</button>
                  <button type="submit" class="btn btn-primary">💾 Save Product</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      `;
      return;
    }

    // MULTI-LEVEL SUB-CATEGORY GROUPS, MRP & GROUP ITEMS MANAGER MODAL
    if (type === 'SUBCATEGORY_GROUPS_MANAGER') {
      const subId = data.subcategoryId;
      const catsTree = API.getCategoriesTree({ activeOnly: false });
      let parentCat = null;
      let subObj = null;
      for (const c of catsTree) {
        const found = c.subcategories.find((s) => s.id === subId);
        if (found) {
          parentCat = c;
          subObj = found;
          break;
        }
      }

      if (!subObj) {
        state.modal = null;
        container.innerHTML = '';
        return;
      }

      const groups = API.getSubcategoryGroups(subObj.id, { activeOnly: false });
      // Only the 5 required default Sub-Category Groups are offered as default presets
      const requiredDefaults = API.getDefaultSubcategoryGroupNames
        ? API.getDefaultSubcategoryGroupNames()
        : ['Size', 'Model', 'Color', 'Type', 'Brand / Series'];
      const missingDefaults = requiredDefaults.filter(
        (preset) => !groups.some((g) => g.name.toLowerCase() === preset.toLowerCase())
      );

      container.innerHTML = `
        <div class="modal-backdrop" onclick="if(event.target===this)CycleWorldApp.closeModal()">
          <div class="modal-dialog modal-xl">
            <div class="modal-header">
              <div>
                <h3 class="modal-title">
                  🧩 Sub-Category Groups &amp; MRP Manager — ${escapeHtml(parentCat.name)} › ${escapeHtml(subObj.name)}
                </h3>
                <div style="font-size:0.77rem;color:var(--text-muted);margin-top:0.15rem;">
                  Only required default groups (<strong>Size, Model, Color, Type, Brand / Series</strong>) are included initially. Add/edit <strong>Group MRP</strong> or click <strong>Remove / Delete Group</strong> on any unwanted group to hide it from the category &amp; customer views.
                </div>
              </div>
              <div style="display:flex;gap:0.5rem;align-items:center;">
                ${
                  data.returnToProductModal
                    ? `<button type="button" class="btn btn-primary btn-xs" onclick="CycleWorldApp.returnToProductModalFromGroups('${parentCat.id}', '${subObj.id}')">
                        ← Back to Product Form
                      </button>`
                    : ''
                }
                <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.closeModal()">✕</button>
              </div>
            </div>

            <div class="modal-body">
              <!-- ADD NEW GROUP + OPTIONAL GROUP MRP BAR -->
              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:var(--radius-sm);padding:0.9rem 1rem;margin-bottom:1.1rem;">
                <form onsubmit="CycleWorldApp.handleAddSubcategoryGroup(event, '${subObj.id}')" style="display:flex;gap:0.65rem;align-items:flex-end;flex-wrap:wrap;">
                  <div style="flex:2;min-width:220px;">
                    <label class="form-label" style="color:#14532d;margin-bottom:0.25rem;">
                      + Add Sub-Category Group under "${escapeHtml(subObj.name)}" *
                    </label>
                    <input
                      type="text"
                      name="groupName"
                      class="form-control"
                      placeholder="Enter Group Name (e.g. Size, Model, Color, Type, Brand / Series)"
                      required
                    />
                  </div>
                  <div style="flex:1;min-width:165px;">
                    <label class="form-label" style="color:#14532d;margin-bottom:0.25rem;">
                      Group MRP (₹) (Optional)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      name="groupMrp"
                      class="form-control mono"
                      placeholder="e.g. 4200"
                    />
                  </div>
                  <button type="submit" class="btn btn-primary">
                    + Add Group
                  </button>
                </form>

                ${
                  missingDefaults.length > 0
                    ? `
                      <div style="margin-top:0.7rem;display:flex;align-items:center;justify-content:space-between;gap:0.5rem;flex-wrap:wrap;padding-top:0.6rem;border-top:1px dashed #bbf7d0;">
                        <div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;">
                          <span style="font-size:0.74rem;font-weight:700;color:#166534;">Required Default Groups:</span>
                          ${missingDefaults
                            .map(
                              (preset) => `
                                <button
                                  type="button"
                                  class="btn btn-outline btn-xs"
                                  style="background:#fff;border-color:#86efac;color:#14532d;"
                                  onclick="CycleWorldApp.quickAddPresetGroup('${subObj.id}', '${escapeHtml(preset).replace(/'/g, "\\'")}')"
                                >
                                  + ${escapeHtml(preset)}
                                </button>
                              `
                            )
                            .join('')}
                        </div>
                        <button
                          type="button"
                          class="btn btn-soft btn-xs"
                          onclick="CycleWorldApp.handleSeedDefaultSubcategoryGroups('${subObj.id}')"
                        >
                          ⚡ Load All 5 Required Default Groups
                        </button>
                      </div>
                    `
                    : ''
                }
              </div>

              <!-- EXISTING GROUPS, GROUP MRP & ITEMS -->
              ${
                groups.length === 0
                  ? `
                    <div style="text-align:center;padding:2.5rem 1rem;background:var(--bg-subtle);border:1px dashed var(--border-strong);border-radius:var(--radius-sm);">
                      <div style="font-size:1.8rem;margin-bottom:0.4rem;">🧩</div>
                      <h4 style="font-size:0.98rem;font-weight:800;">No Active Groups Under "${escapeHtml(subObj.name)}"</h4>
                      <p style="font-size:0.82rem;color:var(--text-muted);max-width:540px;margin:0.25rem auto 0.85rem;">
                        Click below to load the 5 required default Sub-Category Groups (<strong>Size, Model, Color, Type, Brand / Series</strong>) or add custom groups above.
                      </p>
                      <button
                        type="button"
                        class="btn btn-primary btn-sm"
                        onclick="CycleWorldApp.handleSeedDefaultSubcategoryGroups('${subObj.id}')"
                      >
                        ⚡ Load Required Default Groups Now
                      </button>
                    </div>
                  `
                  : `
                    <div style="display:grid;gap:0.95rem;">
                      ${groups
                        .map(
                          (grp, gIdx) => `
                            <div style="border:1px solid var(--border-strong);border-radius:var(--radius-sm);background:#ffffff;overflow:hidden;">
                              <div style="background:var(--bg-subtle);padding:0.65rem 0.95rem;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.6rem;">
                                <div style="display:flex;align-items:center;gap:0.55rem;flex-wrap:wrap;">
                                  <span class="sku-pill">#${gIdx + 1}</span>
                                  <span style="font-weight:800;font-size:0.95rem;color:var(--text-main);">
                                    ${escapeHtml(grp.name)}
                                  </span>
                                  <span style="font-size:0.75rem;color:var(--text-muted);">
                                    (${(grp.items || []).length} values)
                                  </span>
                                  <span style="display:inline-flex;align-items:center;gap:0.25rem;background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;padding:0.15rem 0.5rem;border-radius:999px;font-size:0.74rem;font-weight:800;">
                                    MRP: ${grp.mrp > 0 ? formatCurrency(grp.mrp) : 'Not Set'}
                                  </span>
                                </div>

                                <div style="display:flex;gap:0.35rem;flex-wrap:wrap;align-items:center;">
                                  <!-- INLINE SUB-CATEGORY GROUP MRP EDITOR -->
                                  <form onsubmit="CycleWorldApp.handleSaveSubcategoryGroupMrp(event, '${grp.id}')" style="display:inline-flex;align-items:center;gap:0.3rem;background:#fff;border:1px solid var(--border-color);border-radius:6px;padding:0.18rem 0.4rem;">
                                    <span style="font-size:0.71rem;font-weight:700;color:var(--text-secondary);">MRP ₹</span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      name="mrp"
                                      class="form-control mono"
                                      style="width:88px;padding:0.18rem 0.35rem;font-size:0.76rem;"
                                      placeholder="0.00"
                                      value="${grp.mrp > 0 ? grp.mrp : ''}"
                                    />
                                    <label style="display:inline-flex;align-items:center;gap:0.2rem;font-size:0.68rem;color:var(--text-muted);cursor:pointer;" title="Also update MRP on products in this sub-category">
                                      <input type="checkbox" name="applyToProducts" checked /> Sync Products
                                    </label>
                                    <button type="submit" class="btn btn-soft btn-xs" style="padding:0.15rem 0.45rem;font-size:0.7rem;">
                                      Save MRP
                                    </button>
                                  </form>

                                  <button
                                    type="button"
                                    class="btn btn-outline btn-xs"
                                    title="Move Group Up"
                                    ${gIdx === 0 ? 'disabled' : ''}
                                    onclick="CycleWorldApp.handleReorderSubcategoryGroup('${grp.id}', 'UP')"
                                  >
                                    ↑
                                  </button>
                                  <button
                                    type="button"
                                    class="btn btn-outline btn-xs"
                                    title="Move Group Down"
                                    ${gIdx === groups.length - 1 ? 'disabled' : ''}
                                    onclick="CycleWorldApp.handleReorderSubcategoryGroup('${grp.id}', 'DOWN')"
                                  >
                                    ↓
                                  </button>
                                  <button
                                    type="button"
                                    class="btn btn-outline btn-xs"
                                    onclick="CycleWorldApp.promptRenameSubcategoryGroup('${grp.id}', '${escapeHtml(grp.name).replace(/'/g, "\\'")}')"
                                  >
                                    ✏️ Rename
                                  </button>
                                  <button
                                    type="button"
                                    class="btn btn-danger btn-xs"
                                    title="Remove / Delete this Sub-Category Group from category & customer views"
                                    onclick="CycleWorldApp.handleDeleteSubcategoryGroup('${grp.id}', '${escapeHtml(grp.name).replace(/'/g, "\\'")}')"
                                  >
                                    🗑️ Remove / Delete Group
                                  </button>
                                </div>
                              </div>

                              <div style="padding:0.85rem 0.95rem;">
                                <!-- ITEMS LIST -->
                                <div style="margin-bottom:0.75rem;">
                                  <div style="font-size:0.74rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.4rem;">
                                    Admin-Created Group Items / Values inside "${escapeHtml(grp.name)}":
                                  </div>
                                  ${
                                    !grp.items || grp.items.length === 0
                                      ? `<div style="font-size:0.8rem;color:var(--text-muted);font-style:italic;">No items added yet. Add values below (e.g. 12T, 14T, 16T or Red, Blue, Green).</div>`
                                      : `
                                        <div style="display:flex;flex-wrap:wrap;gap:0.45rem;">
                                          ${grp.items
                                            .map(
                                              (item, iIdx) => `
                                                <div style="display:inline-flex;align-items:center;gap:0.3rem;background:#f8fafc;border:1px solid #cbd5e1;border-radius:999px;padding:0.22rem 0.55rem;font-size:0.8rem;">
                                                  <button
                                                    type="button"
                                                    style="font-size:0.68rem;color:var(--text-muted);cursor:pointer;padding:0 2px;"
                                                    title="Move Left"
                                                    ${iIdx === 0 ? 'disabled' : ''}
                                                    onclick="CycleWorldApp.handleReorderGroupItem('${item.id}', 'UP')"
                                                  >◀</button>
                                                  <span style="font-weight:700;color:var(--text-main);">${escapeHtml(item.value)}</span>
                                                  <button
                                                    type="button"
                                                    style="font-size:0.68rem;color:var(--text-muted);cursor:pointer;padding:0 2px;"
                                                    title="Move Right"
                                                    ${iIdx === grp.items.length - 1 ? 'disabled' : ''}
                                                    onclick="CycleWorldApp.handleReorderGroupItem('${item.id}', 'DOWN')"
                                                  >▶</button>
                                                  <button
                                                    type="button"
                                                    style="font-size:0.72rem;color:var(--primary);cursor:pointer;padding:0 2px;"
                                                    title="Edit Value"
                                                    onclick="CycleWorldApp.promptEditGroupItem('${item.id}', '${escapeHtml(item.value).replace(/'/g, "\\'")}')"
                                                  >✏️</button>
                                                  <button
                                                    type="button"
                                                    style="font-size:0.72rem;color:var(--danger);cursor:pointer;padding:0 2px;font-weight:800;"
                                                    title="Delete Value"
                                                    onclick="CycleWorldApp.handleDeleteGroupItem('${item.id}')"
                                                  >✕</button>
                                                </div>
                                              `
                                            )
                                            .join('')}
                                        </div>
                                      `
                                  }
                                </div>

                                <!-- ADD ITEMS FORM -->
                                <form onsubmit="CycleWorldApp.handleAddGroupItems(event, '${grp.id}')" style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">
                                  <input
                                    type="text"
                                    name="rawValues"
                                    class="form-control"
                                    style="flex:1;min-width:220px;padding:0.4rem 0.65rem;font-size:0.82rem;"
                                    placeholder="Add single or multiple comma-separated values for ${escapeHtml(grp.name)} (e.g. 12T, 14T, 16T, 18T, 20T)"
                                    required
                                  />
                                  <button type="submit" class="btn btn-soft btn-sm">
                                    + Add Value(s)
                                  </button>
                                </form>
                              </div>
                            </div>
                          `
                        )
                        .join('')}
                    </div>
                  `
              }
            </div>

            <div class="modal-footer" style="display:flex;justify-content:space-between;align-items:center;">
              <div style="font-size:0.78rem;color:var(--text-muted);">
                Removed groups immediately stop appearing in the category view, product form, and customer portal.
              </div>
              <div style="display:flex;gap:0.5rem;">
                ${
                  data.returnToProductModal
                    ? `<button type="button" class="btn btn-primary" onclick="CycleWorldApp.returnToProductModalFromGroups('${parentCat.id}', '${subObj.id}')">
                        ✓ Done — Return to Product Form
                      </button>`
                    : `<button type="button" class="btn btn-primary" onclick="CycleWorldApp.closeModal()">
                        ✓ Done
                      </button>`
                }
              </div>
            </div>
          </div>
        </div>
      `;
      return;
    }

    if (type === 'QUICK_STOCK') {
      const p = data.product;
      const hasCustomPhoto = Boolean(p.hasCustomImage);
      const rawImgVal = p.rawImageUrl || '';
      container.innerHTML = `
        <div class="modal-backdrop" onclick="if(event.target===this)CycleWorldApp.closeModal()">
          <div class="modal-dialog" style="max-width:480px;">
            <div class="modal-header">
              <h3 class="modal-title">⚡ Quick Update — ${escapeHtml(p.name)}</h3>
              <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.closeModal()">✕</button>
            </div>
            <form onsubmit="CycleWorldApp.handleQuickStockSubmit(event)">
              <input type="hidden" name="productId" value="${escapeHtml(p.id)}" />
              <input type="hidden" name="mrp" value="${p.mrp || 0}" />
              <div class="modal-body">
                <div style="font-weight:700;font-size:0.95rem;color:var(--text-main);margin-bottom:0.2rem;">${escapeHtml(p.name)}</div>
                <div style="font-size:0.79rem;color:var(--primary);font-weight:600;margin-bottom:0.6rem;">${escapeHtml(p.categoryName)} › ${escapeHtml(p.subcategoryName)}</div>

                <div class="form-group" style="margin-top:0.4rem;">
                  <label class="form-label">Product Image (Upload / Change Photo)</label>
                  <div style="display:flex;align-items:center;gap:0.65rem;background:#f8fafc;border:1px solid var(--border-color);border-radius:8px;padding:0.45rem 0.6rem;">
                    <img
                      id="modal-prod-image-preview"
                      src="${p.imageUrl}"
                      alt="${escapeHtml(p.name)}"
                      style="width:50px;height:50px;border-radius:6px;border:1px solid #cbd5e1;object-fit:contain;background:#fff;flex-shrink:0;"
                    />
                    <div style="flex:1;min-width:0;">
                      <input
                        type="file"
                        id="modal-prod-image-file"
                        accept="image/*"
                        class="form-control"
                        style="padding:0.28rem 0.4rem;font-size:0.76rem;"
                        onchange="CycleWorldApp.handleProductImageUpload(event)"
                      />
                      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.22rem;gap:0.35rem;">
                        <span id="modal-prod-image-status" style="font-size:0.7rem;font-weight:600;color:${hasCustomPhoto ? '#15803d' : 'var(--text-muted)'};">
                          ${hasCustomPhoto ? '✅ Custom Photo Attached' : 'Upload JPG, PNG, or WebP'}
                        </span>
                        <button
                          type="button"
                          id="modal-prod-image-clear-btn"
                          class="btn btn-outline btn-xs"
                          style="padding:0.1rem 0.38rem;font-size:0.68rem;color:var(--danger);${hasCustomPhoto ? '' : 'display:none;'}"
                          onclick="CycleWorldApp.clearModalProductImage()"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                  <input type="hidden" name="imageUrl" id="modal-prod-image-url" value="${escapeHtml(rawImgVal)}" />
                </div>

                <div class="form-grid-2">
                  <div class="form-group">
                    <label class="form-label">Available Quantity *</label>
                    <input type="number" step="1" min="0" name="stock" class="form-control mono" value="${p.stock}" required />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Product Price (₹) *</label>
                    <input type="number" step="any" min="0" name="fpPrice" class="form-control mono" value="${p.fpPrice || 0}" required />
                  </div>
                </div>

                <div class="form-grid-2">
                  <div class="form-group">
                    <label class="form-label">GST (%) *</label>
                    <input type="number" step="any" min="0" max="100" name="gstPercentage" class="form-control mono" value="${p.gstPercentage}" required />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Product Status – Active or Inactive *</label>
                    <select name="status" class="form-control">
                      <option value="Active" ${p.adminConfiguredStatus !== 'Inactive' ? 'selected' : ''}>Active</option>
                      <option value="Inactive" ${p.adminConfiguredStatus === 'Inactive' ? 'selected' : ''}>Inactive</option>
                    </select>
                  </div>
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline" onclick="CycleWorldApp.closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary">💾 Update Product</button>
              </div>
            </form>
          </div>
        </div>
      `;
      return;
    }

    if (type === 'CATEGORY_FORM') {
      const cat = data.category || null;
      container.innerHTML = `
        <div class="modal-backdrop" onclick="if(event.target===this)CycleWorldApp.closeModal()">
          <div class="modal-dialog" style="max-width:480px;">
            <div class="modal-header">
              <h3 class="modal-title">${cat ? 'Edit Category' : 'Create Category'}</h3>
              <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.closeModal()">✕</button>
            </div>
            <form onsubmit="CycleWorldApp.handleSaveCategoryForm(event)" autocomplete="off">
              <input type="hidden" name="id" value="${cat ? escapeHtml(cat.id) : ''}" />
              <div class="modal-body">
                <div class="form-group">
                  <label class="form-label">Category Name *</label>
                  <input type="text" name="name" class="form-control" value="${cat ? escapeHtml(cat.name) : ''}" placeholder="Enter Category Name" required autofocus />
                </div>
                <div class="form-group">
                  <label class="form-label">Description (Optional)</label>
                  <input type="text" name="description" class="form-control" value="${cat ? escapeHtml(cat.description) : ''}" />
                </div>
                <div class="form-group">
                  <label class="form-label">Status (Enable / Disable)</label>
                  <select name="status" class="form-control">
                    <option value="Active" ${!cat || cat.status === 'Active' ? 'selected' : ''}>Enabled (Active)</option>
                    <option value="Inactive" ${cat && cat.status === 'Inactive' ? 'selected' : ''}>Disabled (Inactive)</option>
                  </select>
                </div>
              </div>
              <div class="modal-footer" style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                  ${
                    cat
                      ? `<button type="button" class="btn btn-danger btn-sm" onclick="CycleWorldApp.confirmDeleteEntity('CATEGORY', '${cat.id}')">🗑️ Delete Category</button>`
                      : ''
                  }
                </div>
                <div style="display:flex;gap:0.5rem;">
                  <button type="button" class="btn btn-outline" onclick="CycleWorldApp.closeModal()">Cancel</button>
                  <button type="submit" class="btn btn-primary">Save Category</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      `;
      return;
    }

    if (type === 'SUBCATEGORY_FORM') {
      const sub = data.subcategory || null;
      const catsTree = API.getCategoriesTree({ activeOnly: false });

      if (catsTree.length === 0) {
        container.innerHTML = `
          <div class="modal-backdrop" onclick="if(event.target===this)CycleWorldApp.closeModal()">
            <div class="modal-dialog" style="max-width:460px;">
              <div class="modal-header">
                <h3 class="modal-title">Create a Category First</h3>
                <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.closeModal()">✕</button>
              </div>
              <div class="modal-body" style="text-align:center;padding:1.75rem;">
                <p style="margin-bottom:1rem;">Please create a parent Category first before adding a Subcategory.</p>
                <button type="button" class="btn btn-primary" onclick="CycleWorldApp.openCategoryModal(null)">+ Create Category</button>
              </div>
            </div>
          </div>
        `;
        return;
      }

      const defaultCatId = data.defaultCategoryId || (sub ? sub.categoryId : catsTree[0].id);
      container.innerHTML = `
        <div class="modal-backdrop" onclick="if(event.target===this)CycleWorldApp.closeModal()">
          <div class="modal-dialog" style="max-width:500px;">
            <div class="modal-header">
              <h3 class="modal-title">${sub ? 'Edit Subcategory' : 'Create Subcategory'}</h3>
              <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.closeModal()">✕</button>
            </div>
            <form onsubmit="CycleWorldApp.handleSaveSubcategoryForm(event)" autocomplete="off">
              <input type="hidden" name="id" value="${sub ? escapeHtml(sub.id) : ''}" />
              <div class="modal-body">
                <div class="form-group">
                  <label class="form-label">Parent Category *</label>
                  <select name="categoryId" class="form-control" required>
                    ${catsTree
                      .map(
                        (c) =>
                          `<option value="${c.id}" ${c.id === defaultCatId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
                      )
                      .join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Subcategory Name *</label>
                  <input type="text" name="name" class="form-control" value="${sub ? escapeHtml(sub.name) : ''}" placeholder="Enter Subcategory Name (e.g. Kids, Junior, MTB)" required autofocus />
                </div>
                <div class="form-group">
                  <label class="form-label">Description (Optional)</label>
                  <input type="text" name="description" class="form-control" value="${sub ? escapeHtml(sub.description) : ''}" />
                </div>
                ${
                  !sub
                    ? `
                      <div class="form-group" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:var(--radius-sm);padding:0.65rem 0.8rem;">
                        <label style="display:flex;align-items:flex-start;gap:0.5rem;cursor:pointer;font-size:0.81rem;font-weight:700;color:#14532d;">
                          <input type="checkbox" name="seedDefaultGroups" checked style="margin-top:0.2rem;" />
                          <span>
                            Automatically include required default Sub-Category Groups (<strong>Size, Model, Color, Type, Brand / Series</strong>)
                            <span style="display:block;font-weight:500;font-size:0.74rem;color:#166534;margin-top:0.15rem;">
                              You can add, edit, set MRP, or remove any group at any time from the Sub-Category Groups manager.
                            </span>
                          </span>
                        </label>
                      </div>
                    `
                    : ''
                }
                <div class="form-group">
                  <label class="form-label">Status (Enable / Disable)</label>
                  <select name="status" class="form-control">
                    <option value="Active" ${!sub || sub.status === 'Active' ? 'selected' : ''}>Enabled (Active)</option>
                    <option value="Inactive" ${sub && sub.status === 'Inactive' ? 'selected' : ''}>Disabled (Inactive)</option>
                  </select>
                </div>
              </div>
              <div class="modal-footer" style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                  ${
                    sub
                      ? `<button type="button" class="btn btn-danger btn-sm" onclick="CycleWorldApp.confirmDeleteEntity('SUBCATEGORY', '${sub.id}')">🗑️ Delete Subcategory</button>`
                      : ''
                  }
                </div>
                <div style="display:flex;gap:0.5rem;">
                  <button type="button" class="btn btn-outline" onclick="CycleWorldApp.closeModal()">Cancel</button>
                  <button type="submit" class="btn btn-primary">Save Subcategory</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      `;
      return;
    }

    // CUSTOMER CREATION MODAL (Requirement 6: Strictly Manual Entry — No Auto-Generated Login IDs)
    if (type === 'CUSTOMER_FORM') {
      const c = data.customer || null;
      container.innerHTML = `
        <div class="modal-backdrop" onclick="if(event.target===this)CycleWorldApp.closeModal()">
          <div class="modal-dialog modal-lg">
            <div class="modal-header">
              <h3 class="modal-title">${c ? `Edit Customer Account — ${escapeHtml(c.customerCode)}` : 'Create Customer / Store Account'}</h3>
              <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.closeModal()">✕</button>
            </div>
            <form onsubmit="CycleWorldApp.handleSaveCustomerForm(event)" autocomplete="off">
              <input type="hidden" name="id" value="${c ? escapeHtml(c.id) : ''}" />
              <div class="modal-body">
                <div class="form-grid-2">
                  <div class="form-group">
                    <label class="form-label">Customer / Store Name *</label>
                    <input type="text" name="storeName" class="form-control" value="${c ? escapeHtml(c.storeName) : ''}" placeholder="Enter Customer / Store Name" required autofocus />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Customer Login ID * (Manual Entry)</label>
                    <input type="text" name="customerCode" class="form-control mono" value="${c ? escapeHtml(c.customerCode) : ''}" placeholder="Manually enter Customer Login ID" required />
                  </div>
                </div>

                <div class="form-grid-2">
                  <div class="form-group">
                    <label class="form-label">Email ID (If required)</label>
                    <input type="email" name="email" class="form-control mono" value="${c ? escapeHtml(c.email) : ''}" placeholder="Optional Email ID" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">${c ? 'Reset Password (leave blank to keep current)' : 'Password *'}</label>
                    <input type="text" name="password" class="form-control mono" value="" ${c ? '' : 'required'} placeholder="${c ? 'Enter new password to reset' : 'Enter Customer Login Password'}" />
                  </div>
                </div>

                <div class="form-grid-2">
                  <div class="form-group">
                    <label class="form-label">Contact Details (Phone / Contact Person) *</label>
                    <input type="text" name="phone" class="form-control" value="${c ? escapeHtml(c.phone) : ''}" placeholder="Enter Phone / Contact Details" required />
                  </div>
                  <div class="form-group">
                    <label class="form-label">GST Details (If required)</label>
                    <input type="text" name="gstNumber" class="form-control mono" value="${c ? escapeHtml(c.gstNumber) : ''}" placeholder="Optional GSTIN" />
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label">Address *</label>
                  <input type="text" name="address" class="form-control" value="${c ? escapeHtml(c.address) : ''}" placeholder="Enter Store Address" required />
                </div>

                <div class="form-group">
                  <label class="form-label">Account Status (Enable / Disable) *</label>
                  <select name="status" class="form-control">
                    <option value="Active" ${!c || c.status === 'Active' ? 'selected' : ''}>Enabled (Active)</option>
                    <option value="Inactive" ${c && c.status === 'Inactive' ? 'selected' : ''}>Disabled (Inactive)</option>
                  </select>
                </div>
              </div>
              <div class="modal-footer" style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                  ${
                    c
                      ? `<button type="button" class="btn btn-danger btn-sm" onclick="CycleWorldApp.confirmDeleteEntity('CUSTOMER', '${c.id}')">🗑️ Delete Customer</button>`
                      : ''
                  }
                </div>
                <div style="display:flex;gap:0.5rem;">
                  <button type="button" class="btn btn-outline" onclick="CycleWorldApp.closeModal()">Cancel</button>
                  <button type="submit" class="btn btn-primary">💾 Save Customer Account</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      `;
      return;
    }

    if (type === 'EMPLOYEE_FORM') {
      const e = data.employee || null;
      container.innerHTML = `
        <div class="modal-backdrop" onclick="if(event.target===this)CycleWorldApp.closeModal()">
          <div class="modal-dialog" style="max-width:540px;">
            <div class="modal-header">
              <h3 class="modal-title">${e ? `Edit Billing Employee — ${escapeHtml(e.employeeCode)}` : 'Create Employee / Billing Login'}</h3>
              <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.closeModal()">✕</button>
            </div>
            <form onsubmit="CycleWorldApp.handleSaveEmployeeForm(event)" autocomplete="off">
              <input type="hidden" name="id" value="${e ? escapeHtml(e.id) : ''}" />
              <div class="modal-body">
                <div class="form-grid-2">
                  <div class="form-group">
                    <label class="form-label">Employee Login ID *</label>
                    <input type="text" name="employeeCode" class="form-control mono" value="${e ? escapeHtml(e.employeeCode) : ''}" placeholder="Enter Employee Login ID" required autofocus />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Employee Name *</label>
                    <input type="text" name="fullName" class="form-control" value="${e ? escapeHtml(e.fullName) : ''}" placeholder="Enter Full Name" required />
                  </div>
                </div>
                <div class="form-grid-2">
                  <div class="form-group">
                    <label class="form-label">Email (Optional)</label>
                    <input type="email" name="email" class="form-control mono" value="${e ? escapeHtml(e.email) : ''}" placeholder="Optional Email" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">${e ? 'New Password (optional)' : 'Password *'}</label>
                    <input type="text" name="password" class="form-control mono" value="" ${e ? '' : 'required'} placeholder="Enter Password" />
                  </div>
                </div>
                <div class="form-grid-2">
                  <div class="form-group">
                    <label class="form-label">Phone</label>
                    <input type="text" name="phone" class="form-control" value="${e ? escapeHtml(e.phone) : ''}" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Designation</label>
                    <input type="text" name="designation" class="form-control" value="${e ? escapeHtml(e.designation) : 'Billing Executive'}" />
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label">Status (Enable / Disable)</label>
                  <select name="status" class="form-control">
                    <option value="Active" ${!e || e.status === 'Active' ? 'selected' : ''}>Enabled (Active)</option>
                    <option value="Inactive" ${e && e.status === 'Inactive' ? 'selected' : ''}>Disabled (Inactive)</option>
                  </select>
                </div>
              </div>
              <div class="modal-footer" style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                  ${
                    e
                      ? `<button type="button" class="btn btn-danger btn-sm" onclick="CycleWorldApp.confirmDeleteEntity('EMPLOYEE', '${e.id}')">🗑️ Delete Employee</button>`
                      : ''
                  }
                </div>
                <div style="display:flex;gap:0.5rem;">
                  <button type="button" class="btn btn-outline" onclick="CycleWorldApp.closeModal()">Cancel</button>
                  <button type="submit" class="btn btn-primary">Save Billing User</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      `;
      return;
    }

    if (type === 'CONFIRM_DELETE') {
      const { entityType, entityId, title, summary, warningNote } = data;
      container.innerHTML = `
        <div class="modal-backdrop" onclick="if(event.target===this)CycleWorldApp.closeModal()">
          <div class="modal-dialog" style="max-width:460px;">
            <div class="modal-header" style="background:var(--danger-soft);border-bottom-color:#fecaca;">
              <h3 class="modal-title" style="color:#991b1b;">🗑️ ${escapeHtml(title)}</h3>
              <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.closeModal()">✕</button>
            </div>
            <div class="modal-body">
              <div style="font-size:0.92rem;font-weight:700;color:var(--text-main);margin-bottom:0.5rem;">
                ${escapeHtml(summary)}
              </div>
              <div style="font-size:0.82rem;color:var(--text-secondary);background:var(--bg-subtle);border:1px solid var(--border-color);border-radius:var(--radius-sm);padding:0.75rem;">
                ${escapeHtml(warningNote)}
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline" onclick="CycleWorldApp.closeModal()">Cancel</button>
              <button type="button" class="btn btn-danger" onclick="CycleWorldApp.executeConfirmedDelete('${entityType}', '${entityId}')">
                🗑️ Confirm Delete
              </button>
            </div>
          </div>
        </div>
      `;
      return;
    }

    if (type === 'ORDER_CONFIRM_SUMMARY') {
      const catalogProducts = API.getCustomerCatalogProducts();
      const cartSummary = calculateCartSummary(catalogProducts);
      const profile = API.getOwnCustomerProfile();

      container.innerHTML = `
        <div class="modal-backdrop" onclick="if(event.target===this)CycleWorldApp.closeModal()">
          <div class="modal-dialog modal-xl">
            <div class="modal-header">
              <h3 class="modal-title">📋 Confirm Order Punch Summary Before Submission</h3>
              <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.closeModal()">✕</button>
            </div>
            <div class="modal-body">
              <div class="invoice-parties-grid" style="font-size:0.84rem;">
                <div class="invoice-party-box">
                  <div style="color:var(--text-muted);font-size:0.74rem;text-transform:uppercase;font-weight:700;">Customer / Store</div>
                  <div style="font-weight:800;font-size:0.95rem;">${escapeHtml(profile.storeName)}</div>
                  <div class="mono">Customer ID: ${escapeHtml(profile.customerCode)} ${profile.gstNumber ? `| GST: ${escapeHtml(profile.gstNumber)}` : ''}</div>
                </div>
                <div class="invoice-party-box">
                  <div style="color:var(--text-muted);font-size:0.74rem;text-transform:uppercase;font-weight:700;">Address &amp; Contact</div>
                  <div>${escapeHtml(profile.address)}</div>
                  <div>Contact: ${escapeHtml(profile.phone)}</div>
                </div>
              </div>

              <div class="table-responsive" style="margin-bottom:1rem;">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Category / Sub-Category</th>
                      <th>Product Name &amp; Variants</th>
                      <th>SKU Code</th>
                      <th>Qty</th>
                      <th>Unit Price</th>
                      <th>Total Amount</th>
                      <th>GST / Tax</th>
                      <th>Grand Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${cartSummary.lines
                      .map(
                        (l) => `
                      <tr>
                        <td style="font-size:0.78rem;">
                          <div style="font-weight:700;">${escapeHtml(l.categoryName)}</div>
                          <div style="color:var(--text-muted);">${escapeHtml(l.subcategoryName)}</div>
                        </td>
                        <td>
                          <div style="font-weight:700;">${escapeHtml(l.name)}</div>
                          ${renderVariantBadges(l, true)}
                        </td>
                        <td class="mono" style="font-weight:700;">${escapeHtml(l.skuCode)}</td>
                        <td class="mono" style="font-weight:700;">${l.quantity}</td>
                        <td class="mono">${formatCurrency(l.fpPrice)}</td>
                        <td class="mono">${formatCurrency(l.lineSubtotal)}</td>
                        <td class="mono">${l.gstPercentage}% (+${formatCurrency(l.lineGstAmount)})</td>
                        <td class="mono" style="font-weight:800;">${formatCurrency(l.lineFinalTotal)}</td>
                      </tr>
                    `
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>

              <div style="display:flex;justify-content:flex-end;">
                <div style="width:100%;max-width:320px;background:var(--bg-subtle);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:0.9rem;">
                  <div style="display:flex;justify-content:space-between;margin-bottom:0.3rem;font-size:0.85rem;">
                    <span>Total Amount (Taxable):</span>
                    <strong class="mono">${formatCurrency(cartSummary.subtotal)}</strong>
                  </div>
                  <div style="display:flex;justify-content:space-between;margin-bottom:0.45rem;font-size:0.85rem;">
                    <span>GST / Tax Details:</span>
                    <strong class="mono">+ ${formatCurrency(cartSummary.totalGst)}</strong>
                  </div>
                  <div style="display:flex;justify-content:space-between;padding-top:0.45rem;border-top:2px solid var(--bg-navy);font-size:1.08rem;font-weight:800;">
                    <span>Grand Total:</span>
                    <span class="mono" style="color:var(--primary-hover);">${formatCurrency(cartSummary.grandTotal)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline" onclick="CycleWorldApp.closeModal()">← Back to Cart</button>
              <button type="button" class="btn btn-success" onclick="CycleWorldApp.confirmAndSubmitOrderNow()">
                ✅ Submit Order &amp; Create Order Punch
              </button>
            </div>
          </div>
        </div>
      `;
      return;
    }

    // ORDER PUNCH / ORDER CONFIRMATION MODAL (Requirement 2: View Order, Generate PDF, Download PDF, Print Order Directly)
    if (type === 'ORDER_DETAIL') {
      const ord = API.getOrderDetails(data.orderId);
      const cs = ord.companySettings;
      const session = API.getCurrentSession();
      const canUpdateStatus =
        session && (session.role === 'SUPER_ADMIN' || session.role === 'BILLING_EMPLOYEE');
      const statuses = [
        'New',
        'Confirmed',
        'Processing',
        'Ready for Billing',
        'Dispatched',
        'Completed',
        'Cancelled'
      ];

      container.innerHTML = `
        <div class="modal-backdrop" onclick="if(event.target===this)CycleWorldApp.closeModal()">
          <div class="modal-dialog modal-xl">
            <div class="modal-header no-print" style="flex-wrap:wrap;gap:0.75rem;">
              <div style="display:flex;align-items:center;gap:0.65rem;flex-wrap:wrap;">
                <h3 class="modal-title">
                  Order Punch ${escapeHtml(ord.orderNumber)} — ${escapeHtml(ord.storeName)}
                </h3>
                <span class="status-badge ${getStatusBadgeClass(ord.status)}">${escapeHtml(ord.status)}</span>
              </div>

              <!-- 4 REQUIRED ORDER PUNCH ACTIONS: View Order, Generate PDF, Download PDF, Print Order Directly -->
              <div style="display:flex;gap:0.45rem;flex-wrap:wrap;align-items:center;">
                <button
                  type="button"
                  class="btn btn-outline btn-sm"
                  onclick="CycleWorldApp.focusOrderPunchSheet()"
                >
                  👁️ View Order
                </button>
                <button
                  type="button"
                  class="btn btn-soft btn-sm"
                  onclick="CycleWorldApp.generateOrderPdfPreview('${ord.id}')"
                >
                  📄 Generate PDF
                </button>
                <button
                  type="button"
                  class="btn btn-navy btn-sm"
                  onclick="CycleWorldApp.downloadOrderPdf('${ord.id}')"
                >
                  📥 Download PDF
                </button>
                <button
                  type="button"
                  class="btn btn-primary btn-sm"
                  onclick="CycleWorldApp.printOrderDirectly('${ord.id}')"
                >
                  🖨️ Print Order Directly
                </button>
                <button
                  type="button"
                  class="btn btn-outline btn-sm"
                  onclick="CycleWorldApp.downloadSingleOrderCsv('${ord.id}')"
                >
                  CSV
                </button>
                <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.closeModal()">✕</button>
              </div>
            </div>

            <div class="modal-body">
              ${
                data.justSubmitted
                  ? `
                    <div class="no-print" style="background:#dcfce7;border:1px solid #86efac;border-radius:var(--radius-sm);padding:0.85rem 1rem;margin-bottom:1rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.75rem;">
                      <div>
                        <div style="font-weight:800;color:#14532d;font-size:0.95rem;">
                          ✅ Order Punch / Order Confirmation Created Automatically!
                        </div>
                        <div style="font-size:0.81rem;color:#166534;margin-top:0.15rem;">
                          Unique Order Number <strong>${escapeHtml(ord.orderNumber)}</strong> has been generated. Use the buttons above to <strong>View Order</strong>, <strong>Generate PDF</strong>, <strong>Download PDF</strong>, or <strong>Print Order Directly</strong> on A4 paper.
                        </div>
                      </div>
                    </div>
                  `
                  : ''
              }

              ${
                canUpdateStatus
                  ? `
                    <div class="no-print" style="background:var(--bg-subtle);border:1px solid var(--border-color);border-radius:var(--radius-sm);padding:0.65rem 0.95rem;margin-bottom:1rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
                      <div style="font-size:0.82rem;font-weight:700;">
                        ⚡ Track &amp; Update Order Status:
                      </div>
                      <div style="display:flex;align-items:center;gap:0.5rem;">
                        <select
                          class="form-control"
                          style="width:auto;padding:0.32rem 0.65rem;font-weight:700;font-size:0.82rem;"
                          onchange="CycleWorldApp.handleOrderStatusChange('${ord.id}', this.value)"
                        >
                          ${statuses
                            .map(
                              (st) =>
                                `<option value="${st}" ${ord.status === st ? 'selected' : ''}>${st}</option>`
                            )
                            .join('')}
                        </select>
                      </div>
                    </div>
                  `
                  : ''
              }

              ${
                data.pdfPreviewUrl
                  ? `
                    <div class="no-print" style="margin-bottom:1rem;border:2px solid var(--primary);border-radius:var(--radius-sm);overflow:hidden;background:#0f172a;">
                      <div style="padding:0.55rem 0.9rem;background:#14532d;color:#fff;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
                        <span style="font-size:0.82rem;font-weight:700;">📄 Generated Order Punch PDF — ${escapeHtml(ord.orderNumber)}.pdf</span>
                        <div style="display:flex;gap:0.4rem;">
                          <button type="button" class="btn btn-success btn-xs" onclick="CycleWorldApp.downloadOrderPdf('${ord.id}')">
                            📥 Download PDF File
                          </button>
                          <button type="button" class="btn btn-outline btn-xs" style="color:#fff;border-color:#fff;" onclick="CycleWorldApp.closeOrderPdfPreview()">
                            Hide Preview
                          </button>
                        </div>
                      </div>
                      <iframe src="${data.pdfPreviewUrl}" style="width:100%;height:380px;border:none;background:#fff;" title="Order PDF Preview"></iframe>
                    </div>
                  `
                  : ''
              }

              <div class="invoice-print-sheet" id="order-punch-sheet">
                <div class="invoice-header-row">
                  <div>
                    <img src="${cs.logoUrl}" alt="Cycle World" style="height:46px;width:auto;margin-bottom:0.4rem;" />
                    <div style="font-weight:800;font-size:1.05rem;">${escapeHtml(cs.companyName)}</div>
                    <div style="font-size:0.79rem;color:var(--text-secondary);">
                      ${escapeHtml(cs.address)}
                    </div>
                    <div style="font-size:0.79rem;font-weight:700;margin-top:0.2rem;" class="mono">
                      GSTIN: ${escapeHtml(cs.gstNumber)} | Phone: ${escapeHtml(cs.phone)}
                    </div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-size:0.75rem;font-weight:800;text-transform:uppercase;color:var(--primary);">
                      ORDER PUNCH / ORDER CONFIRMATION
                    </div>
                    <div class="mono" style="font-size:1.35rem;font-weight:800;margin-top:0.15rem;">
                      Order Number: ${escapeHtml(ord.orderNumber)}
                    </div>
                    <div style="font-size:0.8rem;color:var(--text-secondary);">
                      Order Date: ${formatDateTime(ord.createdAt)}
                    </div>
                    <div style="margin-top:0.3rem;">
                      <span class="status-badge ${getStatusBadgeClass(ord.status)}">
                        Order Status: ${escapeHtml(ord.status)}
                      </span>
                    </div>
                  </div>
                </div>

                <div class="invoice-parties-grid">
                  <div class="invoice-party-box">
                    <div style="font-size:0.72rem;font-weight:800;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.25rem;">
                      Customer / Store Details
                    </div>
                    <div style="font-weight:800;font-size:0.95rem;">
                      Customer / Store Name: ${escapeHtml(ord.storeName)}
                    </div>
                    <div class="mono" style="font-size:0.8rem;margin:0.15rem 0;">
                      Customer ID: <strong>${escapeHtml(ord.customerCode)}</strong> &nbsp;|&nbsp; GSTIN: <strong>${escapeHtml(ord.customerGst || '—')}</strong>
                    </div>
                    <div>Address: ${escapeHtml(ord.billingAddress)}</div>
                    <div>Contact: ${escapeHtml(ord.customerPhone || '—')}</div>
                  </div>

                  <div class="invoice-party-box">
                    <div style="font-size:0.72rem;font-weight:800;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.25rem;">
                      Order Punch Metadata
                    </div>
                    <div><strong>Order Number:</strong> <span class="mono">${escapeHtml(ord.orderNumber)}</span></div>
                    <div><strong>Order Date:</strong> ${formatDateTime(ord.createdAt)}</div>
                    <div><strong>Order Status:</strong> ${escapeHtml(ord.status)}</div>
                    <div><strong>Total Products / Qty:</strong> ${ord.itemCount} SKUs (${ord.totalQuantity} units)</div>
                    ${ord.notes ? `<div style="margin-top:0.25rem;"><strong>Notes:</strong> ${escapeHtml(ord.notes)}</div>` : ''}
                  </div>
                </div>

                <div class="table-responsive" style="margin-bottom:1rem;">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Image</th>
                        <th>Product Category</th>
                        <th>Product Sub-Category</th>
                        <th>Product Name</th>
                        <th>Product Code / SKU</th>
                        <th>Model</th>
                        <th>Size</th>
                        <th>Color / Variant</th>
                        <th>Quantity Ordered</th>
                        <th>Unit Price</th>
                        <th>Total Amount</th>
                        <th>GST / Tax Details</th>
                        <th>Grand Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${ord.items
                        .map((item, idx) => {
                          const vCols = extractOrderItemVariantColumns(item);
                          return `
                            <tr>
                              <td class="mono">${idx + 1}</td>
                              <td style="width:48px;">
                                <img src="${escapeHtml(item.imageUrl || '')}" alt="${escapeHtml(item.productName || 'Product')}" style="display:block;width:40px;height:40px;object-fit:contain;border:1px solid var(--border-color);border-radius:4px;" />
                              </td>
                              <td style="font-size:0.78rem;font-weight:700;">${escapeHtml(item.categoryName || '—')}</td>
                              <td style="font-size:0.78rem;">${escapeHtml(item.subcategoryName || '—')}</td>
                              <td>
                                <div style="font-weight:700;">${escapeHtml(item.productName)}</div>
                                ${renderVariantBadges(item, true)}
                              </td>
                              <td class="mono" style="font-weight:700;">${escapeHtml(item.skuCode)}</td>
                              <td style="font-size:0.78rem;">${escapeHtml(vCols.model)}</td>
                              <td style="font-size:0.78rem;">${escapeHtml(vCols.size)}</td>
                              <td style="font-size:0.78rem;">${escapeHtml(vCols.colorVariant)}</td>
                              <td class="mono" style="font-weight:800;">${item.quantity}</td>
                              <td class="mono">${formatCurrency(item.fpPrice)}</td>
                              <td class="mono">${formatCurrency(item.subtotal)}</td>
                              <td class="mono" style="font-size:0.77rem;">${item.gstPercentage}% (+${formatCurrency(item.gstAmount)})</td>
                              <td class="mono" style="font-weight:800;color:var(--primary-hover);">${formatCurrency(item.totalAmount)}</td>
                            </tr>
                          `;
                        })
                        .join('')}
                    </tbody>
                  </table>
                </div>

                <div style="display:flex;justify-content:flex-end;">
                  <div style="width:100%;max-width:320px;background:var(--bg-subtle);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:0.95rem;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:0.35rem;font-size:0.86rem;">
                      <span>Total Amount (Taxable Subtotal):</span>
                      <strong class="mono">${formatCurrency(ord.subtotalAmount)}</strong>
                    </div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:0.5rem;font-size:0.86rem;">
                      <span>GST / Tax Details:</span>
                      <strong class="mono">+ ${formatCurrency(ord.gstAmount)}</strong>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding-top:0.5rem;border-top:2px solid var(--bg-navy);font-size:1.14rem;font-weight:800;">
                      <span>Grand Total:</span>
                      <span class="mono" style="color:var(--primary-hover);">${formatCurrency(ord.totalAmount)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="modal-footer no-print" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
              <div style="display:flex;gap:0.45rem;flex-wrap:wrap;">
                <button type="button" class="btn btn-soft btn-sm" onclick="CycleWorldApp.generateOrderPdfPreview('${ord.id}')">
                  📄 Generate PDF
                </button>
                <button type="button" class="btn btn-navy btn-sm" onclick="CycleWorldApp.downloadOrderPdf('${ord.id}')">
                  📥 Download PDF
                </button>
                <button type="button" class="btn btn-primary btn-sm" onclick="CycleWorldApp.printOrderDirectly('${ord.id}')">
                  🖨️ Print Order Directly
                </button>
              </div>
              <button type="button" class="btn btn-outline" onclick="CycleWorldApp.closeModal()">Close</button>
            </div>
          </div>
        </div>
      `;
      return;
    }

    if (type === 'NOTIFICATIONS') {
      const notifs = API.getNotifications();
      container.innerHTML = `
        <div class="modal-backdrop" onclick="if(event.target===this)CycleWorldApp.closeModal()">
          <div class="modal-dialog modal-lg">
            <div class="modal-header">
              <h3 class="modal-title">🔔 Super Admin Order Notifications (${notifs.length})</h3>
              <div style="display:flex;gap:0.5rem;">
                <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.markAllNotifsRead()">
                  ✓ Mark All Read
                </button>
                <button type="button" class="btn btn-outline btn-xs" onclick="CycleWorldApp.closeModal()">✕</button>
              </div>
            </div>
            <div class="modal-body">
              ${
                notifs.length === 0
                  ? `<div style="text-align:center;padding:2rem;color:var(--text-muted);">No order notifications yet.</div>`
                  : notifs
                      .map(
                        (n) => `
                  <div style="padding:0.9rem 1rem;border:1px solid ${
                    n.isRead ? 'var(--border-color)' : 'var(--primary)'
                  };background:${
                    n.isRead ? '#ffffff' : 'var(--primary-soft)'
                  };border-radius:var(--radius-sm);margin-bottom:0.65rem;display:flex;justify-content:space-between;align-items:center;gap:1rem;">
                    <div>
                      <div style="font-weight:800;font-size:0.92rem;color:var(--text-main);">
                        ${!n.isRead ? '🟢 ' : ''}${escapeHtml(n.title)}
                      </div>
                      <div style="font-size:0.83rem;color:var(--text-secondary);margin-top:0.2rem;">
                        ${escapeHtml(n.message)}
                      </div>
                      <div style="font-size:0.73rem;color:var(--text-muted);margin-top:0.2rem;">
                        ${formatDateTime(n.createdAt)}
                      </div>
                    </div>
                    ${
                      n.orderId
                        ? `<button type="button" class="btn btn-primary btn-xs" onclick="CycleWorldApp.openOrderFromNotification('${n.id}', '${n.orderId}')">
                            Open Order →
                          </button>`
                        : ''
                    }
                  </div>
                `
                      )
                      .join('')
              }
            </div>
          </div>
        </div>
      `;
      return;
    }
  }

  // ============================================================================
  // EVENT HANDLERS & PUBLIC CONTROLLER METHODS
  // ============================================================================
  const CycleWorldApp = {
    init() {
      API.onChange(() => {
        renderApp();
      });
      renderApp();
    },

    switchLoginPortal(portalMode) {
      state.loginPortalMode = portalMode;
      state.loginError = '';
      renderApp();
    },

    handleLoginSubmit(ev) {
      ev.preventDefault();
      const form = ev.target;
      const identifier = form.identifier.value;
      const password = form.password.value;
      try {
        state.loginError = '';
        const session = API.login({
          identifier,
          password,
          requiredRole: state.loginPortalMode
        });
        showToast(`Welcome, ${session.fullName}!`, 'success');
        renderApp();
      } catch (err) {
        state.loginError = err.message;
        renderApp();
      }
    },

    handleLogout() {
      API.logout();
      state.modal = null;
      state.loginError = '';
      state.expandedCustomerCategoryId = null;
      state.customerCategoryId = 'ALL';
      state.customerSubcategoryId = 'ALL';
      showToast('Logged out.', 'info');
      renderApp();
    },

    setAdminTab(tabId) {
      state.adminTab = tabId;
      renderApp();
    },

    updateAdminProductFilter(type, val) {
      if (type === 'search') state.adminProductSearch = val;
      if (type === 'cat') {
        state.adminProductCatFilter = val;
        state.adminProductSubFilter = 'ALL';
      }
      if (type === 'sub') state.adminProductSubFilter = val;
      if (type === 'status') state.adminProductStatusFilter = val;
      renderApp();
    },

    updateAdminCustomerFilter(type, val) {
      if (type === 'search') state.adminCustomerSearch = val;
      if (type === 'status') state.adminCustomerStatusFilter = val;
      renderApp();
    },

    updateAdminOrderFilter(type, val) {
      if (type === 'search') state.adminOrderSearch = val;
      if (type === 'status') state.adminOrderStatusFilter = val;
      renderApp();
    },

    updateAdminAuditSearch(val) {
      state.adminAuditSearch = val;
      renderApp();
    },

    openProductModal(productId) {
      let product = null;
      if (productId) {
        product = API.getAdminProducts().find((p) => p.id === productId) || null;
      }
      state.modal = { type: 'PRODUCT_FORM', data: { product } };
      renderModal();
    },

    captureDraftProductModalInputs() {
      const form = document.getElementById('product-modal-form');
      if (!form) return {};
      const variantAttributes = {};
      form.querySelectorAll('.variant-group-input').forEach((el) => {
        const gName = el.getAttribute('data-group-name');
        const gVal = el.value ? el.value.trim() : '';
        if (gName && gVal) {
          variantAttributes[gName] = gVal;
        }
      });
      return {
        skuCode: form.skuCode ? form.skuCode.value : '',
        name: form.name ? form.name.value : '',
        mrp: form.mrp ? form.mrp.value : '',
        fpPrice: form.fpPrice ? form.fpPrice.value : '',
        stock: form.stock ? form.stock.value : '',
        gstPercentage: form.gstPercentage ? form.gstPercentage.value : '12',
        status: form.status ? form.status.value : 'Active',
        specifications: form.specifications ? form.specifications.value : '',
        imageUrl: form.imageUrl ? form.imageUrl.value : '',
        variantAttributes
      };
    },

    handleModalProductCatChange(newCatId) {
      if (!state.modal || state.modal.type !== 'PRODUCT_FORM') return;
      state.modal.data.draftProduct = this.captureDraftProductModalInputs();
      state.modal.data.selectedCatId = newCatId;
      state.modal.data.selectedSubId = null;
      renderModal();
    },

    handleModalProductSubChange(newSubId) {
      if (!state.modal || state.modal.type !== 'PRODUCT_FORM') return;
      state.modal.data.draftProduct = this.captureDraftProductModalInputs();
      state.modal.data.selectedSubId = newSubId;
      renderModal();
    },

    liveValidateSkuInput(val, excludeId) {
      const el = document.getElementById('sku-validation-feedback');
      if (!el) return;
      const res = API.checkSkuAvailability(val, excludeId || null);
      el.textContent = res.message;
      el.style.color = res.valid ? 'var(--success)' : 'var(--danger)';
      el.style.fontWeight = '600';
    },

    compressImageFileToDataUrl(file, callback) {
      if (!file) return;
      const reader = new FileReader();
      reader.onerror = function () {
        showToast('Could not read the selected image file.', 'error');
      };
      reader.onload = function (e) {
        const rawDataUrl = e.target.result;
        if (String(file.type).toLowerCase().includes('svg')) {
          callback(rawDataUrl);
          return;
        }
        const img = new Image();
        img.onerror = function () {
          callback(rawDataUrl);
        };
        img.onload = function () {
          try {
            const maxDim = 240;
            let w = img.naturalWidth || img.width || maxDim;
            let h = img.naturalHeight || img.height || maxDim;
            if (w > maxDim || h > maxDim) {
              const ratio = Math.min(maxDim / w, maxDim / h);
              w = Math.max(1, Math.round(w * ratio));
              h = Math.max(1, Math.round(h * ratio));
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            const compressed = canvas.toDataURL('image/jpeg', 0.72);
            callback(compressed && compressed.length < rawDataUrl.length ? compressed : rawDataUrl);
          } catch (_err) {
            callback(rawDataUrl);
          }
        };
        img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
    },

    handleProductImageUpload(ev) {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      this.compressImageFileToDataUrl(file, function (dataUrl) {
        const hidden = document.getElementById('modal-prod-image-url');
        if (hidden) hidden.value = dataUrl;
        const preview = document.getElementById('modal-prod-image-preview');
        if (preview) {
          preview.src = dataUrl;
          preview.style.display = '';
        }
        const statusEl = document.getElementById('modal-prod-image-status');
        if (statusEl) {
          statusEl.textContent = '✅ Custom Photo Attached';
          statusEl.style.color = '#15803d';
        }
        const clearBtn = document.getElementById('modal-prod-image-clear-btn');
        if (clearBtn) {
          clearBtn.style.display = '';
        }
        if (state.modal && state.modal.data) {
          if (!state.modal.data.draftProduct) state.modal.data.draftProduct = {};
          state.modal.data.draftProduct.imageUrl = dataUrl;
          const existingProd = state.modal.data.product;
          if (existingProd && existingProd.id) {
            try {
              const updated = API.updateProductImage(existingProd.id, dataUrl, { silent: true });
              state.modal.data.product = updated;
              const rowImg = document.querySelector(`img[data-row-img-id="${existingProd.id}"]`);
              if (rowImg) {
                rowImg.src = updated.imageUrl;
                rowImg.style.borderColor = '#16a34a';
              }
              showToast(`✅ Product image saved for SKU ${updated.skuCode}!`, 'success');
              return;
            } catch (_e) {}
          }
        }
        showToast('Product image attached and ready to save.', 'success');
      });
    },

    clearModalProductImage() {
      const hidden = document.getElementById('modal-prod-image-url');
      if (hidden) hidden.value = 'REMOVE';
      const fileInput = document.getElementById('modal-prod-image-file');
      if (fileInput) fileInput.value = '';
      const preview = document.getElementById('modal-prod-image-preview');
      if (preview) {
        preview.style.display = 'none';
      }
      const statusEl = document.getElementById('modal-prod-image-status');
      if (statusEl) {
        statusEl.textContent = 'Photo removed (will reset on save)';
        statusEl.style.color = 'var(--text-muted)';
      }
      const clearBtn = document.getElementById('modal-prod-image-clear-btn');
      if (clearBtn) {
        clearBtn.style.display = 'none';
      }
      if (state.modal && state.modal.data) {
        if (!state.modal.data.draftProduct) state.modal.data.draftProduct = {};
        state.modal.data.draftProduct.imageUrl = 'REMOVE';
        const existingProd = state.modal.data.product;
        if (existingProd && existingProd.id) {
          try {
            const updated = API.updateProductImage(existingProd.id, 'REMOVE', { silent: true });
            state.modal.data.product = updated;
            const rowImg = document.querySelector(`img[data-row-img-id="${existingProd.id}"]`);
            if (rowImg) {
              rowImg.src = updated.imageUrl;
              rowImg.style.borderColor = 'var(--border-color)';
            }
          } catch (_e) {}
        }
      }
    },

    triggerRowImageUpload(productId) {
      state.pendingRowImageProductId = productId;
      const input = document.getElementById('direct-row-image-input');
      if (input) {
        input.value = '';
        input.click();
      }
    },

    handleDirectRowImageUpload(ev) {
      const file = ev.target.files && ev.target.files[0];
      const productId = state.pendingRowImageProductId;
      if (!file || !productId) return;
      this.compressImageFileToDataUrl(file, function (dataUrl) {
        try {
          const updated = API.updateProductImage(productId, dataUrl);
          showToast(`Updated product image for SKU ${updated.skuCode} (${updated.name}).`, 'success');
          renderApp();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    },

    handleSaveProductForm(ev) {
      ev.preventDefault();
      const f = ev.target;
      if (!f.categoryId || !f.categoryId.value) {
        showToast('Please select a Product Category.', 'error');
        return;
      }
      if (!f.subcategoryId || !f.subcategoryId.value) {
        showToast('Please create and select a Subcategory first.', 'error');
        return;
      }
      const prodName = (f.name.value || '').trim();
      if (!prodName) {
        showToast('Product Name is required.', 'error');
        return;
      }

      const allowUpdateDup = f.allowUpdateDuplicate && f.allowUpdateDuplicate.value === 'true';

      try {
        const saved = API.saveProduct({
          id: f.id.value || undefined,
          skuCode: f.skuCode ? f.skuCode.value : undefined,
          name: prodName,
          categoryId: f.categoryId.value,
          subcategoryId: f.subcategoryId.value,
          fpPrice: f.fpPrice ? f.fpPrice.value : undefined,
          stock: f.stock.value,
          gstPercentage: f.gstPercentage ? f.gstPercentage.value : 12,
          imageUrl: f.imageUrl ? f.imageUrl.value || undefined : undefined,
          status: f.status.value,
          allowUpdateDuplicate: allowUpdateDup
        });
        state.modal = null;
        showToast(`Saved product "${saved.name}" successfully`, 'success');
        renderApp();
      } catch (err) {
        if (err.code === 'DUPLICATE_PRODUCT' && err.existingProduct) {
          const dup = err.existingProduct;
          const conf = confirm(
            `DUPLICATE PRODUCT WARNING:\n\nA product named "${prodName}" already exists in this Category and Subcategory.\n\nWould you like to UPDATE the existing product instead of creating a duplicate?`
          );
          if (conf) {
            try {
              const updated = API.saveProduct({
                id: dup.id,
                skuCode: dup.skuCode,
                name: prodName,
                categoryId: f.categoryId.value,
                subcategoryId: f.subcategoryId.value,
                fpPrice: f.fpPrice ? f.fpPrice.value : dup.fpPrice,
                stock: f.stock.value,
                gstPercentage: f.gstPercentage ? f.gstPercentage.value : 12,
                imageUrl: f.imageUrl ? f.imageUrl.value || undefined : undefined,
                status: f.status.value,
                allowUpdateDuplicate: true
              });
              state.modal = null;
              showToast(`Updated existing product "${updated.name}"`, 'success');
              renderApp();
              return;
            } catch (innerErr) {
              showToast(innerErr.message, 'error');
              return;
            }
          } else {
            const nameInput = document.getElementById('modal-prod-name');
            if (nameInput) nameInput.focus();
            showToast('Please change the Product Name to avoid duplicates.', 'warning');
            return;
          }
        }
        showToast(err.message, 'error');
      }
    },

    checkDuplicateProductNameLive() {
      const nameInput = document.getElementById('modal-prod-name');
      const catSelect = document.getElementById('modal-prod-cat');
      const subSelect = document.getElementById('modal-prod-sub');
      const warnBox = document.getElementById('duplicate-warning-box');
      const allowUpdateInput = document.getElementById('modal-allow-update-dup');
      if (!nameInput || !catSelect || !subSelect || !warnBox) return;

      const name = nameInput.value.trim();
      const categoryId = catSelect.value;
      const subcategoryId = subSelect.value;
      const idInput = document.querySelector('#product-modal-form input[name="id"]');
      const currentId = idInput ? idInput.value : null;

      if (!name || !categoryId || !subcategoryId) {
        warnBox.style.display = 'none';
        warnBox.innerHTML = '';
        if (allowUpdateInput) allowUpdateInput.value = 'false';
        return;
      }

      const dup = API.checkDuplicateProduct({
        name,
        categoryId,
        subcategoryId,
        excludeProductId: currentId || null
      });

      if (dup) {
        warnBox.style.display = 'block';
        warnBox.style.background = '#fef2f2';
        warnBox.style.borderColor = '#fecaca';
        warnBox.style.borderWidth = '1px';
        warnBox.style.borderStyle = 'solid';
        warnBox.style.borderRadius = '6px';
        warnBox.style.padding = '0.55rem 0.75rem';
        warnBox.style.color = '#991b1b';
        warnBox.style.fontSize = '0.79rem';
        warnBox.innerHTML = `
          <div style="font-weight:700;margin-bottom:0.25rem;">
            ⚠️ Duplicate Product Warning:
          </div>
          <div>
            A product named <strong>"${escapeHtml(dup.name)}"</strong> already exists in this category &amp; subcategory (Current FP Price: ₹${dup.fpPrice}, Quantity: ${dup.stock}, GST: ${dup.gstPercentage}%).
          </div>
          <div style="margin-top:0.4rem;display:flex;gap:0.4rem;flex-wrap:wrap;align-items:center;">
            <button type="button" class="btn btn-navy btn-xs" onclick="CycleWorldApp.applyDuplicateOverwrite('${dup.id}')">
              ✏️ Update Existing Product
            </button>
            <button type="button" class="btn btn-outline btn-xs" onclick="document.getElementById('modal-prod-name').focus()">
              Change Name
            </button>
          </div>
        `;
      } else {
        warnBox.style.display = 'none';
        warnBox.innerHTML = '';
        if (allowUpdateInput) allowUpdateInput.value = 'false';
      }
    },

    applyDuplicateOverwrite(existingProductId) {
      const allowUpdateInput = document.getElementById('modal-allow-update-dup');
      if (allowUpdateInput) allowUpdateInput.value = 'true';
      const idInput = document.querySelector('#product-modal-form input[name="id"]');
      if (idInput) idInput.value = existingProductId;
      const dup = API.getAdminProducts().find((p) => p.id === existingProductId);
      if (dup) {
        const fpInput = document.getElementById('modal-prod-fp-price');
        if (fpInput && (!fpInput.value || fpInput.value === '0')) {
          fpInput.value = dup.fpPrice || '';
        }
      }
      const warnBox = document.getElementById('duplicate-warning-box');
      if (warnBox) {
        warnBox.style.background = '#eff6ff';
        warnBox.style.borderColor = '#bfdbfe';
        warnBox.style.color = '#1e40af';
        warnBox.innerHTML = `✅ <strong>Ready to update:</strong> Submitting will update the existing product record.`;
      }
      showToast('Form set to update existing product on save.', 'info');
    },

    // =========================================================================
    // MULTI-LEVEL SUB-CATEGORY GROUPS, MRP & ITEMS CONTROLLER METHODS
    // =========================================================================
    openSubcategoryGroupsModal(subcategoryId, returnToProductModal = false) {
      let savedProductModalContext = null;
      if (returnToProductModal && state.modal && state.modal.type === 'PRODUCT_FORM') {
        savedProductModalContext = {
          product: state.modal.data.product || null,
          selectedCatId: state.modal.data.selectedCatId,
          selectedSubId: subcategoryId,
          draftProduct: this.captureDraftProductModalInputs()
        };
      }
      state.modal = {
        type: 'SUBCATEGORY_GROUPS_MANAGER',
        data: {
          subcategoryId,
          returnToProductModal: !!returnToProductModal,
          savedProductModalContext
        }
      };
      renderModal();
    },

    returnToProductModalFromGroups(categoryId, subcategoryId) {
      const ctx =
        state.modal && state.modal.data && state.modal.data.savedProductModalContext
          ? state.modal.data.savedProductModalContext
          : null;
      state.modal = {
        type: 'PRODUCT_FORM',
        data: {
          product: ctx ? ctx.product : null,
          selectedCatId: categoryId,
          selectedSubId: subcategoryId,
          draftProduct: ctx ? ctx.draftProduct : {}
        }
      };
      renderModal();
    },

    handleAddSubcategoryGroup(ev, subcategoryId) {
      ev.preventDefault();
      const f = ev.target;
      const groupName = f.groupName ? f.groupName.value.trim() : '';
      const groupMrp = f.groupMrp && f.groupMrp.value !== '' ? f.groupMrp.value : 0;
      if (!groupName) return;
      try {
        const grp = API.saveSubcategoryGroup({
          subcategoryId,
          name: groupName,
          mrp: groupMrp,
          applyMrpToProducts: parseFloat(groupMrp) > 0
        });
        f.reset();
        showToast(
          `Created group "${grp.name}"${grp.mrp > 0 ? ` with MRP ${formatCurrency(grp.mrp)}` : ''}. Now add items/values inside "${grp.name}".`,
          'success'
        );
        renderApp();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    quickAddPresetGroup(subcategoryId, groupName) {
      try {
        const grp = API.saveSubcategoryGroup({
          subcategoryId,
          name: groupName
        });
        showToast(`Added required group "${grp.name}". Add its values or MRP below.`, 'success');
        renderApp();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    handleSeedDefaultSubcategoryGroups(subcategoryId) {
      try {
        const res = API.seedDefaultSubcategoryGroups(subcategoryId);
        if (res.createdGroups.length > 0) {
          showToast(
            `Loaded required default groups: ${res.createdGroups.join(', ')}`,
            'success'
          );
        } else {
          showToast('All 5 required default groups are already active.', 'info');
        }
        renderApp();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    handleSaveSubcategoryGroupMrp(ev, groupId) {
      ev.preventDefault();
      const f = ev.target;
      const mrpVal = f.mrp && f.mrp.value !== '' ? f.mrp.value : 0;
      const applyToProducts = f.applyToProducts ? !!f.applyToProducts.checked : true;
      try {
        const res = API.updateSubcategoryGroupMrp({
          groupId,
          mrp: mrpVal,
          applyToProducts
        });
        showToast(
          `Updated MRP for group "${res.group.name}" to ${formatCurrency(res.mrp)}${
            res.updatedProductsCount > 0
              ? ` (synced to ${res.updatedProductsCount} product(s))`
              : ''
          }.`,
          'success'
        );
        renderApp();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    promptEditSubcategoryGroupMrp(groupId, groupName, currentMrp) {
      const nextMrp = window.prompt(
        `Enter MRP (Maximum Retail Price ₹) for Sub-Category Group "${groupName}":`,
        currentMrp && +currentMrp > 0 ? String(currentMrp) : ''
      );
      if (nextMrp === null) return;
      try {
        const res = API.updateSubcategoryGroupMrp({
          groupId,
          mrp: nextMrp.trim() === '' ? 0 : nextMrp.trim(),
          applyToProducts: true
        });
        showToast(
          `Updated MRP for group "${res.group.name}" to ${formatCurrency(res.mrp)}${
            res.updatedProductsCount > 0
              ? ` (synced to ${res.updatedProductsCount} product(s))`
              : ''
          }.`,
          'success'
        );
        renderApp();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    promptRenameSubcategoryGroup(groupId, currentName) {
      const nextName = window.prompt('Rename Group:', currentName || '');
      if (nextName === null) return;
      const trimmed = nextName.trim();
      if (!trimmed || trimmed === currentName) return;
      try {
        const subId =
          state.modal && state.modal.data ? state.modal.data.subcategoryId : undefined;
        API.saveSubcategoryGroup({
          id: groupId,
          subcategoryId: subId,
          name: trimmed
        });
        showToast(`Renamed group to "${trimmed}"`, 'success');
        renderApp();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    handleDeleteSubcategoryGroup(groupId, groupName) {
      try {
        const res = API.deleteSubcategoryGroup(groupId);
        if (state.customerGroupFilters && res.deletedGroupName) {
          Object.keys(state.customerGroupFilters).forEach((k) => {
            if (k.toLowerCase() === res.deletedGroupName.toLowerCase()) {
              delete state.customerGroupFilters[k];
            }
          });
        }
        showToast(
          `Removed group "${res.deletedGroupName}" (${res.deletedItemsCount} values removed; hidden from category & customer views).`,
          'info'
        );
        renderApp();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    handleReorderSubcategoryGroup(groupId, direction) {
      try {
        API.reorderSubcategoryGroup(groupId, direction);
        renderApp();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    handleAddGroupItems(ev, groupId) {
      ev.preventDefault();
      const f = ev.target;
      const rawValues = f.rawValues ? f.rawValues.value : '';
      if (!rawValues.trim()) return;
      try {
        const res = API.addGroupItems({ groupId, rawValues });
        f.reset();
        showToast(`Added ${res.addedCount} item(s) to "${res.groupName}".`, 'success');
        renderApp();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    promptEditGroupItem(itemId, currentVal) {
      const nextVal = window.prompt('Edit Group Item / Value:', currentVal || '');
      if (nextVal === null) return;
      const trimmed = nextVal.trim();
      if (!trimmed || trimmed === currentVal) return;
      try {
        API.updateGroupItem({ itemId, value: trimmed });
        showToast(`Updated item value to "${trimmed}".`, 'success');
        renderApp();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    handleDeleteGroupItem(itemId) {
      try {
        const res = API.deleteGroupItem(itemId);
        showToast(`Removed value "${res.deletedValue}" from "${res.groupName}".`, 'info');
        renderApp();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    handleReorderGroupItem(itemId, direction) {
      try {
        API.reorderGroupItem(itemId, direction);
        renderApp();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    openQuickStockModal(productId) {
      const product = API.getAdminProducts().find((p) => p.id === productId);
      if (!product) return;
      state.modal = { type: 'QUICK_STOCK', data: { product } };
      renderModal();
    },

    handleQuickStockSubmit(ev) {
      ev.preventDefault();
      const f = ev.target;
      try {
        const updated = API.quickUpdateProductStockAndPrice({
          productId: f.productId.value,
          mrp: f.mrp ? f.mrp.value : undefined,
          fpPrice: f.fpPrice.value,
          stock: f.stock.value,
          gstPercentage: f.gstPercentage.value,
          status: f.status ? f.status.value : undefined,
          imageUrl: f.imageUrl ? f.imageUrl.value || undefined : undefined
        });
        state.modal = null;
        showToast(
          `Updated "${updated.name}": Available Quantity=${updated.stock}, Product Price=₹${updated.fpPrice}, GST=${updated.gstPercentage}%, Status=${updated.adminConfiguredStatus === 'Inactive' ? 'Inactive' : 'Active'}`,
          'success'
        );
        renderApp();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    toggleProductActive(productId) {
      try {
        const res = API.deleteOrDeactivateProduct(productId, 'toggle');
        const label = res.status === 'Inactive' ? 'Disabled (Inactive)' : 'Enabled (Active)';
        showToast(`Product "${res.name}" (${res.skuCode}) is now ${label}`, 'info');
        renderApp();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    toggleCategoryActive(catId) {
      try {
        const cat = API.toggleCategoryStatus(catId);
        const label = cat.status === 'Inactive' ? 'Disabled (Inactive)' : 'Enabled (Active)';
        showToast(`Category "${cat.name}" is now ${label}`, 'info');
        renderApp();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    toggleSubcategoryActive(subId) {
      try {
        const sub = API.toggleSubcategoryStatus(subId);
        const label = sub.status === 'Inactive' ? 'Disabled (Inactive)' : 'Enabled (Active)';
        showToast(`Subcategory "${sub.name}" is now ${label}`, 'info');
        renderApp();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    toggleCustomerActive(custId) {
      try {
        const cust = API.toggleCustomerStatus(custId);
        const label = cust.status === 'Inactive' ? 'Disabled (Inactive)' : 'Enabled (Active)';
        showToast(`Customer "${cust.storeName}" (${cust.customerCode}) is now ${label}`, 'info');
        renderApp();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    toggleEmployeeActive(empId) {
      try {
        const emp = API.toggleEmployeeStatus(empId);
        const label = emp.status === 'Inactive' ? 'Disabled (Inactive)' : 'Enabled (Active)';
        showToast(`Employee "${emp.fullName}" (${emp.employeeCode}) is now ${label}`, 'info');
        renderApp();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    confirmDeleteEntity(entityType, entityId) {
      let title = 'Delete Record';
      let summary = 'Are you sure you want to delete this item?';
      let warningNote = 'This action will permanently remove the selected record.';

      if (entityType === 'PRODUCT') {
        const p = API.getAdminProducts().find((x) => x.id === entityId);
        if (!p) return;
        title = `Delete Product — ${p.skuCode}`;
        summary = `Delete "${p.name}" (SKU: ${p.skuCode})?`;
        warningNote = `This will permanently delete product "${p.name}", its SKU code (${p.skuCode}), live stock, and FP price from the Product Master.`;
      } else if (entityType === 'CATEGORY') {
        const cat = API.getCategoriesTree({ activeOnly: false }).find((c) => c.id === entityId);
        if (!cat) return;
        title = `Delete Category — ${cat.name}`;
        summary = `Delete Category "${cat.name}"?`;
        warningNote = `This will delete Category "${cat.name}", along with its ${cat.subcategories.length} subcategory(s) and ${cat.productCount} associated product(s). (Tip: Use "Disable" if you only want to hide it temporarily.)`;
      } else if (entityType === 'SUBCATEGORY') {
        const cats = API.getCategoriesTree({ activeOnly: false });
        let sub = null;
        for (const c of cats) {
          const found = c.subcategories.find((s) => s.id === entityId);
          if (found) {
            sub = found;
            break;
          }
        }
        if (!sub) return;
        title = `Delete Subcategory — ${sub.name}`;
        summary = `Delete Subcategory "${sub.name}"?`;
        warningNote = `This will delete Subcategory "${sub.name}" and its ${sub.productCount} associated product(s). (Tip: Use "Disable" if you only want to hide it temporarily.)`;
      } else if (entityType === 'CUSTOMER') {
        const c = API.getCustomersList().find((x) => x.id === entityId);
        if (!c) return;
        title = `Delete Customer — ${c.customerCode}`;
        summary = `Delete Store Account "${c.storeName}" (Login ID: ${c.customerCode})?`;
        warningNote = `This will permanently remove login credentials for "${c.storeName}" (${c.customerCode}).`;
      } else if (entityType === 'EMPLOYEE') {
        const e = API.getEmployeesList().find((x) => x.id === entityId);
        if (!e) return;
        title = `Delete Employee — ${e.employeeCode}`;
        summary = `Delete Billing Employee "${e.fullName}" (Login ID: ${e.employeeCode})?`;
        warningNote = `This will permanently remove login credentials for employee "${e.fullName}" (${e.employeeCode}).`;
      }

      state.modal = {
        type: 'CONFIRM_DELETE',
        data: { entityType, entityId, title, summary, warningNote }
      };
      renderModal();
    },

    executeConfirmedDelete(entityType, entityId) {
      try {
        if (entityType === 'PRODUCT') {
          const res = API.deleteOrDeactivateProduct(entityId, 'delete');
          showToast(res.message, 'success');
        } else if (entityType === 'CATEGORY') {
          const res = API.deleteCategory(entityId);
          showToast(
            `Deleted category "${res.deletedCategoryName}" (${res.deletedSubcategories} subcategories, ${res.deletedProducts} products removed).`,
            'success'
          );
        } else if (entityType === 'SUBCATEGORY') {
          const res = API.deleteSubcategory(entityId);
          showToast(
            `Deleted subcategory "${res.deletedSubcategoryName}" (${res.deletedProducts} products removed).`,
            'success'
          );
        } else if (entityType === 'CUSTOMER') {
          const res = API.deleteCustomerAccount(entityId);
          showToast(
            `Deleted customer account "${res.storeName}" (Login ID: ${res.customerCode}).`,
            'success'
          );
        } else if (entityType === 'EMPLOYEE') {
          const res = API.deleteEmployeeAccount(entityId);
          showToast(
            `Deleted employee account "${res.fullName}" (Login ID: ${res.employeeCode}).`,
            'success'
          );
        }
        state.modal = null;
        renderApp();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    // Excel / CSV Bulk Import Handlers
    async handleFileUploadChange(ev) {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      try {
        const parsedRows = await FileImporter.parseUploadedProductFile(file);
        state.importFileName = file.name;
        state.rawParsedImportRows = parsedRows;
        state.importDuplicateMode = state.importDuplicateMode || 'UPDATE';
        state.importValidationResult = API.validateBulkImportRows(parsedRows, {
          duplicateHandling: state.importDuplicateMode
        });
        state.importConfirmNewSkus = (state.importValidationResult.newProductsToAdd || []).length > 0;
        showToast(`Validated ${parsedRows.length} rows from "${file.name}". Review summary preview below.`, 'info');
        renderApp();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    setImportDuplicateMode(mode) {
      state.importDuplicateMode = mode;
      if (state.rawParsedImportRows && state.rawParsedImportRows.length > 0) {
        state.importValidationResult = API.validateBulkImportRows(state.rawParsedImportRows, {
          duplicateHandling: mode
        });
        showToast(`Switched duplicate handling to: ${mode === 'SKIP' ? 'Skip Duplicates' : 'Update Existing Products'}`, 'info');
      }
      renderApp();
    },

    downloadImportErrorReport() {
      const val = state.importValidationResult;
      if (!val) {
        showToast('No import preview data available.', 'warning');
        return;
      }
      const list = [
        ...(val.skippedDuplicates || []),
        ...(val.failedRecords || val.invalidRows || [])
      ];
      if (list.length === 0) {
        showToast('No skipped duplicates or failed records to download.', 'info');
        return;
      }
      const baseName = state.importFileName ? state.importFileName.replace(/\.[^/.]+$/, '') : 'Product_Import';
      FileImporter.downloadErrorReportCsv(list, `${baseName}_Errors_and_Skipped.csv`);
    },

    toggleConfirmNewSkus(checked) {
      state.importConfirmNewSkus = !!checked;
      renderApp();
    },

    clearImportPreview() {
      state.importFileName = '';
      state.rawParsedImportRows = null;
      state.importValidationResult = null;
      renderApp();
    },

    confirmApplyBulkImport() {
      try {
        const res = API.applyValidatedImport({
          validationResult: state.importValidationResult,
          confirmCreateNewSkus: state.importConfirmNewSkus,
          createNewProducts: state.importConfirmNewSkus
        });
        state.importValidationResult = null;
        state.importFileName = '';
        state.rawParsedImportRows = null;
        showToast(
          `Import Complete: ${res.updatedCount} products updated, ${res.createdCount} new products created, ${res.skippedCount} skipped duplicates.`,
          'success'
        );
        renderApp();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

        openCategoryModal(catId) {
      const cats = API.getCategoriesTree({ activeOnly: false });
      const category = catId ? cats.find((c) => c.id === catId) : null;
      state.modal = { type: 'CATEGORY_FORM', data: { category } };
      renderModal();
    },

    handleSaveCategoryForm(ev) {
      ev.preventDefault();
      const f = ev.target;
      try {
        const saved = API.saveCategory({
          id: f.id.value || undefined,
          name: f.name.value,
          description: f.description.value,
          status: f.status.value
        });
        state.modal = null;
        showToast(`Saved category "${saved.name}"`, 'success');
        renderApp();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    openSubcategoryModal(subId, defaultCategoryId = null) {
      const cats = API.getCategoriesTree({ activeOnly: false });
      let subcategory = null;
      if (subId) {
        for (const c of cats) {
          const found = c.subcategories.find((s) => s.id === subId);
          if (found) {
            subcategory = found;
            break;
          }
        }
      }
      state.modal = {
        type: 'SUBCATEGORY_FORM',
        data: { subcategory, defaultCategoryId }
      };
      renderModal();
    },

    handleSaveSubcategoryForm(ev) {
      ev.preventDefault();
      const f = ev.target;
      try {
        const saved = API.saveSubcategory({
          id: f.id.value || undefined,
          categoryId: f.categoryId.value,
          name: f.name.value,
          description: f.description.value,
          status: f.status.value,
          seedDefaultGroups: f.seedDefaultGroups ? !!f.seedDefaultGroups.checked : undefined
        });
        state.modal = null;
        showToast(`Saved subcategory "${saved.name}"`, 'success');
        renderApp();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    openCustomerModal(custId) {
      const customer = custId
        ? API.getCustomersList().find((c) => c.id === custId)
        : null;
      state.modal = { type: 'CUSTOMER_FORM', data: { customer } };
      renderModal();
    },

    handleSaveCustomerForm(ev) {
      ev.preventDefault();
      const f = ev.target;
      try {
        const saved = API.saveCustomerAccount({
          id: f.id.value || undefined,
          storeName: f.storeName.value,
          customerCode: f.customerCode.value,
          email: f.email.value,
          password: f.password.value,
          phone: f.phone.value,
          gstNumber: f.gstNumber.value,
          address: f.address.value,
          status: f.status.value
        });
        state.modal = null;
        showToast(`Saved customer account: Login ID "${saved.customerCode}"`, 'success');
        renderApp();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    openEmployeeModal(empId) {
      const employee = empId
        ? API.getEmployeesList().find((e) => e.id === empId)
        : null;
      state.modal = { type: 'EMPLOYEE_FORM', data: { employee } };
      renderModal();
    },

    handleSaveEmployeeForm(ev) {
      ev.preventDefault();
      const f = ev.target;
      try {
        const saved = API.saveEmployeeAccount({
          id: f.id.value || undefined,
          employeeCode: f.employeeCode.value,
          fullName: f.fullName.value,
          email: f.email.value,
          password: f.password.value,
          phone: f.phone.value,
          designation: f.designation.value,
          status: f.status.value
        });
        state.modal = null;
        showToast(`Saved billing employee ${saved.employeeCode}`, 'success');
        renderApp();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    handleOrderStatusChange(orderId, newStatus) {
      try {
        const ord = API.updateOrderStatus({ orderId, newStatus });
        showToast(`Order ${ord.orderNumber} status updated to "${newStatus}"`, 'success');
        renderApp();
      } catch (err) {
        showToast(err.message, 'error');
        renderApp();
      }
    },

    openOrderDetailModal(orderId) {
      state.modal = { type: 'ORDER_DETAIL', data: { orderId } };
      renderModal();
    },

    // =========================================================================
    // ORDER PUNCH – PDF GENERATION, DOWNLOAD & DIRECT PRINT METHODS
    // =========================================================================
    focusOrderPunchSheet() {
      const el = document.getElementById('order-punch-sheet');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        showToast('Viewing complete Order Punch sheet.', 'info');
      }
    },

    async generateOrderPdfPreview(orderId) {
      try {
        const ord = API.getOrderDetails(orderId);
        const blob = await generateOrderPdfBlob(ord);
        if (state.modal && state.modal.data && state.modal.data.pdfPreviewUrl) {
          URL.revokeObjectURL(state.modal.data.pdfPreviewUrl);
        }
        const pdfUrl = URL.createObjectURL(blob);
        state.modal = {
          type: 'ORDER_DETAIL',
          data: {
            orderId: ord.id,
            pdfPreviewUrl: pdfUrl,
            justSubmitted:
              state.modal && state.modal.data ? !!state.modal.data.justSubmitted : false
          }
        };
        renderModal();
        showToast(`Generated Order PDF for ${ord.orderNumber}`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    closeOrderPdfPreview() {
      if (!state.modal || state.modal.type !== 'ORDER_DETAIL') return;
      if (state.modal.data.pdfPreviewUrl) {
        URL.revokeObjectURL(state.modal.data.pdfPreviewUrl);
        delete state.modal.data.pdfPreviewUrl;
      }
      renderModal();
    },

    async downloadOrderPdf(orderId) {
      try {
        const ord = API.getOrderDetails(orderId);
        const blob = await generateOrderPdfBlob(ord);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${ord.orderNumber}_${ord.customerCode}_Order_Punch.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        showToast(`Downloaded Order PDF: ${ord.orderNumber}`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    printOrderDirectly(orderId) {
      try {
        const ord = API.getOrderDetails(orderId);
        const html = buildPrintableOrderHtml(ord);
        let printFrame = document.getElementById('cw-direct-print-frame');
        if (printFrame) {
          printFrame.remove();
        }
        printFrame = document.createElement('iframe');
        printFrame.id = 'cw-direct-print-frame';
        printFrame.style.position = 'fixed';
        printFrame.style.right = '0';
        printFrame.style.bottom = '0';
        printFrame.style.width = '0';
        printFrame.style.height = '0';
        printFrame.style.border = '0';
        document.body.appendChild(printFrame);

        const doc = printFrame.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();

        const imageLoads = Array.from(doc.images).map((image) =>
          image.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                image.onload = resolve;
                image.onerror = resolve;
              })
        );
        Promise.all(imageLoads).then(() => {
          try {
            printFrame.contentWindow.focus();
            printFrame.contentWindow.print();
          } catch (e) {
            window.print();
          }
        });
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    openNotificationsModal() {
      state.modal = { type: 'NOTIFICATIONS', data: {} };
      renderModal();
    },

    openOrderFromNotification(notifId, orderId) {
      API.markNotificationRead(notifId);
      state.modal = { type: 'ORDER_DETAIL', data: { orderId } };
      renderApp();
    },

    markAllNotifsRead() {
      API.markNotificationRead('ALL');
      renderApp();
    },

    downloadSingleOrderCsv(orderId) {
      try {
        const ord = API.getOrderDetails(orderId);
        const rows = [
          ['Order Number', ord.orderNumber],
          ['Order Date', ord.createdAt],
          ['Customer / Store Name', ord.storeName],
          ['Customer ID', ord.customerCode],
          ['Customer GST', ord.customerGst],
          ['Address', ord.billingAddress],
          ['Order Status', ord.status],
          [],
          [
            'Product Category',
            'Product Sub-Category',
            'Product Name',
            'Product Code / SKU',
            'Model',
            'Size',
            'Color / Variant',
            'Quantity Ordered',
            'Unit Price',
            'Total Amount',
            'GST %',
            'GST Amount',
            'Grand Total'
          ]
        ];
        ord.items.forEach((it) => {
          const vCols = extractOrderItemVariantColumns(it);
          rows.push([
            `"${String(it.categoryName || '')}"`,
            `"${String(it.subcategoryName || '')}"`,
            `"${String(it.productName).replace(/"/g, '""')}"`,
            it.skuCode,
            `"${String(vCols.model).replace(/"/g, '""')}"`,
            `"${String(vCols.size).replace(/"/g, '""')}"`,
            `"${String(vCols.colorVariant).replace(/"/g, '""')}"`,
            it.quantity,
            it.fpPrice.toFixed(2),
            it.subtotal.toFixed(2),
            it.gstPercentage,
            it.gstAmount.toFixed(2),
            it.totalAmount.toFixed(2)
          ]);
        });
        rows.push([]);
        rows.push([
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          'Totals:',
          ord.subtotalAmount.toFixed(2),
          '',
          ord.gstAmount.toFixed(2),
          ord.totalAmount.toFixed(2)
        ]);

        const csv = rows.map((r) => r.join(',')).join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${ord.orderNumber}_${ord.customerCode}_OrderDetails.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    exportAllOrdersCsv() {
      try {
        const orders = API.getOrders();
        const rows = [
          [
            'Order Number',
            'Order Date',
            'Customer ID',
            'Customer / Store Name',
            'Customer GST',
            'No of SKUs',
            'Total Units',
            'Total Amount (Taxable)',
            'GST Amount',
            'Grand Total',
            'Order Status'
          ]
        ];
        orders.forEach((o) => {
          rows.push([
            o.orderNumber,
            o.createdAt,
            o.customerCode,
            `"${String(o.storeName).replace(/"/g, '""')}"`,
            o.customerGst || '',
            o.itemCount,
            o.totalQuantity,
            o.subtotalAmount.toFixed(2),
            o.gstAmount.toFixed(2),
            o.totalAmount.toFixed(2),
            o.status
          ]);
        });
        const csv = rows.map((r) => r.join(',')).join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `CycleWorld_B2B_Orders_Register.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    handleLogoUpload(ev) {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          API.updateCompanySettings({ logoUrl: e.target.result });
          showToast('Updated Cycle World company logo!', 'success');
          renderApp();
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
      reader.readAsDataURL(file);
    },

    handleResetDefaultLogo() {
      API.resetDefaultLogo();
      showToast('Restored official Cycle World vector logo.', 'info');
      renderApp();
    },

    handleSaveCompanySettings(ev) {
      ev.preventDefault();
      const f = ev.target;
      try {
        API.updateCompanySettings({
          companyName: f.companyName.value,
          tagline: f.tagline.value,
          gstNumber: f.gstNumber.value,
          phone: f.phone.value,
          email: f.email.value,
          website: f.website.value,
          address: f.address.value,
          city: f.city.value,
          state: f.state.value,
          pincode: f.pincode.value,
          bankDetails: f.bankDetails.value,
          orderTerms: f.orderTerms.value
        });
        showToast('Company & GST settings saved.', 'success');
        renderApp();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    handleChangePassword(ev) {
      ev.preventDefault();
      const f = ev.target;
      if (f.newPassword.value !== f.confirmPassword.value) {
        showToast('New password and confirmation do not match.', 'error');
        return;
      }
      try {
        API.changeOwnPassword({
          currentPassword: f.currentPassword.value,
          newPassword: f.newPassword.value
        });
        f.reset();
        showToast('Password updated securely!', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    downloadDatabaseBackup() {
      const json = API.exportFullDatabaseJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'CycleWorld_B2B_Database_Backup.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    setBillingTab(tab) {
      state.billingTab = tab;
      renderApp();
    },

    updateBillingFilter(type, val) {
      if (type === 'search') state.billingOrderSearch = val;
      if (type === 'status') state.billingOrderStatusFilter = val;
      renderApp();
    },

    setCustomerTab(tab) {
      state.customerTab = tab;
      renderApp();
    },

    selectCustomerCategory(catId, subId) {
      state.customerGroupFilters = {};
      if (catId === 'ALL') {
        state.expandedCustomerCategoryId = null;
        state.customerCategoryId = 'ALL';
        state.customerSubcategoryId = 'ALL';
      } else {
        state.expandedCustomerCategoryId = catId;
        state.customerCategoryId = catId;
        state.customerSubcategoryId = subId || 'ALL';
      }
      renderApp();
    },

    toggleCustomerCategoryExpand(catId) {
      state.customerGroupFilters = {};
      if (state.expandedCustomerCategoryId === catId) {
        state.expandedCustomerCategoryId = null;
        if (state.customerCategoryId === catId) {
          state.customerCategoryId = 'ALL';
          state.customerSubcategoryId = 'ALL';
        }
      } else {
        // Only the category selected by the customer expands; all others stay collapsed
        state.expandedCustomerCategoryId = catId;
      }
      renderApp();
    },

    selectCustomerSubcategory(catId, subId) {
      state.customerGroupFilters = {};
      state.expandedCustomerCategoryId = catId;
      state.customerCategoryId = catId;
      state.customerSubcategoryId = subId;
      renderApp();
    },

    setCustomerGroupFilter(groupName, value) {
      if (!state.customerGroupFilters) state.customerGroupFilters = {};
      if (!value || value === 'ALL') {
        delete state.customerGroupFilters[groupName];
      } else {
        state.customerGroupFilters[groupName] = value;
      }
      renderApp();
    },

    clearCustomerGroupFilters() {
      state.customerGroupFilters = {};
      renderApp();
    },

    updateCustomerSearch(val) {
      state.customerSearch = val;
      renderApp();
    },

    updateCustomerSort(val) {
      state.customerSortBy = val;
      renderApp();
    },

    stepCardQty(productId, delta) {
      const inputEl = document.getElementById(`card-qty-${productId}`);
      const current = parseInt(inputEl ? inputEl.value : state.cardQuantities[productId] || 1, 10) || 1;
      const target = Math.max(1, current + delta);
      const check = API.validateCustomerQuantity(productId, target);
      state.cardQuantities[productId] = check.approvedQty;
      if (!check.allowed && check.reason) {
        showToast(check.reason, 'warning');
      }
      if (inputEl) inputEl.value = check.approvedQty;
    },

    setCardQtyInput(productId, rawVal) {
      const target = Math.max(1, parseInt(rawVal, 10) || 1);
      const check = API.validateCustomerQuantity(productId, target);
      state.cardQuantities[productId] = check.approvedQty;
      if (!check.allowed && check.reason) {
        showToast(check.reason, 'warning');
      }
      const inputEl = document.getElementById(`card-qty-${productId}`);
      if (inputEl) inputEl.value = check.approvedQty;
    },

    addToCartFromCard(productId) {
      loadCustomerCart();
      const inputEl = document.getElementById(`card-qty-${productId}`);
      const requested = parseInt(inputEl ? inputEl.value : state.cardQuantities[productId] || 1, 10) || 1;

      const check = API.validateCustomerQuantity(productId, requested);
      if (!check.allowed && check.approvedQty === 0) {
        showToast(check.reason || 'Product unavailable', 'error');
        renderApp();
        return;
      }

      if (!check.allowed && check.reason) {
        showToast(check.reason, 'warning');
      }

      const finalQty = check.approvedQty;
      state.cardQuantities[productId] = finalQty;

      const existing = state.cart.find((c) => c.productId === productId);
      if (existing) {
        existing.quantity = finalQty;
      } else {
        state.cart.push({ productId, quantity: finalQty });
      }
      saveCustomerCart();
      showToast(`Added to cart (${finalQty} units)`, 'success');
      renderApp();
    },

    updateCartItemQty(productId, newQty) {
      loadCustomerCart();
      const parsed = parseInt(newQty, 10);
      if (parsed <= 0) {
        this.removeCartItem(productId);
        return;
      }
      const check = API.validateCustomerQuantity(productId, parsed);
      if (!check.allowed && check.reason) {
        showToast(check.reason, 'warning');
      }
      const item = state.cart.find((c) => c.productId === productId);
      if (item) {
        item.quantity = check.approvedQty;
        saveCustomerCart();
        renderApp();
      }
    },

    removeCartItem(productId) {
      loadCustomerCart();
      state.cart = state.cart.filter((c) => c.productId !== productId);
      saveCustomerCart();
      showToast('Removed product from cart.', 'info');
      renderApp();
    },

    clearCart() {
      state.cart = [];
      saveCustomerCart();
      renderApp();
    },

    updateOrderNotes(val) {
      state.orderNotes = val;
    },

    openOrderConfirmationModal() {
      loadCustomerCart();
      if (state.cart.length === 0) {
        showToast('Your cart is empty.', 'warning');
        return;
      }
      state.modal = { type: 'ORDER_CONFIRM_SUMMARY', data: {} };
      renderModal();
    },

    confirmAndSubmitOrderNow() {
      try {
        loadCustomerCart();
        const submittedOrder = API.submitCustomerOrder({
          items: state.cart,
          notes: state.orderNotes
        });
        state.cart = [];
        state.cardQuantities = {};
        state.orderNotes = '';
        saveCustomerCart();
        state.customerTab = 'orders';
        state.modal = {
          type: 'ORDER_DETAIL',
          data: { orderId: submittedOrder.id, justSubmitted: true }
        };
        showToast(
          `Order Punch ${submittedOrder.orderNumber} created! View, Download PDF, or Print Order Directly.`,
          'success'
        );
        renderApp();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },

    configureLanServer() {
      const current = localStorage.getItem('TCW_LAN_SERVER_URL') || 'http://192.168.1.7:8080';
      const entered = window.prompt(
        'Enter your Cycle World B2B LAN Server URL (e.g. http://192.168.1.7:8080):',
        current
      );
      if (entered && entered.trim()) {
        const clean = entered.trim().replace(/\/+$/, '');
        localStorage.setItem('TCW_LAN_SERVER_URL', clean);
        showToast(`Connecting & syncing with LAN Server (${clean})...`, 'info');
        fetch(`${clean}/api/db?t=${Date.now()}`, { cache: 'no-store' })
          .then((res) => {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.text();
          })
          .then((text) => {
            const parsed = JSON.parse(text);
            if (parsed && Array.isArray(parsed.products)) {
              localStorage.setItem('TCW_ENTERPRISE_RELATIONAL_DB_V2', text);
              showToast(`Synced ${parsed.products.length} products from LAN Server!`, 'success');
              window.location.reload();
            }
          })
          .catch(() => {
            showToast(`Saved LAN URL (${clean}). Using embedded offline database until LAN is reachable.`, 'warning');
          });
      }
    },

    closeModal() {
      if (state.modal && state.modal.data && state.modal.data.pdfPreviewUrl) {
        URL.revokeObjectURL(state.modal.data.pdfPreviewUrl);
      }
      state.modal = null;
      renderModal();
    }
  };

  global.CycleWorldApp = CycleWorldApp;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        CycleWorldApp.init();
      });
    } else {
      CycleWorldApp.init();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
