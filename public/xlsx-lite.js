/**
 * xlsx-lite: a dependency-free reader / writer of simple .xlsx workbooks
 * (numbers and strings, one or more sheets). Enough for the training
 * datasets and reports of the platform; not a general spreadsheet library.
 *
 * Works in Node (zlib) and in the browser (CompressionStream /
 * DecompressionStream, Chrome 80+, Safari 16.4+, Firefox 113+):
 *
 *   const xlsx = require("../public/xlsx-lite");          // Node
 *   window.xlsxLite                                        // browser script
 *
 *   const bytes = await xlsx.write([{ name: "Dataset", rows: [["NP", "Rate"], [9.5, 12]] }]);
 *   const sheets = await xlsx.read(bytes);   // [{ name, rows: [[...], ...] }]
 *
 * File format: a zip archive (deflate) with the minimal OOXML parts; strings
 * are written inline (t="inlineStr"), shared strings are read as well.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.xlsxLite = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // -------------------------------------------------------------------------
  // Environment: deflate / inflate (raw) as async functions on Uint8Array
  // -------------------------------------------------------------------------

  // Node's zlib when available; in the browser (also when bundled by
  // esbuild, where `require` is a shim that throws) the streams API is used.
  let nodeZlib = null;
  try {
    const nodeRequire = typeof require === "function" ? require : null;
    nodeZlib = nodeRequire && typeof process !== "undefined" && process.versions?.node ? nodeRequire("zlib") : null;
  } catch {
    nodeZlib = null;
  }

  async function streamTransform(bytes, Transformer, format) {
    const stream = new Blob([bytes]).stream().pipeThrough(new Transformer(format));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function deflateRaw(bytes) {
    if (nodeZlib) return new Uint8Array(nodeZlib.deflateRawSync(Buffer.from(bytes)));
    if (typeof CompressionStream !== "undefined") return streamTransform(bytes, CompressionStream, "deflate-raw");
    return null; // store uncompressed
  }

  async function inflateRaw(bytes) {
    if (nodeZlib) return new Uint8Array(nodeZlib.inflateRawSync(Buffer.from(bytes)));
    if (typeof DecompressionStream !== "undefined") return streamTransform(bytes, DecompressionStream, "deflate-raw");
    throw new Error("xlsx-lite: no inflate implementation available in this environment");
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8");

  // -------------------------------------------------------------------------
  // Zip
  // -------------------------------------------------------------------------

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function concat(chunks) {
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    chunks.forEach((c) => {
      out.set(c, offset);
      offset += c.length;
    });
    return out;
  }

  function u16(v) {
    return new Uint8Array([v & 0xff, (v >>> 8) & 0xff]);
  }

  function u32(v) {
    return new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);
  }

  /** @param {Array<{name: string, data: Uint8Array}>} files */
  async function zip(files) {
    const parts = [];
    const central = [];
    let offset = 0;
    // DOS date/time: 1 Jan 2020 00:00, fixed for reproducible files.
    const dosTime = 0;
    const dosDate = ((2020 - 1980) << 9) | (1 << 5) | 1;

    for (const file of files) {
      const name = encoder.encode(file.name);
      const crc = crc32(file.data);
      let packed = await deflateRaw(file.data);
      let method = 8;
      if (!packed || packed.length >= file.data.length) {
        packed = file.data;
        method = 0;
      }
      const header = concat([
        u32(0x04034b50), u16(20), u16(0x0800), u16(method), u16(dosTime), u16(dosDate),
        u32(crc), u32(packed.length), u32(file.data.length), u16(name.length), u16(0), name,
      ]);
      parts.push(header, packed);
      central.push(
        concat([
          u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(method), u16(dosTime), u16(dosDate),
          u32(crc), u32(packed.length), u32(file.data.length), u16(name.length), u16(0), u16(0),
          u16(0), u16(0), u32(0), u32(offset), name,
        ])
      );
      offset += header.length + packed.length;
    }
    const centralBytes = concat(central);
    const end = concat([
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(centralBytes.length), u32(offset), u16(0),
    ]);
    return concat([...parts, centralBytes, end]);
  }

  function readU16(b, i) {
    return b[i] | (b[i + 1] << 8);
  }

  function readU32(b, i) {
    return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
  }

  /** @returns {Promise<Map<string, Uint8Array>>} entry name -> data */
  async function unzip(bytes) {
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) {
      if (readU32(bytes, i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error("xlsx-lite: not a zip archive");
    const count = readU16(bytes, eocd + 10);
    let p = readU32(bytes, eocd + 16);
    const entries = new Map();
    for (let n = 0; n < count; n += 1) {
      if (readU32(bytes, p) !== 0x02014b50) throw new Error("xlsx-lite: damaged central directory");
      const method = readU16(bytes, p + 10);
      const compressed = readU32(bytes, p + 20);
      const nameLength = readU16(bytes, p + 28);
      const extraLength = readU16(bytes, p + 30);
      const commentLength = readU16(bytes, p + 32);
      const localOffset = readU32(bytes, p + 42);
      const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
      p += 46 + nameLength + extraLength + commentLength;

      const localNameLength = readU16(bytes, localOffset + 26);
      const localExtraLength = readU16(bytes, localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const packed = bytes.subarray(start, start + compressed);
      if (method === 0) entries.set(name, packed);
      else if (method === 8) entries.set(name, await inflateRaw(packed));
      else throw new Error(`xlsx-lite: unsupported compression method ${method}`);
    }
    return entries;
  }

  // -------------------------------------------------------------------------
  // XML helpers
  // -------------------------------------------------------------------------

  function escapeXml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function unescapeXml(text) {
    return String(text)
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(parseInt(code, 16)))
      .replace(/&amp;/g, "&");
  }

  function columnName(index) {
    let name = "";
    let n = index + 1;
    while (n > 0) {
      const r = (n - 1) % 26;
      name = String.fromCharCode(65 + r) + name;
      n = Math.floor((n - 1) / 26);
    }
    return name;
  }

  function columnIndex(ref) {
    const letters = ref.match(/^[A-Z]+/)[0];
    let n = 0;
    for (let i = 0; i < letters.length; i += 1) n = n * 26 + (letters.charCodeAt(i) - 64);
    return n - 1;
  }

  // -------------------------------------------------------------------------
  // Write
  // -------------------------------------------------------------------------

  function sheetXml(rows) {
    const body = rows
      .map((row, r) => {
        const cells = (row || [])
          .map((value, c) => {
            if (value === null || value === undefined || value === "") return "";
            const ref = `${columnName(c)}${r + 1}`;
            if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
            if (typeof value === "boolean") return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
            return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
          })
          .join("");
        return cells ? `<row r="${r + 1}">${cells}</row>` : "";
      })
      .join("");
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<sheetData>${body}</sheetData></worksheet>`
    );
  }

  /**
   * @param {Array<{name: string, rows: Array<Array<number|string|boolean|null>>}>} sheets
   * @returns {Promise<Uint8Array>} the .xlsx file
   */
  async function write(sheets) {
    const safeName = (name, i) =>
      String(name || `Sheet${i + 1}`).replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || `Sheet${i + 1}`;
    const files = [
      {
        name: "[Content_Types].xml",
        data:
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          sheets
            .map(
              (_, i) =>
                `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
            )
            .join("") +
          "</Types>",
      },
      {
        name: "_rels/.rels",
        data:
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
          "</Relationships>",
      },
      {
        name: "xl/workbook.xml",
        data:
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
          "<sheets>" +
          sheets
            .map((s, i) => `<sheet name="${escapeXml(safeName(s.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
            .join("") +
          "</sheets></workbook>",
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        data:
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          sheets
            .map(
              (_, i) =>
                `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
            )
            .join("") +
          "</Relationships>",
      },
      ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s.rows || []) })),
    ];
    return zip(files.map((f) => ({ name: f.name, data: encoder.encode(f.data) })));
  }

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  function textOf(xml) {
    // Concatenates every <t> of a shared string item (rich text runs).
    const parts = [];
    const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
    let m;
    while ((m = re.exec(xml))) parts.push(unescapeXml(m[1]));
    return parts.join("");
  }

  function parseSharedStrings(xml) {
    if (!xml) return [];
    const out = [];
    const re = /<si>([\s\S]*?)<\/si>/g;
    let m;
    while ((m = re.exec(xml))) out.push(textOf(m[1]));
    return out;
  }

  function parseSheet(xml, shared) {
    const rows = [];
    const cellRe = /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let m;
    while ((m = cellRe.exec(xml))) {
      const attrs = m[1];
      const inner = m[2] || "";
      const ref = (attrs.match(/\br="([A-Z]+)(\d+)"/) || [])[0];
      if (!ref) continue;
      const [, letters, rowNumber] = attrs.match(/\br="([A-Z]+)(\d+)"/);
      const r = Number(rowNumber) - 1;
      const c = columnIndex(letters);
      const type = (attrs.match(/\bt="([^"]+)"/) || [])[1] || "n";
      let value = null;
      if (type === "inlineStr") value = textOf(inner);
      else {
        const v = inner.match(/<v>([\s\S]*?)<\/v>/);
        if (v) {
          const raw = unescapeXml(v[1]);
          if (type === "s") value = shared[Number(raw)] ?? "";
          else if (type === "b") value = raw === "1";
          else if (type === "str" || type === "e") value = raw;
          else {
            const num = Number(raw);
            value = Number.isFinite(num) ? num : raw;
          }
        }
      }
      if (value === null) continue;
      while (rows.length <= r) rows.push([]);
      const row = rows[r];
      while (row.length < c) row.push(null);
      row[c] = value;
    }
    return rows;
  }

  /**
   * @param {Uint8Array|ArrayBuffer} input the .xlsx file
   * @returns {Promise<Array<{name: string, rows: Array<Array<number|string|boolean|null>>}>>}
   */
  async function read(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const entries = await unzip(bytes);
    const text = (name) => (entries.has(name) ? decoder.decode(entries.get(name)) : null);
    const workbook = text("xl/workbook.xml");
    if (!workbook) throw new Error("xlsx-lite: xl/workbook.xml is missing, not an .xlsx workbook");
    const rels = {};
    const relRe = /<Relationship\s([^>]*?)\/?>/g;
    let m;
    const relsXml = text("xl/_rels/workbook.xml.rels") || "";
    while ((m = relRe.exec(relsXml))) {
      const id = (m[1].match(/\bId="([^"]+)"/) || [])[1];
      const target = (m[1].match(/\bTarget="([^"]+)"/) || [])[1];
      if (id && target) rels[id] = target.replace(/^\/?(xl\/)?/, "");
    }
    const shared = parseSharedStrings(text("xl/sharedStrings.xml"));
    const sheets = [];
    const sheetRe = /<sheet\s([^>]*?)\/?>/g;
    let index = 0;
    while ((m = sheetRe.exec(workbook))) {
      const name = unescapeXml((m[1].match(/\bname="([^"]*)"/) || [])[1] || `Sheet${index + 1}`);
      const rid = (m[1].match(/\br:id="([^"]+)"/) || m[1].match(/\bid="([^"]+)"/) || [])[1];
      const target = rels[rid] || `worksheets/sheet${index + 1}.xml`;
      const xml = text(`xl/${target}`) || text(target) || "";
      sheets.push({ name, rows: parseSheet(xml, shared) });
      index += 1;
    }
    return sheets;
  }

  /** Rows of the first sheet as objects keyed by the header row. */
  function toObjects(rows) {
    if (!rows.length) return { header: [], records: [] };
    const header = rows[0].map((h) => String(h ?? "").trim());
    const records = rows.slice(1).filter((row) => row.some((v) => v !== null && v !== undefined && v !== ""));
    return {
      header,
      records: records.map((row) => {
        const obj = {};
        header.forEach((name, i) => {
          if (name) obj[name] = row[i] ?? null;
        });
        return obj;
      }),
    };
  }

  return { write, read, toObjects, crc32, columnName, columnIndex };
});
