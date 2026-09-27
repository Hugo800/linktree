// City and country for an IP address from a local MaxMind-format database (DB-IP "IP to City
// Lite", CC BY 4.0). No third party sees the visitor's IP. The database is fetched once a month
// into the data volume; without it every lookup simply returns null.
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { isIP } from 'node:net';

const MARKER = Buffer.from('\xab\xcd\xefMaxMind.com', 'latin1');
const MONTH = 32 * 24 * 3600 * 1000;

/** Minimal reader for the MaxMind DB format (only what the lookups need). */
export class MMDB {
  constructor(buf) {
    this.buf = buf;
    const m = buf.lastIndexOf(MARKER);
    if (m < 0) throw new Error('not a MaxMind DB file');
    this.meta = this.decode(m + MARKER.length, 0)[0];
    const { node_count: nodes, record_size: size, ip_version: v } = this.meta;
    if (![24, 28, 32].includes(size)) throw new Error(`record size ${size} not supported`);
    this.nodes = nodes;
    this.size = size;
    this.treeSize = (size * 2 / 8) * nodes;
    this.dataStart = this.treeSize + 16;
    // IPv4 addresses live under ::/96 in an IPv6 tree.
    this.v4Start = 0;
    if (v === 6) for (let i = 0; i < 96 && this.v4Start < nodes; i++) this.v4Start = this.record(this.v4Start, 0);
  }

  record(node, bit) {
    const b = this.buf;
    if (this.size === 24) {
      const o = node * 6 + bit * 3;
      return (b[o] << 16) | (b[o + 1] << 8) | b[o + 2];
    }
    if (this.size === 28) {
      const o = node * 7;
      return bit === 0
        ? ((b[o + 3] & 0xf0) << 20) | (b[o] << 16) | (b[o + 1] << 8) | b[o + 2]
        : ((b[o + 3] & 0x0f) << 24) | (b[o + 4] << 16) | (b[o + 5] << 8) | b[o + 6];
    }
    return b.readUInt32BE(node * 8 + bit * 4);
  }

  lookup(ip) {
    const kind = isIP(ip);
    if (!kind) return null;
    let bytes;
    if (kind === 4) bytes = ip.split('.').map(Number);
    else {
      const [head, tail = ''] = ip.split('::');
      const h = head ? head.split(':') : [];
      const t = tail ? tail.split(':') : [];
      const groups = ip.includes('::') ? [...h, ...Array(8 - h.length - t.length).fill('0'), ...t] : h;
      bytes = groups.flatMap((g) => [parseInt(g, 16) >> 8, parseInt(g, 16) & 0xff]);
    }
    let node = kind === 4 ? this.v4Start : 0;
    for (let i = 0; i < bytes.length * 8 && node < this.nodes; i++) {
      node = this.record(node, (bytes[i >> 3] >> (7 - (i & 7))) & 1);
    }
    if (node <= this.nodes) return null; // == nodes: not in the database
    return this.decode(this.dataStart + (node - this.nodes - 16), this.dataStart)[0];
  }

  /** Decodes one value at `off`; pointers are relative to `base`. Returns [value, next offset]. */
  decode(off, base) {
    const b = this.buf;
    const ctrl = b[off++];
    let type = ctrl >> 5;
    if (type === 1) {
      const ss = (ctrl >> 3) & 3;
      const v = ctrl & 7;
      let p;
      if (ss === 0) p = (v << 8) | b[off];
      else if (ss === 1) p = ((v << 16) | (b[off] << 8) | b[off + 1]) + 2048;
      else if (ss === 2) p = ((v << 24) | (b[off] << 16) | (b[off + 1] << 8) | b[off + 2]) + 526336;
      else p = b.readUInt32BE(off);
      return [this.decode(base + p, base)[0], off + ss + 1];
    }
    if (type === 0) type = 7 + b[off++];
    let size = ctrl & 0x1f;
    if (size === 29) size = 29 + b[off++];
    else if (size === 30) (size = 285 + b.readUInt16BE(off)), (off += 2);
    else if (size === 31) (size = 65821 + ((b[off] << 16) | (b[off + 1] << 8) | b[off + 2])), (off += 3);
    switch (type) {
      case 2:
        return [b.toString('utf8', off, off + size), off + size];
      case 3:
        return [b.readDoubleBE(off), off + 8];
      case 4:
        return [b.subarray(off, off + size), off + size];
      case 5:
      case 6:
      case 9:
      case 10: {
        let n = 0;
        for (let i = 0; i < size; i++) n = n * 256 + b[off + i];
        return [n, off + size];
      }
      case 8:
        return [size ? b.readIntBE(off, size) : 0, off + size];
      case 7: {
        const map = {};
        for (let i = 0; i < size; i++) {
          let k, v;
          [k, off] = this.decode(off, base);
          [v, off] = this.decode(off, base);
          map[k] = v;
        }
        return [map, off];
      }
      case 11: {
        const arr = [];
        for (let i = 0; i < size; i++) {
          let v;
          [v, off] = this.decode(off, base);
          arr.push(v);
        }
        return [arr, off];
      }
      case 14:
        return [size !== 0, off];
      case 15:
        return [b.readFloatBE(off), off + 4];
      default:
        throw new Error(`MMDB type ${type} not supported`);
    }
  }
}

/** Keeps the database in `dir` fresh (monthly) and answers {country, city} lookups. */
export function geo(dir, { download = true, log = console.log } = {}) {
  mkdirSync(dir, { recursive: true });
  const file = `${dir}/dbip-city-lite.mmdb`;
  let db = null;

  const load = () => {
    try {
      db = existsSync(file) ? new MMDB(readFileSync(file)) : null;
      if (db) log(`geo: ${file} (${db.meta.database_type}, build ${new Date(db.meta.build_epoch * 1000).toISOString().slice(0, 10)})`);
    } catch (e) {
      log(`geo: cannot read ${file}: ${e.message}`);
      db = null;
    }
  };

  const refresh = async () => {
    if (existsSync(file) && Date.now() - statSync(file).mtimeMs < MONTH) return;
    const now = new Date();
    // The file of the current month appears during the month; fall back to the previous one.
    for (const back of [0, 1]) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
      const url = `https://download.db-ip.com/free/dbip-city-lite-${d.toISOString().slice(0, 7)}.mmdb.gz`;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await pipeline(Readable.fromWeb(res.body), createGunzip(), createWriteStream(`${file}.tmp`));
        new MMDB(readFileSync(`${file}.tmp`)); // throws on a broken download
        renameSync(`${file}.tmp`, file);
        log(`geo: updated from ${url}`);
        load();
        return;
      } catch (e) {
        log(`geo: ${url}: ${e.message}`);
      }
    }
  };

  load();
  if (download) {
    refresh();
    setInterval(refresh, 24 * 3600 * 1000).unref();
  }

  return {
    lookup(ip) {
      if (!db || !ip) return null;
      try {
        const r = db.lookup(ip.replace(/^::ffff:/, ''));
        if (!r) return null;
        return {
          country: r.country?.iso_code ?? null,
          countryName: r.country?.names?.de ?? r.country?.names?.en ?? null,
          // "Berlin (Bezirk Tempelhof-Schöneberg)" -> "Berlin": districts would split one city into many rows.
          city: (r.city?.names?.de ?? r.city?.names?.en ?? '').replace(/\s*\(.*\)$/, '') || null,
        };
      } catch {
        return null;
      }
    },
    get ready() {
      return !!db;
    },
  };
}
