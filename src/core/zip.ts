/**
 * A minimal ZIP writer (feature 024, research R7: Word files are ZIPs).
 * Stored or deflated entries, CRC-32 checksums, one central directory, no
 * ZIP64 (entries and the archive stay under 4 GB). Pure: the compressor and
 * the checksum come in from the caller (Node's zlib on the server), so
 * this file runs anywhere and tests can check it against an unzipper.
 */

export interface ZipEntry {
	/** Forward slashes, no leading slash. */
	name: string;
	data: Uint8Array;
	/** Store as is (images that are already compressed). Default: deflate. */
	store?: boolean;
}

export interface ZipDeps {
	/** Raw DEFLATE (no zlib header), as `zlib.deflateRawSync`. */
	deflateRaw: (data: Uint8Array) => Uint8Array;
	/** CRC-32 (IEEE), as `zlib.crc32`. */
	crc32: (data: Uint8Array) => number;
}

const encoder = new TextEncoder();

/** A fixed timestamp (1 Jan 2026, 00:00) so the same input makes the same bytes. */
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

export function zip(entries: readonly ZipEntry[], deps: ZipDeps): Uint8Array {
	const chunks: Uint8Array[] = [];
	const central: Uint8Array[] = [];
	let offset = 0;
	const names = new Set<string>();
	for (const entry of entries) {
		if (!entry.name || entry.name.startsWith("/") || entry.name.includes("\\") || names.has(entry.name)) throw new Error(`zip: bad or repeated entry name "${entry.name}"`);
		names.add(entry.name);
		const name = encoder.encode(entry.name);
		const crc = deps.crc32(entry.data) >>> 0;
		const deflated = entry.store ? null : deps.deflateRaw(entry.data);
		// Deflate only when it helps.
		const useDeflate = deflated !== null && deflated.length < entry.data.length;
		const body = useDeflate ? deflated : entry.data;
		const method = useDeflate ? 8 : 0;
		// UTF-8 names (bit 11).
		const flags = 0x0800;

		const local = new Uint8Array(30 + name.length);
		const lv = new DataView(local.buffer);
		lv.setUint32(0, 0x04034b50, true);
		lv.setUint16(4, 20, true);
		lv.setUint16(6, flags, true);
		lv.setUint16(8, method, true);
		lv.setUint16(10, DOS_TIME, true);
		lv.setUint16(12, DOS_DATE, true);
		lv.setUint32(14, crc, true);
		lv.setUint32(18, body.length, true);
		lv.setUint32(22, entry.data.length, true);
		lv.setUint16(26, name.length, true);
		lv.setUint16(28, 0, true);
		local.set(name, 30);

		const dir = new Uint8Array(46 + name.length);
		const dv = new DataView(dir.buffer);
		dv.setUint32(0, 0x02014b50, true);
		dv.setUint16(4, 20, true);
		dv.setUint16(6, 20, true);
		dv.setUint16(8, flags, true);
		dv.setUint16(10, method, true);
		dv.setUint16(12, DOS_TIME, true);
		dv.setUint16(14, DOS_DATE, true);
		dv.setUint32(16, crc, true);
		dv.setUint32(20, body.length, true);
		dv.setUint32(24, entry.data.length, true);
		dv.setUint16(28, name.length, true);
		dv.setUint16(30, 0, true);
		dv.setUint16(32, 0, true);
		dv.setUint16(34, 0, true);
		dv.setUint16(36, 0, true);
		dv.setUint32(38, 0, true);
		dv.setUint32(42, offset, true);
		dir.set(name, 46);

		chunks.push(local, body);
		central.push(dir);
		offset += local.length + body.length;
	}
	const dirSize = central.reduce((sum, c) => sum + c.length, 0);
	const end = new Uint8Array(22);
	const ev = new DataView(end.buffer);
	ev.setUint32(0, 0x06054b50, true);
	ev.setUint16(8, entries.length, true);
	ev.setUint16(10, entries.length, true);
	ev.setUint32(12, dirSize, true);
	ev.setUint32(16, offset, true);
	ev.setUint16(20, 0, true);

	const out = new Uint8Array(offset + dirSize + end.length);
	let at = 0;
	for (const part of [...chunks, ...central, end]) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}

/** A text entry (UTF-8). */
export const textEntry = (name: string, text: string): ZipEntry => ({ name, data: encoder.encode(text) });
