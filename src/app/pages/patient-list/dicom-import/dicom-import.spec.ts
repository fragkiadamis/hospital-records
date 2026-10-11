import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DicomUpload, UploadReport } from '../../../pacs/dicom-upload';
import { PacsSync, PacsSyncReport } from '../../../pacs/pacs-sync';
import { DicomImport } from './dicom-import';

const dicom = (name: string) => new File([new Uint8Array(128), 'DICM', 'data'], name);
const other = (name: string) => new File(['x'.repeat(200)], name);

/** Stands in for DicomUpload; each upload waits until the test settles it. */
class FakeUpload {
  files: File[] = [];
  progress!: (done: number, total: number) => void;
  settle!: (report: UploadReport) => void;

  upload(files: File[], onProgress: (done: number, total: number) => void): Promise<UploadReport> {
    this.files = files;
    this.progress = onProgress;
    return new Promise((resolve) => (this.settle = resolve));
  }
}

class FakeSync {
  uids: readonly string[] = [];
  report: PacsSyncReport = { studies: [], missingFromPacs: [] };

  syncStudies(uids: readonly string[]): Promise<PacsSyncReport> {
    this.uids = uids;
    return Promise.resolve(this.report);
  }
}

describe('DicomImport', () => {
  let fixture: ComponentFixture<DicomImport>;
  let element: HTMLElement;
  let upload: FakeUpload;
  let sync: FakeSync;
  let imported: number;

  const text = () => element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const button = (label: string) =>
    [...element.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.includes(label),
    );
  /** Chooses files with the "Choose files" input, as the browser would set them. */
  const choose = async (...files: File[]) => {
    const input = element.querySelector<HTMLInputElement>('input[type="file"][multiple]')!;
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    input.dispatchEvent(new Event('change'));
    await new Promise((resolve) => setTimeout(resolve)); // reading the markers is asynchronous
    await fixture.whenStable();
  };
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  };

  beforeEach(async () => {
    upload = new FakeUpload();
    sync = new FakeSync();
    await TestBed.configureTestingModule({
      imports: [DicomImport],
      providers: [
        { provide: DicomUpload, useValue: upload },
        { provide: PacsSync, useValue: sync },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(DicomImport);
    element = fixture.nativeElement;
    imported = 0;
    fixture.componentInstance.imported.subscribe(() => imported++);
    fixture.componentRef.setInput('open', true);
    await fixture.whenStable();
  });

  it('shows nothing until opened', async () => {
    fixture.componentRef.setInput('open', false);
    await fixture.whenStable();

    expect(text()).toBe('');
  });

  it('checks the chosen files and offers to upload only the DICOM ones', async () => {
    await choose(dicom('1.dcm'), other('notes.txt'), dicom('2.dcm'));

    expect(text()).toContain('2 DICOM files');
    expect(element.querySelector('details summary')?.textContent).toContain('1 file skipped');
    expect(button('Upload 2 files')?.disabled).toBe(false);
  });

  it('has nothing to upload when no file is DICOM', async () => {
    await choose(other('notes.txt'));

    expect(text()).toContain('None of these files is DICOM');
    expect(button('Upload')?.disabled).toBe(true);
  });

  it('uploads, then links the stored studies, and reports both', async () => {
    sync.report = {
      studies: [
        { studyInstanceUid: '1.1', outcome: 'created', imagingStudyId: 's1', patientCreated: true },
      ],
      missingFromPacs: [],
    };
    await choose(dicom('1.dcm'), dicom('2.dcm'), dicom('3.dcm'));

    button('Upload 3 files')!.click();
    await fixture.whenStable();
    upload.progress(2, 3);
    await fixture.whenStable();
    expect(text()).toContain('Uploading 2 of 3 files…');
    expect(button('×')).toBeUndefined();
    expect(element.querySelector<HTMLButtonElement>('.close')?.disabled).toBe(true);

    upload.settle({
      files: 3,
      stored: 2,
      failed: [{ name: '3.dcm', reason: 'The PACS could not understand it' }],
      studyInstanceUids: ['1.1'],
    });
    await settle();

    expect(upload.files.map((f) => f.name)).toEqual(['1.dcm', '2.dcm', '3.dcm']);
    expect(sync.uids).toEqual(['1.1']);
    expect(text()).toContain('2 of 3 files stored in the PACS.');
    const failed = element.querySelector('.files li');
    expect(failed?.querySelector('.name')?.textContent).toBe('3.dcm');
    expect(failed?.querySelector('.reason')?.textContent).toBe('The PACS could not understand it');
    const report = element.querySelector('app-pacs-sync-report')?.textContent;
    expect(report).toContain('1 uploaded DICOM study');
    expect(report).toContain('1 created');
    expect(imported).toBe(1);
  });

  it('does not ask for a reload when nothing was created or updated', async () => {
    sync.report = {
      studies: [{ studyInstanceUid: '1.1', outcome: 'unchanged', imagingStudyId: 's1' }],
      missingFromPacs: [],
    };
    await choose(dicom('1.dcm'));
    button('Upload 1 file')!.click();
    upload.settle({ files: 1, stored: 1, failed: [], studyInstanceUids: ['1.1'] });
    await settle();

    expect(imported).toBe(0);
  });

  it('can import more, or be closed when done', async () => {
    await choose(dicom('1.dcm'));
    button('Upload 1 file')!.click();
    upload.settle({ files: 1, stored: 1, failed: [], studyInstanceUids: [] });
    await settle();

    button('Import more')!.click();
    await fixture.whenStable();
    expect(text()).toContain('Drop DICOM files or folders here');

    await choose(dicom('2.dcm'));
    button('Choose other files')!.click();
    await fixture.whenStable();
    expect(text()).toContain('Drop DICOM files or folders here');

    element.querySelector<HTMLButtonElement>('.close')!.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('lists unreadable files as skipped, with the reason, and still offers the rest', async () => {
    const unreadable = Object.assign(new File(['x'.repeat(200)], 'CITATION.txt'), {
      slice: () => ({
        arrayBuffer: () => Promise.reject(new DOMException('denied', 'NotReadableError')),
      }),
    });

    await choose(dicom('1.dcm'), unreadable);

    expect(button('Upload 1 file')?.disabled).toBe(false);
    const skipped = element.querySelector('details li');
    expect(skipped?.querySelector('.name')?.textContent).toBe('CITATION.txt');
    expect(skipped?.querySelector('.reason')?.textContent).toBe(
      'Could not be read (check its permissions)',
    );
  });
});
