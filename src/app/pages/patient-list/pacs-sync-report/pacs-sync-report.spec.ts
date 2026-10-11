import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { PacsSyncReport as Report } from '../../../pacs/pacs-sync';
import { PacsSyncReport } from './pacs-sync-report';

describe('PacsSyncReport', () => {
  let fixture: ComponentFixture<PacsSyncReport>;
  let element: HTMLElement;

  const render = async (report: Report) => {
    fixture.componentRef.setInput('report', report);
    await fixture.whenStable();
  };
  const text = (selector: string) =>
    element.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
  const items = (heading: string) => {
    const h3 = [...element.querySelectorAll('h3')].find((h) => h.textContent === heading);
    let list = h3?.nextElementSibling;
    if (list && !list.matches('ul')) list = list.nextElementSibling;
    return [...(list?.querySelectorAll('li') ?? [])].map((li) =>
      [...li.querySelectorAll('span')].map((span) => span.textContent?.trim()).join(' '),
    );
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PacsSyncReport] }).compileComponents();
    fixture = TestBed.createComponent(PacsSyncReport);
    element = fixture.nativeElement;
  });

  it('counts the outcomes that happened and the new patients', async () => {
    await render({
      studies: [
        { studyInstanceUid: '1', outcome: 'created', imagingStudyId: 'a', patientCreated: true },
        { studyInstanceUid: '2', outcome: 'created', imagingStudyId: 'b', patientCreated: false },
        { studyInstanceUid: '3', outcome: 'unchanged', imagingStudyId: 'c' },
      ],
      missingFromPacs: [],
    });

    expect(text('.summary')).toBe(
      '3 DICOM studies in the PACS: 2 created, 1 unchanged. 1 new patient.',
    );
    expect(element.querySelector('h3')).toBeNull();
    expect(element.querySelector('.panel.warning')).toBeNull();
  });

  it('lists the DICOM studies that were skipped or failed, with the reason', async () => {
    await render({
      studies: [
        { studyInstanceUid: '1', outcome: 'created', imagingStudyId: 'a' },
        { studyInstanceUid: '2', outcome: 'skipped', reason: 'The DICOM study has no Patient ID.' },
        { studyInstanceUid: '3', outcome: 'failed', reason: 'The FHIR server failed (HTTP 500)' },
      ],
      missingFromPacs: [],
    });

    expect(items('Not synced')).toEqual([
      'skipped 2 The DICOM study has no Patient ID.',
      'failed 3 The FHIR server failed (HTTP 500)',
    ]);
    expect(element.querySelector('.panel.warning')).not.toBeNull();
  });

  it('lists the imaging studies that are not in the PACS', async () => {
    await render({
      studies: [],
      missingFromPacs: [
        { imagingStudyId: 's1', studyInstanceUid: '1.9' },
        { imagingStudyId: 's2', studyInstanceUid: '' },
      ],
    });

    expect(text('.summary')).toBe('The PACS has no DICOM studies.');
    expect(items('Not in the PACS')).toEqual([
      'ImagingStudy/s1 1.9',
      'ImagingStudy/s2 No Study Instance UID',
    ]);
  });

  it('can be closed', async () => {
    await render({ studies: [], missingFromPacs: [] });
    let closed = false;
    fixture.componentInstance.dismissed.subscribe(() => (closed = true));

    element.querySelector<HTMLButtonElement>('.close')?.click();

    expect(closed).toBe(true);
  });
});
