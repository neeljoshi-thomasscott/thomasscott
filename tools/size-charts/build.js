#!/usr/bin/env node
/*
 * Size chart generator
 * --------------------
 * Builds snippets/size-chart-data.liquid from:
 *   1. the brand's size chart Excel file (source of truth for every chart it contains)
 *   2. tools/size-charts/legacy-charts.json (charts not yet in the Excel, kept as they were on the site)
 *
 * Usage (from the repo root):
 *   node tools/size-charts/build.js "Size_Chart (1).xlsx"
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

/* Every block in the Excel must be listed here, so a renamed or new block fails loudly instead of vanishing. */
const EXCEL_CHARTS = {
  'shirts|regular fit': { key: 'shirts-regular', title: 'Regular Fit Shirts' },
  'shirts|oversize fit': { key: 'shirts-oversized', title: 'Oversized Fit Shirts' },
  't-shirts|regular fit': { key: 'tshirts-regular', title: 'Regular Fit T-Shirts' },
  'jeans|baggy': { key: 'jeans-baggy', title: 'Baggy Fit Jeans' },
  'jeans|slim': { key: 'jeans-slim', title: 'Slim Fit Jeans' },
  'jeans|carrot': { key: 'jeans-carrot', title: 'Carrot Fit Jeans' },
  'jeans|straight fit': { key: 'jeans-straight', title: 'Straight Fit Jeans' },
  'jeans|loose boot cut': { key: 'jeans-bootcut', title: 'Loose Boot Cut Jeans' },
  'jeans|skinny': { key: 'jeans-skinny', title: 'Skinny Fit Jeans' },
  'trousers|regular fit': { key: 'trousers-regular', title: 'Regular Fit Trousers' },
  'plus size trousers|slim fit / regular fit': { key: 'trousers-plus', title: 'Plus Size Trousers' },
  'jackets|regular fit': { key: 'jackets', title: 'Jackets' },
  'sweatshirts|regular fit': { key: 'sweatshirts', title: 'Sweatshirts' },
};

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

/* ---------- build ---------- */

function build(xlsxPath) {
  const charts = JSON.parse(fs.readFileSync(LEGACY, 'utf8'));
  const problems = [];

  for (const sheet of readWorkbook(xlsxPath)) {
    for (const block of [...verticalBlocks(sheet), ...horizontalBlocks(sheet)]) {
      const id = `${block.article}|${block.fit}`.toLowerCase().replace(/\s+/g, ' ').trim();
      const target = EXCEL_CHARTS[id];
      if (!target) {
        problems.push(`Unmapped Excel block "${block.article} / ${block.fit}" (sheet ${block.sheet}, row ${block.row}). Add it to EXCEL_CHARTS.`);
        continue;
      }
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

  const missing = Object.values(EXCEL_CHARTS).filter((t) => !charts[t.key]).map((t) => t.title);
  if (missing.length) problems.push(`Excel charts expected but not found: ${missing.join(', ')}`);

  for (const [key, chart] of Object.entries(charts)) {
    const text = [chart.title, ...chart.columns, ...chart.rows.flat()].join('');
    if (Object.values(SEP).some((d) => text.includes(d))) problems.push(`Chart "${key}" contains a reserved character (${Object.values(SEP).join(' ')})`);
  }

  if (problems.length) {
    console.error('Size charts NOT generated:\n- ' + problems.join('\n- '));
    process.exit(1);
  }

  const keys = Object.keys(charts).sort();
  const lines = [
    '{%- comment -%}',
    '  GENERATED FILE — do not edit by hand.',
    '  Source: the size chart Excel + tools/size-charts/legacy-charts.json',
    '  Rebuild: node tools/size-charts/build.js "<excel file>"',
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

  console.log(`Wrote ${path.relative(ROOT, OUT)} with ${keys.length} charts:`);
  for (const key of keys) console.log(`  ${key.padEnd(22)} ${String(charts[key].rows.length).padStart(2)} rows  ${charts[key].source}`);
}

const xlsx = process.argv[2];
if (!xlsx) {
  console.error('Usage: node tools/size-charts/build.js "<path to size chart .xlsx>"');
  process.exit(1);
}
build(path.resolve(xlsx));
