import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ImagingStudy, ImagingStudySeries } from 'fhir/r4';
import { CodeSystems } from '../../../code-systems';
import { ImagingStudyDetail } from './imaging-study-detail';

const dcm = (code: string) => ({ system: CodeSystems.dicom, code });
const breast = { display: 'Breast' };
const series = (number: number, description: string, instances: number): ImagingStudySeries => ({
  uid: `2.25.${number}`,
  number,
  modality: dcm('MR'),
  description,
  numberOfInstances: instances,
  bodySite: breast,
  started: '2025-02-10',
});

// seed-study-1, plus an accession number and a reason.
const mri: ImagingStudy = {
  resourceType: 'ImagingStudy',
  id: 'seed-study-1',
  status: 'available',
  subject: { reference: 'Patient/seed-patient-1', display: 'Daphne Kostaki' },
  identifier: [
    { system: CodeSystems.dicomUid, value: 'urn:oid:2.25.1330474940' },
    {
      type: { coding: [{ system: CodeSystems.identifierType, code: 'ACSN' }] },
      value: 'ACC-2025-0042',
    },
  ],
  modality: [dcm('MR')],
  started: '2025-02-10',
  description: 'MRI breast, bilateral, with contrast',
  reasonReference: [{ reference: 'Condition/seed-condition-1', display: 'Breast cancer' }],
  numberOfSeries: 2,
  numberOfInstances: 304,
  series: [series(2, 'Axial T1 post-contrast', 160), series(1, 'Axial T1 pre-contrast', 144)],
};

describe('ImagingStudyDetail', () => {
  let fixture: ComponentFixture<ImagingStudyDetail>;
  let element: HTMLElement;

  const render = async (study: ImagingStudy) => {
    fixture.componentRef.setInput('study', study);
    await fixture.whenStable();
  };
  const texts = (selector: string) =>
    [...element.querySelectorAll(selector)].map((e) => e.textContent?.replace(/\s+/g, ' ').trim());
  const facts = (title: string) => {
    const section = [...element.querySelectorAll('section')].find(
      (s) => s.querySelector('h3')?.textContent === title,
    );
    const terms = [...(section?.querySelectorAll('dt') ?? [])].map((dt) => dt.textContent?.trim());
    const values = [...(section?.querySelectorAll('dd') ?? [])].map((dd) => dd.textContent?.trim());
    return Object.fromEntries(terms.map((term, i) => [term, values[i]]));
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ImagingStudyDetail],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(ImagingStudyDetail);
    element = fixture.nativeElement;
  });

  it('shows the study facts and its identifiers', async () => {
    await render(mri);

    expect(texts('h2')).toEqual(['MRI breast, bilateral, with contrast']);
    expect(texts('.sub')).toEqual(['Daphne Kostaki']);
    expect(facts('Study')).toEqual({
      Status: 'Available',
      Started: '10 Feb 2025',
      Modalities: 'Magnetic resonance (MR)',
      Series: '2',
      Images: '304',
    });
    expect(facts('Identifiers')).toEqual({
      'Study UID': '2.25.1330474940',
      'Accession number': 'ACC-2025-0042',
    });
  });

  it('shows the reason and the series in acquisition order', async () => {
    await render(mri);

    expect(texts('section:has([data-icon="stethoscope"]) li')).toEqual(['Breast cancer']);
    const rows = [...element.querySelectorAll('tbody tr')].map((row) =>
      [...row.querySelectorAll('td')].map((td) => td.firstChild?.textContent?.trim()),
    );
    expect(rows).toEqual([
      ['1', 'MR', 'Axial T1 pre-contrast', 'Breast', '144', '10 Feb 2025'],
      ['2', 'MR', 'Axial T1 post-contrast', 'Breast', '160', '10 Feb 2025'],
    ]);
    expect(element.querySelector('tbody abbr')?.getAttribute('title')).toBe('Magnetic resonance');
  });

  it('hides what the study does not have and marks a study entered in error', async () => {
    await render({
      resourceType: 'ImagingStudy',
      id: 's9',
      status: 'entered-in-error',
      subject: { reference: 'Patient/p1' },
    });

    expect(texts('h3')).toEqual(['Study']);
    expect(element.querySelector('h2.void')).not.toBeNull();
    expect(facts('Study')).toEqual({ Status: 'Entered in error', Series: '0' });
  });

  it("links reason conditions to their pages when it knows the page's patient", async () => {
    fixture.componentRef.setInput('patientId', 'seed-patient-1');
    await render(mri);

    const link = element.querySelector('section:has([data-icon="stethoscope"]) a');
    expect(link?.textContent).toBe('Breast cancer');
    expect(link?.getAttribute('href')).toBe('/patients/seed-patient-1/conditions/seed-condition-1');
  });
});
