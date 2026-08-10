// lib/zip.ts — dependency-free ZIP writer (M5 backup/export).
//
// Builds a standard .zip buffer with no external packages: local file
// headers + central directory + end-of-central-directory, entries deflated
// via node:zlib (deflateRawSync) with a table-driven CRC-32. The result is a
// plain, portable ZIP — verified with `unzip -t` in the M5 smoke pass.

import { deflateRawSync } from "node:zlib";

export interface ZipEntry {
  /** Forward-slash relative path inside the archive (e.g. "doc-id/document.json"). */
  name: string;
  data: Buffer;
}

// CRC-32 (IEEE 802.3) lookup table.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** Assemble a .zip archive. Entries are deflated (method 8); folders via trailing "/". */
export function createZip(entries: ZipEntry[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const data = deflateRawSync(entry.data);
    const crc = crc32(entry.data);
    const size = entry.data.length;
    const csize = data.length;

    // Local file header (30 bytes fixed + name + data)
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // general purpose flags
    local.writeUInt16LE(8, 8); // compression method: deflate
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0, 12); // mod date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(csize, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    parts.push(local, nameBuf, data);

    // Central directory entry (46 bytes fixed + name)
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); // PK\x01\x02
    cen.writeUInt16LE(20, 4); // version made by
    cen.writeUInt16LE(20, 6); // version needed
    cen.writeUInt16LE(0, 8); // flags
    cen.writeUInt16LE(8, 10); // method
    cen.writeUInt16LE(0, 12); // mod time
    cen.writeUInt16LE(0, 14); // mod date
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(csize, 20);
    cen.writeUInt32LE(size, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30); // extra
    cen.writeUInt16LE(0, 32); // comment
    cen.writeUInt16LE(0, 34); // disk start
    cen.writeUInt16LE(0, 36); // internal attrs
    cen.writeUInt32LE(0, 38); // external attrs
    cen.writeUInt32LE(offset, 42); // local header offset
    central.push(cen, nameBuf);

    offset += 30 + nameBuf.length + data.length;
  }

  // End of central directory (22 bytes)
  const cdSize = central.reduce((sum, b) => sum + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // PK\x05\x06
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // central dir disk
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...parts, ...central, eocd]);
}
