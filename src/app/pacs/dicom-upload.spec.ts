import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { DicomUpload } from './dicom-upload';
import { DicomwebClient, StowResponse } from './dicomweb-client';

/** Stands in for a picked file: the uploader reads only these, and the fake PACS no bytes. */
const file = (name: string, size = 1000, study = '1.1', webkitRelativePath = '') =>
  ({ name, size, study, webkitRelativePath }) as unknown as File;

const studyOf = (f: File) => (f as File & { study: string }).study;

/** A fake PACS: stores every file unless told to refuse it or to fail. */
class FakeDicomweb {
  requests: File[][] = [];
  refuse = new Set<string>();
  /** Fails each request with this, until cleared. */
  error?: HttpErrorResponse;
  /** Fails only requests holding more than one file with this. */
  batchError?: HttpErrorResponse;

  store(files: readonly File[]): Observable<StowResponse> {
    this.requests.push([...files]);
    if (this.error) return throwError(() => this.error);
    if (this.batchError && files.length > 1) return throwError(() => this.batchError);
    return of({
      stored: files
        .filter((f) => !this.refuse.has(f.name))
        .map((f) => ({ sopInstanceUid: f.name, studyInstanceUid: studyOf(f) })),
      failed: files
        .filter((f) => this.refuse.has(f.name))
        .map((f) => ({ sopInstanceUid: f.name, reason: 'The PACS could not understand it' })),
    });
  }
}

describe('DicomUpload', () => {
  let upload: DicomUpload;
  let pacs: FakeDicomweb;

  beforeEach(() => {
    pacs = new FakeDicomweb();
    TestBed.configureTestingModule({ providers: [{ provide: DicomwebClient, useValue: pacs }] });
    upload = TestBed.inject(DicomUpload);
  });

  it('sends the files in batches of 20 and lists their studies once each', async () => {
    const files = Array.from({ length: 45 }, (_, i) => file(`f${i}`, 1000, i < 30 ? '1.1' : '1.2'));

    const report = await upload.upload(files);

    expect(pacs.requests.map((r) => r.length)).toEqual([20, 20, 5]);
    expect(report).toEqual({
      files: 45,
      stored: 45,
      failed: [],
      studyInstanceUids: ['1.1', '1.2'],
    });
  });

  it('keeps each request under 50 MB, sending a larger file on its own', async () => {
    const mb = 1024 * 1024;
    await upload.upload([file('a', 30 * mb), file('b', 30 * mb), file('c', 80 * mb), file('d')]);

    expect(pacs.requests.map((r) => r.map((f) => f.name))).toEqual([['a'], ['b'], ['c'], ['d']]);
  });

  it('finds the refused file of a partly refused batch by sending them one by one', async () => {
    pacs.refuse.add('bad.dcm');

    const report = await upload.upload([file('a'), file('bad.dcm'), file('c')]);

    expect(pacs.requests.map((r) => r.length)).toEqual([3, 1, 1, 1]);
    expect(report.stored).toBe(2);
    expect(report.failed).toEqual([
      { name: 'bad.dcm', reason: 'The PACS could not understand it' },
    ]);
  });

  it('also sends one by one when the PACS rejects the whole batch as malformed', async () => {
    pacs.batchError = new HttpErrorResponse({ status: 400 });

    const report = await upload.upload([file('a'), file('b')]);

    expect(pacs.requests.map((r) => r.length)).toEqual([2, 1, 1]);
    expect(report.stored).toBe(2);
  });

  it('stops when the PACS is down, reporting every file left with the reason', async () => {
    pacs.error = new HttpErrorResponse({ status: 504 });
    const files = Array.from({ length: 25 }, (_, i) => file(`f${i}`));

    const report = await upload.upload(files);

    expect(pacs.requests).toHaveLength(1);
    expect(report.stored).toBe(0);
    expect(report.failed).toHaveLength(25);
    expect(report.failed[0].reason).toBe('Cannot reach the PACS. Is the compose stack running?');
  });

  it('names a failed file by its path within a picked folder', async () => {
    pacs.refuse.add('x.dcm');
    const inFolder = file('x.dcm', 1000, '1.1', 'study/series1/x.dcm');

    const report = await upload.upload([inFolder]);

    expect(report.failed[0].name).toBe('study/series1/x.dcm');
  });

  it('reports progress per batch', async () => {
    const progress: [number, number][] = [];

    await upload.upload(
      Array.from({ length: 25 }, (_, i) => file(`f${i}`)),
      (done, total) => progress.push([done, total]),
    );

    expect(progress).toEqual([
      [0, 25],
      [20, 25],
      [25, 25],
    ]);
  });
});
