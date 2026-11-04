/**
 * ============================================================================
 * CYCLE WORLD (TCW B2B) - EXCEL (.XLSX / .XLS / .CSV) & PDF PRODUCT IMPORTER
 * ============================================================================
 * Supports:
 *  - Excel (.xlsx via native ZIP/XML DecompressionStream or SheetJS, .xls, .csv)
 *  - Structured PDF (.pdf product catalog table/text extraction)
 *  - Header normalization & column mapping:
 *    Category, Subcategory, SKU Code, Product Name, Product Image / Image Reference,
 *    FP Price, Live Stock, GST, Product Status
 *  - Download Demo Excel Template (for format reference only — never auto-adds to DB)
 * ============================================================================
 */

(function (global) {
  'use strict';

  const CORE_HEADER_MAP = {
    sku: 'skuCode',
    productcategory: 'categoryName',
    category: 'categoryName',
    categoryname: 'categoryName',
    maincategory: 'categoryName',
    selectedcategory: 'categoryName',
    productsubcategory: 'subcategoryName',
    subcategory: 'subcategoryName',
    subcategoryname: 'subcategoryName',
    subcat: 'subcategoryName',
    selectedsubcategory: 'subcategoryName',
    productname: 'productName',
    name: 'productName',
    itemname: 'productName',
    description: 'productName',
    title: 'productName',
    product: 'productName',
    availablequantity: 'franchiseQuantity',
    availableqty: 'franchiseQuantity',
    availablestock: 'franchiseQuantity',
    franchisequantity: 'franchiseQuantity',
    franchiseqty: 'franchiseQuantity',
    franchisestock: 'franchiseQuantity',
    stock: 'stock',
    livestock: 'stock',
    stockavailability: 'stock',
    qty: 'stock',
    quantity: 'stock',
    inventory: 'stock',
    gst: 'gst',
    gstpercentage: 'gst',
    gstrate: 'gst',
    tax: 'gst',
    taxrate: 'gst',
    productstatusactiveorinactive: 'status',
    productstatusactiveinactive: 'status',
    productstatus: 'status',
    status: 'status',
    active: 'status',
    state: 'status',
    skucode: 'skuCode',
    itemcode: 'skuCode',
    partno: 'skuCode',
    partnumber: 'skuCode',
    productcode: 'skuCode',
    productcodesku: 'skuCode',
    mrp: 'mrp',
    mrpprice: 'mrp',
    maximumretailprice: 'mrp',
    maxretailprice: 'mrp',
    retailprice: 'mrp',
    productprice: 'fpPrice',
    fpprice: 'fpPrice',
    fp: 'fpPrice',
    price: 'fpPrice',
    wholesaleprice: 'fpPrice',
    rate: 'fpPrice',
    unitprice: 'fpPrice',
    subcategorygroup: 'subcategoryGroupName',
    subgroup: 'subcategoryGroupName',
    subgroupname: 'subcategoryGroupName',
    productgroup: 'subcategoryGroupName',
    image: 'imageUrl',
    imageurl: 'imageUrl',
    productimage: 'imageUrl',
    imagereference: 'imageUrl',
    productimageimagereference: 'imageUrl',
    photo: 'imageUrl',
    hsn: 'hsnCode',
    hsncode: 'hsnCode',
    sac: 'hsnCode',
    packsize: 'packSize',
    pack: 'packSize',
    uom: 'packSize',
    unit: 'packSize',
    specifications: 'specifications',
    specification: 'specifications',
    technicalspecifications: 'specifications',
    specs: 'specifications',
    spec: 'specifications'
  };

  // Default / standard Sub-Category Groups
  const STANDARD_VARIANT_GROUP_NAMES = {
    size: 'Size',
    wheel: 'Size',
    wheelsize: 'Size',
    model: 'Model',
    modelname: 'Model',
    color: 'Color',
    colour: 'Color',
    type: 'Type',
    bicycletype: 'Type',
    brandseries: 'Brand / Series',
    brand: 'Brand / Series',
    series: 'Brand / Series',
    frametype: 'Frame Type',
    framematerial: 'Frame Type',
    wheeltype: 'Wheel Type',
    geartype: 'Gear Type',
    speed: 'Gear Type',
    agegroup: 'Age Group',
    braketype: 'Brake Type',
    suspension: 'Suspension'
  };

  function classifyHeaderColumn(rawHeader) {
    const cleanRaw = String(rawHeader || '').trim();
    const normalized = cleanRaw.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (!normalized) {
      return { type: 'ignore', key: '' };
    }

    if (CORE_HEADER_MAP[normalized]) {
      return { type: 'core', key: CORE_HEADER_MAP[normalized] };
    }

    const groupDisplayName = STANDARD_VARIANT_GROUP_NAMES[normalized] || cleanRaw;
    return { type: 'variant', groupName: groupDisplayName };
  }

  function cleanNumericValue(val) {
    if (val === undefined || val === null) return '';
    return String(val)
      .replace(/[₹$,%\s]/g, '')
      .trim();
  }

  function buildRowObjectFromCells(headerDefs, cells, rowNumber) {
    const obj = { _rowNumber: rowNumber, variantAttributes: {} };
    headerDefs.forEach((def, colIdx) => {
      const val = cells[colIdx] !== undefined ? String(cells[colIdx]).trim() : '';
      if (!def || def.type === 'ignore') return;

      if (def.type === 'core') {
        if (['mrp', 'fpPrice', 'stock', 'franchiseQuantity', 'gst'].includes(def.key)) {
          obj[def.key] = cleanNumericValue(val);
        } else {
          obj[def.key] = val;
        }
      } else if (def.type === 'variant' && def.groupName && val !== '') {
        obj.variantAttributes[def.groupName] = val;
      }
    });
    return obj;
  }

  function parseDelimitedText(text) {
    const lines = String(text || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .filter((line) => line.trim().length > 0);

    if (lines.length < 2) {
      throw new Error('Uploaded file must contain a header row and at least one product data row.');
    }

    const firstLine = lines[0];
    let delimiter = ',';
    if (firstLine.split('\t').length > firstLine.split(',').length) delimiter = '\t';
    else if (firstLine.split(';').length > firstLine.split(',').length) delimiter = ';';
    else if (firstLine.split('|').length > firstLine.split(',').length) delimiter = '|';

    function splitRow(rowStr) {
      const cells = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < rowStr.length; i++) {
        const ch = rowStr[i];
        if (ch === '"') {
          if (inQuotes && rowStr[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === delimiter && !inQuotes) {
          cells.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
      cells.push(current.trim());
      return cells;
    }

    const rawHeaders = splitRow(lines[0]);
    const headerDefs = rawHeaders.map(classifyHeaderColumn);

    const parsedRows = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = splitRow(lines[i]);
      if (cells.every((c) => !c)) continue;
      parsedRows.push(buildRowObjectFromCells(headerDefs, cells, i + 1));
    }
    return parsedRows;
  }

  async function parseXlsxBinaryNative(arrayBuffer) {
    if (global.XLSX && typeof global.XLSX.read === 'function') {
      const wb = global.XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const csvText = global.XLSX.utils.sheet_to_csv(firstSheet);
      return parseDelimitedText(csvText);
    }

    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);

    async function extractZipEntries(bufBytes) {
      const entries = {};
      let offset = 0;
      while (offset + 30 < bufBytes.length) {
        const sig = view.getUint32(offset, true);
        if (sig !== 0x04034b50) break;
        const compression = view.getUint16(offset + 8, true);
        const compressedSize = view.getUint32(offset + 18, true);
        const fileNameLen = view.getUint16(offset + 26, true);
        const extraLen = view.getUint16(offset + 28, true);
        const fileName = new TextDecoder().decode(
          bufBytes.subarray(offset + 30, offset + 30 + fileNameLen)
        );
        const dataStart = offset + 30 + fileNameLen + extraLen;
        const compressedSlice = bufBytes.subarray(dataStart, dataStart + compressedSize);

        if (
          fileName === 'xl/sharedStrings.xml' ||
          fileName === 'xl/worksheets/sheet1.xml'
        ) {
          if (compression === 0) {
            entries[fileName] = new TextDecoder().decode(compressedSlice);
          } else if (compression === 8 && typeof DecompressionStream !== 'undefined') {
            const ds = new DecompressionStream('deflate-raw');
            const writer = ds.writable.getWriter();
            writer.write(compressedSlice);
            writer.close();
            const outBuf = await new Response(ds.readable).arrayBuffer();
            entries[fileName] = new TextDecoder().decode(outBuf);
          }
        }
        offset = dataStart + compressedSize;
      }
      return entries;
    }

    const xmlFiles = await extractZipEntries(bytes);
    const sheetXml = xmlFiles['xl/worksheets/sheet1.xml'];
    if (!sheetXml) {
      throw new Error(
        'Could not read worksheet XML from .xlsx file. You can also save the spreadsheet as CSV or .xls.'
      );
    }

    const parser = new DOMParser();
    const sharedStrings = [];
    if (xmlFiles['xl/sharedStrings.xml']) {
      const ssDoc = parser.parseFromString(xmlFiles['xl/sharedStrings.xml'], 'application/xml');
      const siNodes = ssDoc.getElementsByTagName('si');
      for (let i = 0; i < siNodes.length; i++) {
        sharedStrings.push(siNodes[i].textContent || '');
      }
    }

    const sheetDoc = parser.parseFromString(sheetXml, 'application/xml');
    const rowNodes = sheetDoc.getElementsByTagName('row');
    const matrix = [];

    function colLettersToIndex(cellRef) {
      const match = String(cellRef || '').match(/^[A-Z]+/);
      if (!match) return 0;
      const letters = match[0];
      let col = 0;
      for (let i = 0; i < letters.length; i++) {
        col = col * 26 + (letters.charCodeAt(i) - 64);
      }
      return col - 1;
    }

    for (let r = 0; r < rowNodes.length; r++) {
      const cNodes = rowNodes[r].getElementsByTagName('c');
      const rowValues = [];
      for (let c = 0; c < cNodes.length; c++) {
        const cell = cNodes[c];
        const ref = cell.getAttribute('r') || '';
        const colIdx = colLettersToIndex(ref);
        const type = cell.getAttribute('t');
        const vNode = cell.getElementsByTagName('v')[0];
        const isNode = cell.getElementsByTagName('is')[0];
        let val = '';
        if (type === 's' && vNode) {
          val = sharedStrings[parseInt(vNode.textContent, 10)] || '';
        } else if (type === 'inlineStr' && isNode) {
          val = isNode.textContent || '';
        } else if (vNode) {
          val = vNode.textContent || '';
        }
        rowValues[colIdx] = String(val).trim();
      }
      matrix.push(rowValues);
    }

    if (matrix.length < 2) {
      throw new Error('The Excel worksheet has no product rows.');
    }

    const headerDefs = (matrix[0] || []).map(classifyHeaderColumn);
    const parsedRows = [];
    for (let i = 1; i < matrix.length; i++) {
      const cells = matrix[i] || [];
      if (cells.every((c) => !c)) continue;
      parsedRows.push(buildRowObjectFromCells(headerDefs, cells, i + 1));
    }
    return parsedRows;
  }

  async function parsePdfBinary(arrayBuffer) {
    const rawText = new TextDecoder('latin1').decode(new Uint8Array(arrayBuffer));
    const extractedLines = [];

    const tjRegex = /\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*Tj/g;
    let match;
    while ((match = tjRegex.exec(rawText)) !== null) {
      const line = match[1]
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .trim();
      if (line) extractedLines.push(line);
    }

    const joinedText = extractedLines.join('\n');
    const pipeLines = joinedText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.includes('|') && l.split('|').length >= 5);

    if (pipeLines.length >= 2) {
      return parseDelimitedText(pipeLines.join('\n'));
    }

    const kvRows = [];
    let currentObj = null;
    const allCandidateLines =
      extractedLines.length > 0 ? extractedLines : rawText.split(/\r?\n/);

    allCandidateLines.forEach((line) => {
      const skuMatch = line.match(/^SKU(?:\s*Code)?\s*[:=-]\s*(.+)$/i);
      if (skuMatch) {
        if (currentObj && currentObj.skuCode) kvRows.push(currentObj);
        currentObj = {
          _rowNumber: kvRows.length + 2,
          skuCode: skuMatch[1].trim(),
          variantAttributes: {}
        };
        return;
      }
      if (!currentObj) return;
      const nameMatch = line.match(/^(?:Product\s*Name|Name)\s*[:=-]\s*(.+)$/i);
      if (nameMatch) currentObj.productName = nameMatch[1].trim();
      const catMatch = line.match(/^Category\s*[:=-]\s*(.+)$/i);
      if (catMatch) currentObj.categoryName = catMatch[1].trim();
      const subMatch = line.match(/^Sub(?:-|\s*)?category\s*[:=-]\s*(.+)$/i);
      if (subMatch) currentObj.subcategoryName = subMatch[1].trim();
      const mrpMatch = line.match(/^MRP\s*[:=-]\s*(.+)$/i);
      if (mrpMatch) currentObj.mrp = cleanNumericValue(mrpMatch[1]);
      const fpMatch = line.match(/^(?:FP\s*Price|Price|FP)\s*[:=-]\s*(.+)$/i);
      if (fpMatch) currentObj.fpPrice = cleanNumericValue(fpMatch[1]);
      const stkMatch = line.match(/^(?:Live\s*Stock|Stock|Qty)\s*[:=-]\s*(.+)$/i);
      if (stkMatch) currentObj.stock = cleanNumericValue(stkMatch[1]);
      const gstMatch = line.match(/^GST\s*[:=-]\s*(.+)$/i);
      if (gstMatch) currentObj.gst = cleanNumericValue(gstMatch[1]);
      const statusMatch = line.match(/^(?:Product\s*Status|Status)\s*[:=-]\s*(.+)$/i);
      if (statusMatch) currentObj.status = statusMatch[1].trim();
    });
    if (currentObj && currentObj.skuCode) {
      kvRows.push(currentObj);
    }

    if (kvRows.length > 0) {
      return kvRows;
    }

    throw new Error(
      'Could not locate structured SKU product rows in this PDF. Please ensure the PDF contains structured SKU/Price/Stock table rows or use the Common Excel Template.'
    );
  }

  async function parseUploadedProductFile(file) {
    if (!file) throw new Error('Please select an Excel (.xlsx, .xls, .csv) or PDF (.pdf) file.');
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.csv') || fileName.endsWith('.tsv') || fileName.endsWith('.txt')) {
      const text = await file.text();
      return parseDelimitedText(text);
    }

    if (fileName.endsWith('.xls')) {
      const text = await file.text();
      if (text.includes('<table') || text.includes('<TR') || text.includes('<tr')) {
        const doc = new DOMParser().parseFromString(text, 'text/html');
        const targetTable =
          doc.querySelector('table[data-sheet="products"]') || doc.querySelector('table');
        const trs = targetTable ? Array.from(targetTable.querySelectorAll('tr')) : [];
        const csvLines = trs.map((tr) =>
          Array.from(tr.querySelectorAll('th,td'))
            .map((td) => `"${(td.textContent || '').trim().replace(/"/g, '""')}"`)
            .join(',')
        );
        return parseDelimitedText(csvLines.join('\n'));
      }
      return parseDelimitedText(text);
    }

    if (fileName.endsWith('.xlsx')) {
      const buf = await file.arrayBuffer();
      return parseXlsxBinaryNative(buf);
    }

    if (fileName.endsWith('.pdf')) {
      const buf = await file.arrayBuffer();
      return parsePdfBinary(buf);
    }

    throw new Error('Unsupported file format. Please upload .xlsx, .xls, .csv, or .pdf.');
  }

  // ==========================================================================
  // CORE STANDARDIZED PRODUCT UPLOAD EXCEL FORMAT (7 FIELDS)
  // Fields:
  // 1. Product Category
  // 2. Product Subcategory
  // 3. Product Name
  // 4. Available Quantity
  // 5. Product Price
  // 6. GST
  // 7. Product Status – Active or Inactive
  // ==========================================================================
  const COMMON_TEMPLATE_HEADERS = [
    'Product Category',
    'Product Subcategory',
    'Product Name',
    'Available Quantity',
    'Product Price',
    'GST',
    'Product Status – Active or Inactive'
  ];

  const COMMON_TEMPLATE_SAMPLE_ROWS = [
    [
      'Bicycle',
      'Kids',
      'Cycle World Champ 12T Kids Bicycle (Red)',
      '25',
      '3499',
      '12',
      'Active'
    ],
    [
      'Bicycle',
      'Kids',
      'Cycle World Champ 16T Kids Bicycle (Blue)',
      '30',
      '3999',
      '12',
      'Active'
    ],
    [
      'Bicycle',
      'Junior',
      'Cycle World Velocity 24T Junior Geared Bicycle (Black)',
      '15',
      '6499',
      '12',
      'Active'
    ],
    [
      'Bicycle Accessories',
      'BELL',
      'Premium Brass Dome Cycle Bell',
      '50',
      '149',
      '18',
      'Active'
    ],
    [
      'Bicycle Accessories',
      'HELMET',
      'Cycle World AeroPro Cycling Helmet (Matte Black)',
      '35',
      '899',
      '18',
      'Active'
    ],
    [
      'TRI CYCLES',
      'Kids',
      'Cycle World JoyRide Deluxe Kids Tricycle (Pink)',
      '20',
      '1899',
      '12',
      'Active'
    ],
    [
      'EV-Accessories',
      'CHARGER',
      'Cycle World 36V 2A Smart Lithium Battery Charger',
      '10',
      '1299',
      '18',
      'Active'
    ]
  ];

  function triggerFileDownload(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function downloadCommonProductExcelTemplate(format = 'xls') {
    const fmt = String(format || 'xls').toLowerCase();
    if (fmt === 'csv') {
      const csvLines = [
        COMMON_TEMPLATE_HEADERS.map((h) => `"${h.replace(/"/g, '""')}"`).join(','),
        ...COMMON_TEMPLATE_SAMPLE_ROWS.map((row) =>
          row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        )
      ];
      triggerFileDownload(
        csvLines.join('\r\n'),
        'CycleWorld_Common_Product_Upload_Template.csv',
        'text/csv;charset=utf-8;'
      );
      return;
    }

    const escapeXml = (str) =>
      String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const headerCellsHtml = COMMON_TEMPLATE_HEADERS.map(
      (h) =>
        `<th style="background-color:#15803d;color:#ffffff;font-weight:bold;border:1px solid #166534;padding:8px 10px;text-align:left;white-space:nowrap;">${escapeXml(
          h
        )}</th>`
    ).join('');

    const bodyRowsHtml = COMMON_TEMPLATE_SAMPLE_ROWS.map(
      (row) =>
        `<tr>${row
          .map(
            (cell) =>
              `<td style="border:1px solid #cbd5e1;padding:6px 10px;vertical-align:middle;">${escapeXml(
                cell
              )}</td>`
          )
          .join('')}</tr>`
    ).join('\n');

    const xlsHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8">
  <!--[if gte mso 9]>
  <xml>
    <x:ExcelWorkbook>
      <x:ExcelWorksheets>
        <x:ExcelWorksheet>
          <x:Name>Common_Product_Upload</x:Name>
          <x:WorksheetOptions>
            <x:DisplayGridlines/>
          </x:WorksheetOptions>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets>
    </x:ExcelWorkbook>
  </xml>
  <![endif]-->
</head>
<body>
  <table data-sheet="products" border="1" cellspacing="0" cellpadding="4">
    <thead>
      <tr>${headerCellsHtml}</tr>
    </thead>
    <tbody>
      ${bodyRowsHtml}
    </tbody>
  </table>
</body>
</html>`;

    triggerFileDownload(
      xlsHtml,
      'CycleWorld_Common_Product_Upload_Template.xls',
      'application/vnd.ms-excel;charset=utf-8;'
    );
  }

  // Requirement 7: Allow users to download an error report containing rows that were skipped or failed
  function downloadErrorReportCsv(errorItems, filename = 'CycleWorld_Import_Errors_and_Skipped.csv') {
    const list = Array.isArray(errorItems) ? errorItems : [];
    if (list.length === 0) {
      alert('No skipped duplicates or failed records to download.');
      return;
    }
    const headers = [
      'Row Number',
      'Product Category',
      'Product Subcategory',
      'Product Name',
      'Available Quantity',
      'Product Price',
      'GST',
      'Product Status',
      'Result Status',
      'Reason'
    ];
    const lines = [
      headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(','),
      ...list.map((it) =>
        [
          it.rowNumber || '',
          it.categoryName || '',
          it.subcategoryName || '',
          it.productName || '',
          it.franchiseQuantity ?? it.stock ?? it.newStock ?? '',
          it.fpPrice !== undefined ? it.fpPrice : (it.newFpPrice ?? ''),
          it.gstPercentage !== undefined ? `${it.gstPercentage}%` : (it.gst || it.newGst || ''),
          it.productStatus || it.status || '',
          it.resultStatus || it.type || '',
          it.reason || ''
        ]
          .map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`)
          .join(',')
      )
    ];
    triggerFileDownload(lines.join('\r\n'), filename, 'text/csv;charset=utf-8;');
  }

  // Requirement 5: Download Demo Excel Template showing the required common columns
  // Contains example rows ONLY for format understanding — does NOT add anything to the live database.
  function downloadDemoExcelTemplate(format = 'xls') {
    downloadCommonProductExcelTemplate(format);
  }

  global.CycleWorldFileImporter = {
    parseUploadedProductFile,
    downloadCommonProductExcelTemplate,
    downloadBicycleExcelTemplate: downloadCommonProductExcelTemplate,
    downloadDemoExcelTemplate,
    downloadSampleCsvTemplate: () => downloadCommonProductExcelTemplate('csv'),
    downloadErrorReportCsv,
    COMMON_TEMPLATE_HEADERS,
    COMMON_TEMPLATE_SAMPLE_ROWS,
    BICYCLE_TEMPLATE_HEADERS: COMMON_TEMPLATE_HEADERS,
    BICYCLE_TEMPLATE_SAMPLE_ROWS: COMMON_TEMPLATE_SAMPLE_ROWS
  };
})(typeof window !== 'undefined' ? window : globalThis);
