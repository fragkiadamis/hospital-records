import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Condition } from 'fhir/r4';
import { CodeSystems } from '../../../code-systems';
import { ConditionDetail } from './condition-detail';

// seed-condition-1, plus a note and recording details.
const breastCancer: Condition = {
  resourceType: 'Condition',
  id: 'seed-condition-1',
  clinicalStatus: { coding: [{ system: CodeSystems.conditionClinical, code: 'active' }] },
  verificationStatus: {
    coding: [{ system: CodeSystems.conditionVerification, code: 'confirmed' }],
  },
  category: [
    {
      coding: [
        {
          system: CodeSystems.conditionCategory,
          code: 'problem-list-item',
          display: 'Problem List Item',
        },
      ],
    },
  ],
  code: {
    coding: [
      { system: CodeSystems.snomed, code: '254837009', display: 'Malignant neoplasm of breast' },
      {
        system: CodeSystems.icd10,
        code: 'C50.9',
        display: 'Malignant neoplasm of breast, unspecified',
      },
    ],
    text: 'Breast cancer',
  },
  subject: { reference: 'Patient/seed-patient-1', display: 'Daphne Kostaki' },
  onsetDateTime: '2025-02-14',
  recordedDate: '2025-02-15',
  evidence: [{ detail: [{ reference: 'ImagingStudy/seed-study-1', display: 'MRI breast' }] }],
  note: [{ text: 'Seen on MRI.', authorString: 'Dr. Andreou', time: '2025-02-15' }],
};

describe('ConditionDetail', () => {
  let fixture: ComponentFixture<ConditionDetail>;
  let element: HTMLElement;

  const render = async (condition: Condition) => {
    fixture.componentRef.setInput('condition', condition);
    await fixture.whenStable();
  };
  const texts = (selector: string) =>
    [...element.querySelectorAll(selector)].map((e) => e.textContent?.replace(/\s+/g, ' ').trim());
  const section = (title: string) =>
    [...element.querySelectorAll('section')].find(
      (s) => s.querySelector('h3')?.textContent === title,
    );
  const facts = (title: string) => {
    const dl = section(title)?.querySelector('dl');
    const terms = [...(dl?.querySelectorAll('dt') ?? [])].map((dt) => dt.textContent?.trim());
    const values = [...(dl?.querySelectorAll('dd') ?? [])].map((dd) => dd.textContent?.trim());
    return Object.fromEntries(terms.map((term, i) => [term, values[i]]));
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ConditionDetail] }).compileComponents();
    fixture = TestBed.createComponent(ConditionDetail);
    element = fixture.nativeElement;
  });

  it('shows the name, the patient, statuses and every code', async () => {
    await render(breastCancer);

    expect(texts('h2')).toEqual(['Breast cancer']);
    expect(texts('.sub')).toEqual(['Daphne Kostaki']);
    expect(facts('Status')).toEqual({
      'Clinical status': 'Active',
      Verification: 'Confirmed',
      Category: 'Problem List Item',
    });
    expect(texts('section:has(app-coding-chip) li > span')).toEqual([
      'Malignant neoplasm of breast',
      'Malignant neoplasm of breast, unspecified',
    ]);
  });

  it('shows the timeline, the evidence and the notes', async () => {
    await render({ ...breastCancer, abatementDateTime: '2026-03-01' });

    expect(facts('Timeline')).toEqual({
      Onset: '14 Feb 2025',
      Ended: '1 Mar 2026',
      Recorded: '15 Feb 2025',
    });
    expect(texts('section:has(.ti-photo-scan) li')).toEqual(['MRI breast']);
    expect(texts('.notes p')).toEqual(['Seen on MRI.']);
    expect(texts('.notes .meta')).toEqual(['Dr. Andreou 15 Feb 2025']);
  });

  it('hides the sections the condition has no data for', async () => {
    await render({ resourceType: 'Condition', id: 'c9', subject: { reference: 'Patient/p1' } });

    expect(texts('h2')).toEqual(['Condition/c9']);
    expect(texts('h3')).toEqual(['Status']);
    expect(facts('Status')).toEqual({
      'Clinical status': 'Not recorded',
      Verification: 'Not recorded',
    });
  });

  it('marks a condition entered in error', async () => {
    await render({
      ...breastCancer,
      clinicalStatus: undefined,
      verificationStatus: {
        coding: [{ system: CodeSystems.conditionVerification, code: 'entered-in-error' }],
      },
    });

    expect(element.querySelector('h2.void')).not.toBeNull();
    expect(facts('Status')['Verification']).toBe('Entered in error');
  });
});
