export type TarArchiveEntry = {
  path: string;
  size: number;
  modifiedAt?: Date;
  content: Buffer | AsyncIterable<Uint8Array>;
};

/** Create a streaming ustar archive. Entry content is held only one chunk at a time. */
export async function* streamTarArchive(entries: AsyncIterable<TarArchiveEntry>): AsyncGenerator<Buffer> {
  for await (const entry of entries) {
    yield createHeader(entry.path, entry.size, entry.modifiedAt ?? new Date());
    let written = 0;
    const chunks = Buffer.isBuffer(entry.content) ? [entry.content] : entry.content;
    for await (const value of chunks) {
      const chunk = Buffer.from(value);
      written += chunk.length;
      if (written > entry.size) throw new Error('Archive entry exceeded its declared size');
      yield chunk;
    }
    if (written !== entry.size) throw new Error('Archive entry did not match its declared size');
    const padding = (512 - (written % 512)) % 512;
    if (padding) yield Buffer.alloc(padding);
  }
  yield Buffer.alloc(1024);
}

function createHeader(path: string, size: number, modifiedAt: Date): Buffer {
  if (!/^[A-Za-z0-9._/-]+$/.test(path) || path.length > 100 || path.split('/').some(part => !part || part === '.' || part === '..'))
    throw new Error('Archive entry path is invalid');
  if (!Number.isSafeInteger(size) || size < 0) throw new Error('Archive entry size is invalid');
  const header = Buffer.alloc(512);
  header.write(path, 0, 100, 'ascii');
  writeOctal(header, 100, 8, 0o600);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, Math.floor(modifiedAt.getTime() / 1000));
  header.fill(0x20, 148, 156);
  header[156] = '0'.charCodeAt(0);
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, '0'), 148, 6, 'ascii');
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function writeOctal(header: Buffer, offset: number, length: number, value: number): void {
  const digits = Math.trunc(value).toString(8);
  if (digits.length > length - 1) throw new Error('Archive entry metadata exceeds ustar limits');
  header.write(digits.padStart(length - 1, '0') + '\0', offset, length, 'ascii');
}
