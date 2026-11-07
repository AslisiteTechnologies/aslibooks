import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadOrganizationArchive } from './api';

const headers = {
  'Content-Disposition': 'attachment; filename="aslibooks-demo-archive.tar.gz"',
  'X-Export-Format': 'aslibooks-tar-gzip-v1',
};

describe('organization archive downloads', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pipes a large archive stream directly to a user-selected file', async () => {
    const bytes = new TextEncoder().encode('synthetic archive bytes');
    const written: Uint8Array[] = [];
    let closed = false;
    const writable = new WritableStream<Uint8Array>({
      write(chunk) { written.push(chunk); },
      close() { closed = true; },
    });
    const showSaveFilePicker = vi.fn(async () => ({ createWritable: async () => writable }));
    const fetchMock = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(bytes); controller.close(); },
    }), { status: 200, headers }));
    vi.stubGlobal('window', { showSaveFilePicker });
    vi.stubGlobal('fetch', fetchMock);

    const result = await downloadOrganizationArchive('synthetic-org');

    expect(showSaveFilePicker).toHaveBeenCalledWith({ suggestedName: 'aslibooks-organization-archive.tar.gz' });
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4000/api/organizations/synthetic-org/export/archive', { credentials: 'include' });
    expect(result).toMatchObject({ filename: 'aslibooks-demo-archive.tar.gz', savedToDisk: true });
    expect(result.blob).toBeUndefined();
    expect(closed).toBe(true);
    expect(new TextDecoder().decode(written[0])).toBe('synthetic archive bytes');
  });

  it('uses a blob download where the browser does not support file streaming', async () => {
    const fetchMock = vi.fn(async () => new Response('synthetic archive bytes', { status: 200, headers }));
    vi.stubGlobal('window', {});
    vi.stubGlobal('fetch', fetchMock);

    const result = await downloadOrganizationArchive('synthetic-org');

    expect(result.savedToDisk).toBeUndefined();
    expect(await result.blob?.text()).toBe('synthetic archive bytes');
  });

  it('treats save-picker cancellation as a non-error and does not fetch the archive', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('window', { showSaveFilePicker: vi.fn().mockRejectedValue(new DOMException('Canceled', 'AbortError')) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(downloadOrganizationArchive('synthetic-org')).resolves.toMatchObject({ cancelled: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
