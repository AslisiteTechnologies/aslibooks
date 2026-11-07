import { describe, expect, it } from 'vitest';
import { streamTarArchive, type TarArchiveEntry } from './tarArchive.js';

async function* entries(items: TarArchiveEntry[]): AsyncGenerator<TarArchiveEntry> {
  yield* items;
}

async function archiveBytes(items: TarArchiveEntry[]): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of streamTarArchive(entries(items))) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function unpackTar(archive: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const name = header.subarray(0, 100).toString('ascii').replace(/\0.*$/, '');
    const size = Number.parseInt(header.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim(), 8);
    const start = offset + 512;
    files.set(name, archive.subarray(start, start + size));
    offset = start + Math.ceil(size / 512) * 512;
  }
  return files;
}

describe('streaming ustar archives', () => {
  it('writes ustar entries with streamed content', async () => {
    const text = Buffer.from('{"synthetic":true}\n');
    const attachment = Buffer.from('%PDF-1.7 synthetic fixture');
    const tar = await archiveBytes([
      { path: 'manifest.json', size: text.length, content: text },
      { path: 'attachments/0123456789abcdef01234567.pdf', size: attachment.length, content: (async function* () { yield attachment.subarray(0, 8); yield attachment.subarray(8); })() },
    ]);
    const files = unpackTar(tar);
    expect(files.get('manifest.json')).toEqual(text);
    expect(files.get('attachments/0123456789abcdef01234567.pdf')).toEqual(attachment);
  });

  it('rejects unsafe paths and mismatched content sizes', async () => {
    await expect(archiveBytes([{ path: '../secret', size: 0, content: Buffer.alloc(0) }])).rejects.toThrow('path is invalid');
    await expect(archiveBytes([{ path: 'records/one.json', size: 2, content: Buffer.from('x') }])).rejects.toThrow('did not match');
    await expect(archiveBytes([{ path: 'records/one.json', size: 1, content: Buffer.from('xy') }])).rejects.toThrow('exceeded');
  });
});
