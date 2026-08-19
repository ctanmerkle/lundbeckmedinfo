/*
 * Builds a single .xlsx workbook (one sheet per catalog table) from
 * content/medinfo-catalog.json, with no external dependencies.
 * An .xlsx is a ZIP of OOXML parts; we assemble the parts and the ZIP by hand.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/medinfo-catalog.json'), 'utf8'));

// ---- CRC32 (needed for ZIP entries) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const xmlEsc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const colLetter = (i) => {
  let s = '';
  let n = i;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
};

const sheets = catalog[':names'].map((name) => {
  const rows = catalog[name].data;
  const cols = rows.length ? Object.keys(rows[0]) : [];
  return { name, rows, cols };
});

// ---- sheet XML (all cells as inline strings) ----
function sheetXml(sheet) {
  const lines = [];
  // header row
  const header = sheet.cols.map((c, ci) => `<c r="${colLetter(ci)}1" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(c)}</t></is></c>`).join('');
  lines.push(`<row r="1">${header}</row>`);
  sheet.rows.forEach((row, ri) => {
    const r = ri + 2;
    const cells = sheet.cols.map((c, ci) => `<c r="${colLetter(ci)}${r}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(row[c])}</t></is></c>`).join('');
    lines.push(`<row r="${r}">${cells}</row>`);
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${lines.join('')}</sheetData></worksheet>`;
}

const parts = {};
parts['[Content_Types].xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;

parts['_rels/.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

parts['xl/workbook.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;

parts['xl/_rels/workbook.xml.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`;

sheets.forEach((s, i) => { parts[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(s); });

// ---- assemble ZIP (deflate) ----
const entries = Object.entries(parts).map(([name, content]) => {
  const data = Buffer.from(content, 'utf8');
  const compressed = zlib.deflateRawSync(data);
  return {
    name, data, compressed, crc: crc32(data),
  };
});

const chunks = [];
const central = [];
let offset = 0;
const dosTime = 0;
const dosDate = 0x2100; // 1980-01-01, deterministic

entries.forEach((e) => {
  const nameBuf = Buffer.from(e.name, 'utf8');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt16LE(dosTime, 10);
  local.writeUInt16LE(dosDate, 12);
  local.writeUInt32LE(e.crc, 14);
  local.writeUInt32LE(e.compressed.length, 18);
  local.writeUInt32LE(e.data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  chunks.push(local, nameBuf, e.compressed);

  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0, 8);
  cd.writeUInt16LE(8, 10);
  cd.writeUInt16LE(dosTime, 12);
  cd.writeUInt16LE(dosDate, 14);
  cd.writeUInt32LE(e.crc, 16);
  cd.writeUInt32LE(e.compressed.length, 20);
  cd.writeUInt32LE(e.data.length, 24);
  cd.writeUInt16LE(nameBuf.length, 28);
  cd.writeUInt32LE(offset, 42);
  central.push(cd, nameBuf);

  offset += local.length + nameBuf.length + e.compressed.length;
});

const centralBuf = Buffer.concat(central);
const centralOffset = offset;
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(centralBuf.length, 12);
end.writeUInt32LE(centralOffset, 16);

const out = Buffer.concat([...chunks, centralBuf, end]);
const outPath = path.join(__dirname, 'medinfo-catalog.xlsx');
fs.writeFileSync(outPath, out);
console.log(`Wrote ${outPath} (${out.length} bytes, ${entries.length} parts, ${sheets.length} sheets)`);
sheets.forEach((s) => console.log(`  - sheet "${s.name}": ${s.rows.length} rows x ${s.cols.length} cols`));
