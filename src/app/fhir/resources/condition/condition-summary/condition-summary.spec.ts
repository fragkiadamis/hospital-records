import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Condition } from 'fhir/r4';
import { CodeSystems } from '../../../code-systems';
import { ConditionSummary } from './condition-summary';

const subject = { reference: 'Patient/seed-patient-2' };
const clinical = (code: string) => ({
  coding: [{ system: CodeSystems.conditionClinical, code }],
});
const verification = (code: string) => ({
  coding: [{ system: CodeSystems.conditionVerification, code }],
});

describe('ConditionSummary', () => {
  let fixture: ComponentFixture<ConditionSummary>;
  let element: HTMLElement;

  const render = async (condition: Partial<Condition>) => {
    fixture.componentRef.setInput('condition', {
      resourceType: 'Condition',
      subject,
      ...condition,
    });
    await fixture.whenStable();
  };
  const texts = (selector: string) =>
    [...element.querySelectorAll(selector)].map((e) => e.textContent?.replace(/\s+/g, ' ').trim());

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ConditionSummary] }).compileComponents();
    fixture = TestBed.createComponent(ConditionSummary);
    element = fixture.nativeElement;
  });

  it('shows name, status, onset, end and codes', async () => {
    // seed-condition-3
    await render({
      clinicalStatus: clinical('resolved'),
      verificationStatus: verification('confirmed'),
      code: {
        coding: [
          { system: CodeSystems.snomed, code: '233604007', display: 'Pneumonia' },
          { system: CodeSystems.icd10, code: 'J18.9' },
        ],
      },
      onsetDateTime: '2026-01-08',
      abatementDateTime: '2026-02-20',
    });

    expect(texts('.name')).toEqual(['Pneumonia']);
    expect(texts('.badge')).toEqual(['Resolved']); // "Confirmed" is the normal case, not shown
    expect(element.querySelector('.badge.ongoing')).toBeNull();
    expect(texts('.details > span')).toEqual(['Onset 8 Jan 2026', 'Ended 20 Feb 2026']);
    expect(texts('app-coding-chip .code')).toEqual(['233604007', 'J18.9']);
  });

  it('highlights an ongoing condition and marks an uncertain diagnosis', async () => {
    // seed-condition-4
    await render({
      clinicalStatus: clinical('active'),
      verificationStatus: verification('provisional'),
      code: { text: 'Type 2 diabetes' },
    });

    expect(texts('.badge.ongoing')).toEqual(['Active']);
    expect(texts('.badge.uncertain')).toEqual(['Provisional']);
    expect(element.querySelector('.name.void')).toBeNull();
  });

  it('strikes through a condition that was entered in error', async () => {
    await render({
      verificationStatus: verification('entered-in-error'),
      code: { text: 'Asthma' },
    });

    expect(element.querySelector('.name.void')?.textContent).toBe('Asthma');
    expect(texts('.badge.void')).toEqual(['Entered in error']);
  });

  it('leaves out what the condition does not have', async () => {
    await render({ id: 'c9' });

    expect(texts('.name')).toEqual(['Condition/c9']);
    expect(element.querySelectorAll('.badge, .details > span, app-coding-chip')).toHaveLength(0);
  });
});
