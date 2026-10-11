import { droppedFiles, isDicomFile, pickDicom } from './dicom-files';

/** A DICOM file: 128-byte preamble, "DICM", then some data. */
const dicom = (name: string) => new File([new Uint8Array(128), 'DICM', 'data'], name);
const other = (name: string) => new File(['x'.repeat(200)], name);

describe('isDicomFile', () => {
  it('recognises the DICM marker after the preamble', async () => {
    expect(await isDicomFile(dicom('a.dcm'))).toBe(true);
    expect(await isDicomFile(dicom('no-extension'))).toBe(true);
    expect(await isDicomFile(other('a.dcm'))).toBe(false);
    expect(await isDicomFile(new File(['DICM'], 'tiny'))).toBe(false);
  });

  it('skips a DICOMDIR, which only indexes the other files', async () => {
    expect(await isDicomFile(dicom('DICOMDIR'))).toBe(false);
  });
});

describe('pickDicom', () => {
  it('keeps the DICOM files in order and names the others', async () => {
    const picked = await pickDicom([dicom('1.dcm'), other('notes.txt'), dicom('2.dcm')]);

    expect(picked.dicom.map((f) => f.name)).toEqual(['1.dcm', '2.dcm']);
    expect(picked.skipped).toEqual([{ name: 'notes.txt', reason: 'Not DICOM' }]);
  });

  it('skips a file it cannot read instead of failing the whole check', async () => {
    // Like a file without read permission: the browser lists it, then refuses to read it.
    const unreadable = Object.assign(new File(['x'.repeat(200)], 'CITATION.txt'), {
      slice: () => ({
        arrayBuffer: () => Promise.reject(new DOMException('denied', 'NotReadableError')),
      }),
    });

    const picked = await pickDicom([dicom('1.dcm'), unreadable, dicom('2.dcm')]);

    expect(picked.dicom.map((f) => f.name)).toEqual(['1.dcm', '2.dcm']);
    expect(picked.skipped).toEqual([
      { name: 'CITATION.txt', reason: 'Could not be read (check its permissions)' },
    ]);
  });

  it('checks many files, a few at a time, reporting progress', async () => {
    const files = Array.from({ length: 100 }, (_, i) => dicom(`${i}.dcm`));
    const progress: number[] = [];

    const picked = await pickDicom(files, (done) => progress.push(done));

    expect(picked.dicom).toHaveLength(100);
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(100);
    expect(progress).toHaveLength(101);
  });
});

describe('droppedFiles', () => {
  /** A fake file-system entry, as the browser hands dropped items over. */
  const fileEntry = (file: File) => ({
    isFile: true,
    isDirectory: false,
    file: (resolve: (f: File) => void) => resolve(file),
  });
  /** A folder whose reader returns its entries in chunks of 2, then nothing. */
  const folderEntry = (children: object[]) => ({
    isFile: false,
    isDirectory: true,
    createReader: () => {
      let next = 0;
      return {
        readEntries: (resolve: (chunk: object[]) => void) => {
          resolve(children.slice(next, next + 2));
          next += 2;
        },
      };
    },
  });
  const transfer = (entries: object[]) =>
    ({
      items: entries.map((e) => ({ webkitGetAsEntry: () => e })),
      files: [],
    }) as unknown as DataTransfer;

  it('takes the files of dropped folders at any depth, reading every chunk', async () => {
    const files = await droppedFiles(
      transfer([
        fileEntry(dicom('top.dcm')),
        folderEntry([
          fileEntry(dicom('a.dcm')),
          fileEntry(dicom('b.dcm')),
          fileEntry(dicom('c.dcm')),
          folderEntry([fileEntry(dicom('deep.dcm'))]),
        ]),
      ]),
    );

    expect(files.map((f) => f.name)).toEqual(['top.dcm', 'a.dcm', 'b.dcm', 'c.dcm', 'deep.dcm']);
  });

  it('falls back to the plain file list when there are no entries', async () => {
    const plain = { items: [], files: [dicom('x.dcm')] } as unknown as DataTransfer;

    expect((await droppedFiles(plain)).map((f) => f.name)).toEqual(['x.dcm']);
  });
});
