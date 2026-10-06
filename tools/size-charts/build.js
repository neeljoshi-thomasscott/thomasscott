#!/usr/bin/env node
/*
 * Size chart generator
 * --------------------
 * The website never reads the Excel. This script copies the Excel's numbers into
 * snippets/size-chart-data.liquid, which is committed and synced to Shopify like any theme file.
 *
 * Sources:
 *   1. tools/size-charts/size-chart.xlsx — the brand's size charts (source of truth for every chart it contains)
 *   2. tools/size-charts/legacy-charts.json — charts not yet in the Excel, kept as they were on the site
 *
 * Usage (from the repo root):
 *   node tools/size-charts/build.js                 rebuild from size-chart.xlsx and list what changed
 *   node tools/size-charts/build.js --dry-run       only list what would change, write nothing
 *   node tools/size-charts/build.js other.xlsx      rebuild from another file
 *   node tools/size-charts/build.js export [out]    write the charts currently on the site to an Excel
 *                                                   (recovery copy; re-importable with this script)
 *
 * Never edit snippets/size-chart-data.liquid by hand — update the Excel and re-run this script.
 * Which product gets which chart is decided in snippets/size-chart-key.liquid.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'snippets', 'size-chart-data.liquid');
const LEGACY = path.join(__dirname, 'legacy-charts.json');
const DEFAULT_XLSX = path.join(__dirname, 'size-chart.xlsx');
const DEFAULT_EXPORT = path.join(__dirname, 'size-chart-export.xlsx');

/* Every block in the Excel must be listed here, so a renamed or new block fails loudly instead of vanishing. */
const EXCEL_CHARTS = [
  { article: 'Shirts', fit: 'Regular Fit', key: 'shirts-regular', title: 'Regular Fit Shirts' },
  { article: 'Plus Size Shirts', fit: 'Regular Fit', key: 'shirts-plus', title: 'Plus Size Shirts' },
  { article: 'Shirts', fit: 'Oversize Fit', key: 'shirts-oversized', title: 'Oversized Fit Shirts' },
  { article: 'T-Shirts', fit: 'Regular Fit', key: 'tshirts-regular', title: 'Regular Fit T-Shirts' },
  { article: 'Jeans', fit: 'Baggy', key: 'jeans-baggy', title: 'Baggy Fit Jeans' },
  { article: 'Jeans', fit: 'Slim', key: 'jeans-slim', title: 'Slim Fit Jeans' },
  { article: 'Jeans', fit: 'Carrot', key: 'jeans-carrot', title: 'Carrot Fit Jeans' },
  { article: 'Jeans', fit: 'Straight Fit', key: 'jeans-straight', title: 'Straight Fit Jeans' },
  { article: 'Jeans', fit: 'Loose Boot Cut', key: 'jeans-bootcut', title: 'Loose Boot Cut Jeans' },
  { article: 'Jeans', fit: 'Skinny', key: 'jeans-skinny', title: 'Skinny Fit Jeans' },
  { article: 'Trousers', fit: 'Regular Fit', key: 'trousers-regular', title: 'Regular Fit Trousers' },
  { article: 'Plus Size Trousers', fit: 'Slim Fit / Regular Fit', key: 'trousers-plus', title: 'Plus Size Trousers' },
  { article: 'Jackets', fit: 'Regular Fit', key: 'jackets', title: 'Jackets' },
  { article: 'Sweatshirts', fit: 'Regular Fit', key: 'sweatshirts', title: 'Sweatshirts' },
];
const blockId = (article, fit) => `${article}|${fit}`.toLowerCase().replace(/\s+/g, ' ').trim();
const EXCEL_BY_ID = Object.fromEntries(EXCEL_CHARTS.map((c) => [blockId(c.article, c.fit), c]));

/*
 * Charts that continue into another chart's sizes. Sizes the first chart already has are not repeated,
 * and each product only sees the sizes it sells.
 * Team, Oct 2026: plus size starts at 3XL, so a Regular Fit shirt's 3XL+ is "Plus Size Shirts / Regular Fit".
 */
const APPEND_ROWS = { 'shirts-regular': 'shirts-plus' };

