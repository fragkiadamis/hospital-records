import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Condition, ValueSet } from 'fhir/r4';
import { CodeSystems } from '../../../code-systems';
import { ConditionForm } from './condition-form';

const LOCAL = 'urn:other-hospital:diagnoses'; // a code system the form doesn't edit

const subject = { reference: 'Patient/seed-patient-2', display: 'Nikos Andreou' };

describe('ConditionForm', () => {
  let fixture: ComponentFixture<ConditionForm>;
  let element: HTMLElement;
  let saved: Condition[];
  let http: HttpTestingController;

  const field = <T extends HTMLInputElement | HTMLSelectElement>(name: string) =>
    element.querySelector<T>(`[formControlName="${name}"]`)!;

  /** Fills in a field the way a user does: input or change event, then leaving the field. */
  const set = (name: string, value: string) => {
    const control = field(name);
    control.value = value;
    control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? 'change' : 'input'));
    control.dispatchEvent(new Event('blur'));
  };

  /** Switches from the search box to typing the code by hand. */
  const byHand = async () => {
    element.querySelector<HTMLButtonElement>('.link-button')!.click();
    await fixture.whenStable();
  };

  /** Types an ICD-10 code by hand, for tests that just need a valid condition. */
  const withCode = async (code = 'J18.9') => {
    await byHand();
    set('icd10Code', code);
  };

  const submit = async () => {
    element.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
  };

  const errors = () =>
    [...element.querySelectorAll('.error')].map((e) => e.textContent?.replace(/\s+/g, ' ').trim());

  afterEach(() => http.verify());

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConditionForm],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ConditionForm);
    element = fixture.nativeElement;
    fixture.componentRef.setInput('subject', subject);
    saved = [];
    fixture.componentInstance.save.subscribe((condition) => saved.push(condition));
    await fixture.whenStable();
  });

  it('starts a new condition as an active problem, with no verification', () => {
    expect(field('clinicalStatus').value).toBe('active');
    expect(field('category').value).toBe('problem-list-item');
    expect(field('verificationStatus').value).toBe('');
  });

  it('emits the condition built from the fields, for the given patient', async () => {
    await withCode('j18.9');
    set('verificationStatus', 'confirmed');
    set('onsetDate', '2026-01-08');
    await submit();

    expect(errors()).toEqual([]);
    expect(saved[0]).toMatchObject({
      resourceType: 'Condition',
      subject,
      code: { coding: [{ system: CodeSystems.icd10, code: 'J18.9' }] }, // upper-cased
      clinicalStatus: { coding: [{ code: 'active' }] },
      verificationStatus: { coding: [{ code: 'confirmed' }] },
      onsetDateTime: '2026-01-08',
    });
    expect(saved[0].code?.text).toBeUndefined(); // the code's name is the condition's name
  });

  it('needs an ICD-10 code, in the right format', async () => {
    await submit();
    expect(errors()).toEqual(['Choose an ICD-10 code.']);

    await withCode('C5');
    await submit();

    expect(saved).toHaveLength(0);
    expect(errors()).toEqual(['An ICD-10 code looks like C50.9.']);
  });

  it('asks for the code when only its name is typed in', async () => {
    await byHand();
    set('icd10Display', 'Asthma');
    await submit();

    expect(saved).toHaveLength(0);
    expect(errors()).toEqual(['Enter the code for this name.', 'Choose an ICD-10 code.']);
  });

  it('enforces con-4: an ended condition cannot be active', async () => {
    await withCode();
    set('onsetDate', '2026-01-08');
    set('abatementDate', '2026-02-20');
    await submit();

    expect(saved).toHaveLength(0);
    expect(errors()[0]).toContain("A condition with an end date can't be active");

    set('clinicalStatus', 'resolved');
    await submit();
    expect(saved).toHaveLength(1);
  });

  it('enforces con-5 and con-3 for the clinical status', async () => {
    await withCode('J45.9');
    set('verificationStatus', 'entered-in-error');
    await submit();
    expect(errors()).toEqual([
      'A condition entered in error has no clinical status; set it to "Not recorded".',
    ]);

    set('verificationStatus', 'confirmed');
    set('clinicalStatus', '');
    await submit();
    expect(errors()).toEqual(['Problem list items need a clinical status.']);
    expect(saved).toHaveLength(0);
  });

  it('rejects dates in the future and an end before the onset', async () => {
    await withCode();
    set('clinicalStatus', 'resolved');
    set('onsetDate', '2999-01-01');
    set('abatementDate', '2020-01-01');
    await submit();

    expect(saved).toHaveLength(0);
    expect(errors()).toEqual([
      "The onset can't be in the future.",
      "The end can't be before the onset.",
    ]);
  });

  it('fills in a stored condition, keeping its name and an onset the date field cannot show', async () => {
    fixture.componentRef.setInput('condition', {
      resourceType: 'Condition',
      id: 'seed-condition-4',
      meta: { versionId: '1' },
      subject,
      clinicalStatus: { coding: [{ system: CodeSystems.conditionClinical, code: 'active' }] },
      code: {
        text: 'Type 2 diabetes',
        coding: [{ system: CodeSystems.icd10, code: 'E11.9', display: 'Type 2 diabetes mellitus' }],
      },
      onsetAge: { value: 61, unit: 'years' },
    } satisfies Condition);
    await fixture.whenStable();

    expect(element.querySelector('app-coding-chip .code')?.textContent).toBe('E11.9');
    expect(element.querySelector('.hint')?.textContent).toContain('Stored as "at age 61 years"');

    set('verificationStatus', 'provisional');
    await submit();
    expect(saved[0]).toMatchObject({
      id: 'seed-condition-4',
      meta: { versionId: '1' },
      code: { text: 'Type 2 diabetes' }, // same code, so its stored name stays
      onsetAge: { value: 61, unit: 'years' },
      verificationStatus: { coding: [{ code: 'provisional' }] },
    });
  });

  it('picks the code with the search', async () => {
    const search = element.querySelector<HTMLInputElement>('input[role="combobox"]')!;
    search.value = 'pneum';
    search.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 350)); // the search's debounce
    TestBed.tick();
    http.expectOne('/tx/ValueSet/$expand').flush({
      resourceType: 'ValueSet',
      status: 'active',
      expansion: {
        timestamp: '2026-10-11',
        contains: [{ system: CodeSystems.icd10, code: 'J18.9', display: 'Pneumonia, unspecified' }],
      },
    } satisfies ValueSet);
    await fixture.whenStable();
    element.querySelector('[role="option"]')!.dispatchEvent(new MouseEvent('mousedown'));
    await fixture.whenStable();

    expect(element.querySelector('app-coding-chip .code')?.textContent).toBe('J18.9');

    await submit();
    expect(saved[0].code).toEqual({
      coding: [{ system: CodeSystems.icd10, code: 'J18.9', display: 'Pneumonia, unspecified' }],
    });
  });

  it('changes a stored code, dropping its stale name and keeping codes of other systems', async () => {
    fixture.componentRef.setInput('condition', {
      resourceType: 'Condition',
      subject,
      clinicalStatus: { coding: [{ system: CodeSystems.conditionClinical, code: 'active' }] },
      code: {
        text: 'Breast cancer',
        coding: [
          { system: LOCAL, code: 'ONC-17', display: 'Breast carcinoma' }, // not the form's
          { system: CodeSystems.icd10, code: 'C50.9', display: 'Breast, unspecified' },
        ],
      },
    } satisfies Condition);
    await fixture.whenStable();

    expect(element.querySelector('.display')?.textContent).toBe('Breast, unspecified');

    element.querySelector<HTMLButtonElement>('button.change')!.click();
    await fixture.whenStable();
    await withCode('C50.4');
    await submit();
    expect(saved[0].code).toEqual({
      coding: [
        { system: LOCAL, code: 'ONC-17', display: 'Breast carcinoma' },
        { system: CodeSystems.icd10, code: 'C50.4' },
      ],
    });
  });

  it('opens the hand-entry fields for a stored code in the wrong format', async () => {
    fixture.componentRef.setInput('condition', {
      resourceType: 'Condition',
      subject,
      clinicalStatus: { coding: [{ system: CodeSystems.conditionClinical, code: 'active' }] },
      code: { coding: [{ system: CodeSystems.icd10, code: 'not-a-code' }] },
    } satisfies Condition);
    await fixture.whenStable();
    await submit();

    expect(field('icd10Code').value).toBe('not-a-code');
    expect(errors()).toContain('An ICD-10 code looks like C50.9.');
  });
});
