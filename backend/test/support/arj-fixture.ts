/** Synthetic stored ARJ writer for path, size and decoder integration tests. No business data. */
export type ArjFixtureEntry = {
  name: string;
  data?: string | Buffer;
  directory?: boolean;
  flags?: number;
  declaredSize?: number;
  badCrc?: boolean;
};

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function block(header: Buffer, name: string): Buffer {
  const bytes = Buffer.concat([header, Buffer.from(name + '\0\0')]);
  const marker = Buffer.from([0x60, 0xea, 0, 0]);
  marker.writeUInt16LE(bytes.length, 2);
  const crc = Buffer.alloc(4);
  crc.writeUInt32LE(crc32(bytes));
  return Buffer.concat([marker, bytes, crc, Buffer.alloc(2)]);
}

export function syntheticArj(entries: ArjFixtureEntry[], archiveFlags = 0): Buffer {
  const main = Buffer.alloc(30);
  main[0] = 30;
  main[1] = 3;
  main[2] = 1;
  main[4] = archiveFlags;
  main[6] = 2;
  const chunks = [block(main, 'synthetic.arj')];
  for (const entry of entries) {
    const data = entry.directory ? Buffer.alloc(0) : Buffer.from(entry.data ?? 'synthetic');
    const header = Buffer.alloc(30);
    header[0] = 30;
    header[1] = 3;
    header[2] = 1;
    header[4] = entry.flags ?? 0;
    header[5] = 0;
    header[6] = entry.directory ? 3 : 0;
    header.writeUInt32LE(data.length, 12);
    header.writeUInt32LE(entry.declaredSize ?? data.length, 16);
    header.writeUInt32LE((entry.badCrc ? crc32(data) ^ 1 : crc32(data)) >>> 0, 20);
    header.writeUInt16LE(entry.directory ? 0x10 : 0x20, 26);
    chunks.push(block(header, entry.name), data);
  }
  chunks.push(Buffer.from([0x60, 0xea, 0, 0]));
  return Buffer.concat(chunks);
}