/* Measurement diagram shown under the table, by chart key prefix. */
const IMAGES = {
  'shirts-': 'https://cdn.shopify.com/s/files/1/0821/2738/8922/files/20241202115216.webp?v=1777016886',
  'tshirts-': 'https://cdn.shopify.com/s/files/1/0821/2738/8922/files/tshirts.webp?v=1780912483',
  'jeans-': 'https://cdn.shopify.com/s/files/1/0821/2738/8922/files/20241202121452.webp?v=1778846263',
  'trousers-': 'https://cdn.shopify.com/s/files/1/0821/2738/8922/files/20241202121452.webp?v=1778846263',
  'trackpants-': 'https://cdn.shopify.com/s/files/1/0821/2738/8922/files/20241202121452.webp?v=1778846263',
};

/* Leading columns that hold the size label(s) a product's Size option is matched against. */
const SIZE_COLUMNS = ['Standard', 'Size'];

/* Delimiters used in the generated snippet; values must never contain them. */
const SEP = { part: '^', row: '~', cell: '|' };

/* Sheets whose name starts with this are ignored on import (used by export for website-only charts). */
const SKIP_SHEET_PREFIX = '_';

/* ---------- xlsx reading (an .xlsx is a zip of XML files) ---------- */

function unzip(buffer) {
  const files = {};
  let eocd = buffer.length - 22;
  while (eocd >= 0 && buffer.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('Not a valid .xlsx file');
  const count = buffer.readUInt16LE(eocd + 10);
  let ptr = buffer.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = buffer.readUInt16LE(ptr + 10);
    const size = buffer.readUInt32LE(ptr + 20);
    const nameLen = buffer.readUInt16LE(ptr + 28);
    const extraLen = buffer.readUInt16LE(ptr + 30);
    const commentLen = buffer.readUInt16LE(ptr + 32);
    const local = buffer.readUInt32LE(ptr + 42);
    const name = buffer.toString('utf8', ptr + 46, ptr + 46 + nameLen);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(start, start + size);
    files[name] = (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const decode = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function readWorkbook(file) {
  const files = unzip(fs.readFileSync(file));
  const shared = (files['xl/sharedStrings.xml'] || '').match(/<si>[\s\S]*?<\/si>/g) || [];
  const strings = shared.map((si) => decode((si.match(/<t[^>]*>[\s\S]*?<\/t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join('')));
  const rels = files['xl/_rels/workbook.xml.rels'];
  const sheets = [];
  for (const [, name, rid] of files['xl/workbook.xml'].matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const target = rels.match(new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`))[1].replace(/^\/?(xl\/)?/, '');
    const xml = files[`xl/${target}`];
    const rows = {};
    for (const cell of xml.match(/<c [^>]*?(\/>|>[\s\S]*?<\/c>)/g) || []) {
      const [, col, row] = cell.match(/r="([A-Z]+)(\d+)"/);
      const type = (cell.match(/ t="(\w+)"/) || [])[1];
      let value = (cell.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      if (value === undefined) value = ((cell.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1]);
      if (value === undefined) continue;
      value = type === 's' ? strings[+value] : decode(value);
      value = String(value).replace(/\s+/g, ' ').trim();
      if (value === '') continue;
      (rows[+row] = rows[+row] || {})[col] = value;
    }
    sheets.push({ name: decode(name), rows });
  }
  return sheets;
}

/* ---------- normalising ---------- */

const colIndex = (col) => [...col].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const colLetter = (n) => (n > 26 ? colLetter(Math.floor((n - 1) / 26)) : '') + String.fromCharCode(65 + ((n - 1) % 26));

function formatValue(v) {
  if (/^-?\d+(\.\d+)?(E-?\d+)?$/i.test(v)) return String(parseFloat(Number(v).toFixed(3)));
  return v;
}

function columnName(raw) {
  const name = raw.replace(/["”]/g, '').replace(/\(\s*inches\s*\)/i, '').replace(/\bin\b\s*$/i, '').trim();
  const pretty = name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return `${pretty} (IN)`;
}

/* Vertical blocks: a header row containing "Sizes", rows below it, Article/Fit in merged cells on the left. */
function verticalBlocks(sheet) {
  const blocks = [];
  const rowNums = Object.keys(sheet.rows).map(Number).sort((a, b) => a - b);
  for (const r of rowNums) {
    const header = sheet.rows[r];
    // Column A holds the row labels in horizontal blocks ("SIZE", "WAIST"…), so a vertical "Sizes" header is never there.
    const sizesCol = Object.keys(header).find((c) => c !== 'A' && /^sizes?$/i.test(header[c]));
    if (!sizesCol) continue;
    const measureCols = Object.keys(header).filter((c) => colIndex(c) > colIndex(sizesCol)).sort((a, b) => colIndex(a) - colIndex(b));
    const data = [];
    for (let n = r + 1; sheet.rows[n] && sheet.rows[n][sizesCol] && !/^sizes?$/i.test(sheet.rows[n][sizesCol]); n++) data.push(sheet.rows[n]);
    const first = data[0] || {};
    const label = (col) => (header[col] && !/^(article|fit)$/i.test(header[col]) ? header[col] : first[col]);
    // A numeric column between "Sizes" and the measurements has no header: letter size + number size.
    const allCols = Object.keys(Object.assign({}, ...data)).filter((c) => colIndex(c) > colIndex(sizesCol));
    const standardCol = allCols.find((c) => !header[c] && colIndex(c) === colIndex(sizesCol) + 1);
    const columns = standardCol ? ['Standard', 'Size'] : ['Size'];
    const valueCols = measureCols.filter((c) => c !== standardCol);
    columns.push(...valueCols.map((c) => columnName(header[c])));
    const rows = data.map((d) => [d[sizesCol], ...(standardCol ? [d[standardCol]] : []), ...valueCols.map((c) => d[c])]);
    blocks.push({ sheet: sheet.name, row: r, article: label('A'), fit: label('B'), columns, rows });
  }
  return blocks;
}

/* Horizontal blocks (Jeans sheet): "FIT | name" row, then one row per measurement with sizes across. */
function horizontalBlocks(sheet) {
  const blocks = [];
  const rowNums = Object.keys(sheet.rows).map(Number).sort((a, b) => a - b);
  for (const r of rowNums) {
    if (!/^fit$/i.test(sheet.rows[r].A || '')) continue;
    const lines = [];
    for (let n = r + 1; sheet.rows[n] && sheet.rows[n].A && !/^fit$/i.test(sheet.rows[n].A); n++) lines.push(sheet.rows[n]);
    const sizeLine = lines.find((l) => /^size$/i.test(l.A));
    const cols = Object.keys(sizeLine).filter((c) => c !== 'A').sort((a, b) => colIndex(a) - colIndex(b));
    const measures = lines.filter((l) => l !== sizeLine);
    const columns = ['Size', ...measures.map((l) => columnName(l.A))];
    const rows = cols.map((c) => [sizeLine[c], ...measures.map((l) => l[c])]);
    blocks.push({ sheet: sheet.name, row: r, article: sheet.name, fit: sheet.rows[r].B, columns, rows });
  }
  return blocks;
}

/* ---------- generated snippet: read / write ---------- */

function readSnippet() {
  const charts = {};
  if (!fs.existsSync(OUT)) return charts;
  const text = fs.readFileSync(OUT, 'utf8');
  for (const m of text.matchAll(/{%- when '([^']+)' -%}\s*{%- comment -%}\s*(.*?)\s*{%- endcomment -%}\s*(.*)/g)) {
    const [title, columns, rows] = m[3].trim().split(SEP.part);
    charts[m[1]] = {
      title,
      columns: columns.split(SEP.cell),
      rows: rows.split(SEP.row).map((r) => r.split(SEP.cell)),
      source: m[2],
    };
  }
  return charts;
}

function writeSnippet(charts) {
  const keys = Object.keys(charts).sort();
  const lines = [
    '{%- comment -%}',
    '  GENERATED FILE — do not edit by hand.',
    '  Source: tools/size-charts/size-chart.xlsx + tools/size-charts/legacy-charts.json',
    '  Rebuild: node tools/size-charts/build.js',
    '',
    '  Outputs one chart as: title ^ columns ^ rows ^ size column count ^ image',
    '  (columns/cells separated by |, rows by ~). Unknown chart → nothing.',
    '{%- endcomment -%}',
    '{%- case chart -%}',
  ];
  for (const key of keys) {
    const c = charts[key];
    const image = Object.entries(IMAGES).find(([prefix]) => key.startsWith(prefix));
    const sizeCols = c.columns.filter((col, i) => i < 2 && SIZE_COLUMNS.includes(col)).length || 1;
    const payload = [
      c.title,
      c.columns.join(SEP.cell),
      c.rows.map((r) => r.join(SEP.cell)).join(SEP.row),
      sizeCols,
      image ? image[1] : '',
    ].join(SEP.part);
    lines.push(`  {%- when '${key}' -%}`, `    {%- comment -%} ${c.source} {%- endcomment -%}`, `    ${payload}`);
  }
  lines.push('{%- endcase -%}', '');
  fs.writeFileSync(OUT, lines.join('\n'));
}

/* ---------- change report ---------- */

function describeChanges(before, after) {
  const changes = [];
  const label = (key) => (after[key] || before[key]).title;
  for (const key of Object.keys(before)) if (!after[key]) changes.push(`REMOVED chart "${label(key)}" (${key})`);
  for (const key of Object.keys(after)) {
    const a = after[key];
    const b = before[key];
    if (!b) {
      changes.push(`NEW chart "${a.title}" (${key}), ${a.rows.length} sizes`);
      continue;
    }
    if (a.title !== b.title) changes.push(`${label(key)}: title "${b.title}" → "${a.title}"`);
    if (a.columns.join('|') !== b.columns.join('|')) changes.push(`${label(key)}: columns [${b.columns.join(', ')}] → [${a.columns.join(', ')}]`);
    const rowKey = (row) => row[0];
    const beforeRows = Object.fromEntries(b.rows.map((r) => [rowKey(r), r]));
    const afterRows = Object.fromEntries(a.rows.map((r) => [rowKey(r), r]));
    for (const size of Object.keys(beforeRows)) if (!afterRows[size]) changes.push(`${label(key)}: size ${size} removed`);
    for (const [size, row] of Object.entries(afterRows)) {
      const old = beforeRows[size];
      if (!old) {
        changes.push(`${label(key)}: size ${size} added`);
        continue;
      }
      if (a.columns.join('|') !== b.columns.join('|')) continue;
      row.forEach((value, i) => {
        if (value !== old[i]) changes.push(`${label(key)}, ${size}: ${a.columns[i]} ${old[i]} → ${value}`);
      });
    }
  }
  return changes;
}

/* ---------- build ---------- */

function chartsFromExcel(xlsxPath, problems) {
  const charts = {};
  for (const sheet of readWorkbook(xlsxPath)) {
    if (sheet.name.startsWith(SKIP_SHEET_PREFIX)) continue;
    for (const block of [...verticalBlocks(sheet), ...horizontalBlocks(sheet)]) {
      const target = EXCEL_BY_ID[blockId(block.article, block.fit)];
      if (!target) {
        problems.push(`Unmapped Excel block "${block.article} / ${block.fit}" (sheet ${block.sheet}, row ${block.row}). Add it to EXCEL_CHARTS.`);
        continue;
      }
      if (charts[target.key]) problems.push(`"${target.title}" appears twice in the Excel (sheet ${block.sheet}, row ${block.row}).`);
      block.rows.forEach((row, i) => {
        if (row.length !== block.columns.length || row.some((v) => v === undefined))
          problems.push(`"${target.title}" row ${i + 1} has missing cells: ${JSON.stringify(row)}`);
      });
      charts[target.key] = {
        title: target.title,
        columns: block.columns,
        rows: block.rows.map((row) => row.map((v) => formatValue(String(v)))),
        source: `${path.basename(xlsxPath)} › ${block.sheet}`,
      };
    }
  }
  const missing = EXCEL_CHARTS.filter((t) => !charts[t.key]).map((t) => t.title);
  if (missing.length) problems.push(`Excel charts expected but not found: ${missing.join(', ')}`);
  return charts;
}

function build(xlsxPath, dryRun) {
  if (!fs.existsSync(xlsxPath)) {
    console.error(`Excel not found: ${xlsxPath}\nThe website is unaffected. To recreate it: node tools/size-charts/build.js export`);
    process.exit(1);
  }
  const problems = [];
  const charts = { ...JSON.parse(fs.readFileSync(LEGACY, 'utf8')), ...chartsFromExcel(xlsxPath, problems) };

  for (const [key, extraKey] of Object.entries(APPEND_ROWS)) {
    const chart = charts[key];
    const extra = charts[extraKey];
    if (!chart || !extra) continue;
    if (chart.columns.join('|') !== extra.columns.join('|')) {
      problems.push(`Cannot continue "${chart.title}" with "${extra.title}": columns differ ([${chart.columns.join(', ')}] vs [${extra.columns.join(', ')}]).`);
      continue;
    }
    const have = new Set(chart.rows.map((r) => r[0]));
    charts[key] = { ...chart, rows: [...chart.rows, ...extra.rows.filter((r) => !have.has(r[0]))], source: `${chart.source} + ${extra.title}` };
  }

  for (const [key, chart] of Object.entries(charts)) {
    const text = [chart.title, ...chart.columns, ...chart.rows.flat()].join('');
    if (Object.values(SEP).some((d) => text.includes(d))) problems.push(`Chart "${key}" contains a reserved character (${Object.values(SEP).join(' ')})`);
  }
  if (problems.length) {
    console.error('Size charts NOT generated:\n- ' + problems.join('\n- '));
    process.exit(1);
  }

  const changes = describeChanges(readSnippet(), charts);
  console.log(`Source: ${path.relative(ROOT, xlsxPath)}`);
  if (!changes.length) {
    console.log('No measurement changes — the website already shows these charts.');
  } else {
    console.log(`${changes.length} change(s) compared with what the website shows now:`);
    for (const change of changes) console.log(`  • ${change}`);
  }
  if (dryRun) {
    console.log('\nDry run — nothing written.');
    return;
  }
  writeSnippet(charts);
  console.log(`\nWrote ${path.relative(ROOT, OUT)} (${Object.keys(charts).length} charts). Check the Dev preview before copying to Main.`);
}

/* ---------- export (recovery copy of what the site shows) ---------- */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function zip(files) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content, 'utf8');
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(data.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(nameBuf.length, 26);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(offset, 42);
    local.push(head, nameBuf, data);
    central.push(dir, nameBuf);
    offset += head.length + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBuf, end]);
}

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function sheetXml(rows) {
  const body = rows
    .map((cells, r) => {
      const xmlCells = cells
        .map((v, c) => {
          if (v === '' || v === undefined) return '';
          const ref = `${colLetter(c + 1)}${r + 1}`;
          return /^-?\d+(\.\d+)?$/.test(v) ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${xml(v)}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${xmlCells}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

/* One vertical block per chart, in the same layout build() reads: Article | Fit | Sizes | (number size) | measurements. */
function chartRows(chart, article, fit) {
  const hasStandard = chart.columns[0] === 'Standard';
  const measures = chart.columns.slice(hasStandard ? 2 : 1).map((c) => c.replace(/\s*\(IN\)$/, ' ( Inches )'));
  const rows = [['Article', 'Fit', 'Sizes', ...(hasStandard ? [''] : []), ...measures]];
  chart.rows.forEach((row, i) => rows.push([i === 0 ? article : '', i === 0 ? fit : '', ...row]));
  rows.push([]);
  return rows;
}

function exportWorkbook(outPath) {
  const charts = readSnippet();
  if (!Object.keys(charts).length) {
    console.error(`No charts found in ${path.relative(ROOT, OUT)}`);
    process.exit(1);
  }
  const sheets = {};
  const add = (sheet, rows) => (sheets[sheet] = (sheets[sheet] || []).concat(rows));
  // Undo APPEND_ROWS so each block matches the Excel and re-importing doesn't duplicate rows.
  for (const [key, extraKey] of Object.entries(APPEND_ROWS)) {
    if (!charts[key] || !charts[extraKey]) continue;
    const appended = new Set(charts[extraKey].rows.map((r) => r[0]));
    charts[key] = { ...charts[key], rows: charts[key].rows.filter((r) => !appended.has(r[0])), source: charts[key].source.split(' + ')[0] };
  }
  for (const [key, chart] of Object.entries(charts)) {
    const target = EXCEL_CHARTS.find((t) => t.key === key);
    if (target) add(chart.source.split('›').pop().trim() || 'Size charts', chartRows(chart, target.article, target.fit));
    else add(`${SKIP_SHEET_PREFIX}Website only`, chartRows(chart, chart.title, key));
  }
  const names = Object.keys(sheets).sort((a, b) => a.startsWith(SKIP_SHEET_PREFIX) - b.startsWith(SKIP_SHEET_PREFIX));
  const files = {
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
      '</Types>',
    '_rels/.rels':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      names.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
      '</sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      '</Relationships>',
  };
  names.forEach((n, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(sheets[n])));
  fs.writeFileSync(outPath, zip(files));
  console.log(`Wrote ${path.relative(ROOT, outPath)} — ${Object.keys(charts).length} charts as shown on the website.`);
  console.log(`Sheets: ${names.join(', ')}`);
  console.log(`"${SKIP_SHEET_PREFIX}Website only" holds charts not yet in the Excel; it is ignored when building.`);
}

/* ---------- CLI ---------- */

const args = process.argv.slice(2);
if (args[0] === 'export') {
  exportWorkbook(path.resolve(args[1] || DEFAULT_EXPORT));
} else {
  const dryRun = args.includes('--dry-run');
  const file = args.find((a) => !a.startsWith('--'));
  build(file ? path.resolve(file) : DEFAULT_XLSX, dryRun);
}
