import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Condition, ValueSet } from 'fhir/r4';
import { CodeSystems } from '../../../code-systems';
import { ConditionForm } from './condition-form';

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

  /** The code field of one system ("SNOMED CT", "ICD-10"). */
  const codeField = (system: string) =>
    [...element.querySelectorAll('.code-field')].find(
      (f) => f.querySelector('.field-label')?.textContent === system,
    )!;

  /** Switches a system from the search box to typing the code by hand. */
  const byHand = async (system: string) => {
    codeField(system).querySelector<HTMLButtonElement>('.link-button')!.click();
    await fixture.whenStable();
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
    set('text', 'Pneumonia');
    await byHand('SNOMED CT');
    await byHand('ICD-10');
    set('snomedCode', '233604007');
    set('snomedDisplay', 'Pneumonia');
    set('icd10Code', 'j18.9');
    set('verificationStatus', 'confirmed');
    set('onsetDate', '2026-01-08');
    await submit();

    expect(errors()).toEqual([]);
    expect(saved[0]).toMatchObject({
      resourceType: 'Condition',
      subject,
      code: {
        text: 'Pneumonia',
        coding: [
          { system: CodeSystems.snomed, code: '233604007', display: 'Pneumonia' },
          { system: CodeSystems.icd10, code: 'J18.9' }, // upper-cased
        ],
      },
      clinicalStatus: { coding: [{ code: 'active' }] },
      verificationStatus: { coding: [{ code: 'confirmed' }] },
      onsetDateTime: '2026-01-08',
    });
  });

  it('needs a name or a code, and codes in the right format', async () => {
    await submit();
    expect(errors()).toEqual(['Enter a name or at least one code.']);

    await byHand('SNOMED CT');
    await byHand('ICD-10');
    set('snomedCode', '12ab');
    set('icd10Code', 'C5');
    set('icd10Display', 'Breast cancer');
    await submit();

    expect(saved).toHaveLength(0);
    expect(errors()).toEqual([
      'A SNOMED CT code is 6 to 18 digits.',
      'An ICD-10 code looks like C50.9.',
    ]);
  });

  it('asks for the code when only its name is filled in', async () => {
    set('text', 'Asthma');
    await byHand('ICD-10');
    set('icd10Display', 'Asthma');
    await submit();

    expect(saved).toHaveLength(0);
    expect(errors()).toEqual(['Enter the code for this name.']);
  });

  it('enforces con-4: an ended condition cannot be active', async () => {
    set('text', 'Pneumonia');
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
    set('text', 'Asthma');
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
    set('text', 'Pneumonia');
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

  it('fills in a stored condition, keeping an onset the date field cannot show', async () => {
    fixture.componentRef.setInput('condition', {
      resourceType: 'Condition',
      id: 'seed-condition-4',
      meta: { versionId: '1' },
      subject,
      clinicalStatus: { coding: [{ system: CodeSystems.conditionClinical, code: 'active' }] },
      code: { text: 'Type 2 diabetes' },
      onsetAge: { value: 61, unit: 'years' },
    } satisfies Condition);
    await fixture.whenStable();

    expect(field('text').value).toBe('Type 2 diabetes');
    expect(element.querySelector('.hint')?.textContent).toContain('Stored as "at age 61 years"');

    set('verificationStatus', 'provisional');
    await submit();
    expect(saved[0]).toMatchObject({
      id: 'seed-condition-4',
      meta: { versionId: '1' },
      onsetAge: { value: 61, unit: 'years' },
      verificationStatus: { coding: [{ code: 'provisional' }] },
    });
  });

  it('picks codes with the search, which also names a new condition', async () => {
    const search =
      codeField('SNOMED CT').querySelector<HTMLInputElement>('input[role="combobox"]')!;
    search.value = 'pneum';
    search.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 350)); // the search's debounce
    TestBed.tick();
    http.expectOne('/tx/ValueSet/$expand').flush({
      resourceType: 'ValueSet',
      status: 'active',
      expansion: {
        timestamp: '2026-10-11',
        contains: [{ system: CodeSystems.snomed, code: '233604007', display: 'Pneumonia' }],
      },
    } satisfies ValueSet);
    await fixture.whenStable();
    codeField('SNOMED CT')
      .querySelector('[role="option"]')!
      .dispatchEvent(new MouseEvent('mousedown'));
    TestBed.tick();
    // A chosen SNOMED code asks the ICD-10 map for suggestions; this server has none.
    http
      .expectOne((r) => r.url === '/tx/ConceptMap/$translate')
      .flush({ resourceType: 'Parameters', parameter: [{ name: 'result', valueBoolean: false }] });
    await fixture.whenStable();

    expect(field('text').value).toBe('Pneumonia');
    expect(codeField('SNOMED CT').querySelector('app-coding-chip .code')?.textContent).toBe(
      '233604007',
    );

    await submit();
    expect(saved[0].code).toEqual({
      text: 'Pneumonia',
      coding: [{ system: CodeSystems.snomed, code: '233604007', display: 'Pneumonia' }],
    });
  });

  it('shows stored codes as chips that can be changed', async () => {
    fixture.componentRef.setInput('condition', {
      resourceType: 'Condition',
      subject,
      clinicalStatus: { coding: [{ system: CodeSystems.conditionClinical, code: 'active' }] },
      code: {
        text: 'Breast cancer',
        coding: [{ system: CodeSystems.icd10, code: 'C50.9', display: 'Breast, unspecified' }],
      },
    } satisfies Condition);
    await fixture.whenStable();

    expect(codeField('ICD-10').querySelector('.display')?.textContent).toBe('Breast, unspecified');

    codeField('ICD-10').querySelector<HTMLButtonElement>('button.change')!.click();
    await fixture.whenStable();
    await submit();
    expect(saved[0].code).toEqual({ text: 'Breast cancer' });
  });

  it('opens the hand-entry fields for a stored code in the wrong format', async () => {
    fixture.componentRef.setInput('condition', {
      resourceType: 'Condition',
      subject,
      clinicalStatus: { coding: [{ system: CodeSystems.conditionClinical, code: 'active' }] },
      code: { coding: [{ system: CodeSystems.snomed, code: 'not-a-code' }] },
    } satisfies Condition);
    await fixture.whenStable();
    await submit();

    expect(field('snomedCode').value).toBe('not-a-code');
    expect(errors()).toContain('A SNOMED CT code is 6 to 18 digits.');
  });

  it("offers the official map's ICD-10 codes for the chosen SNOMED concept, applied only on request", async () => {
    fixture.componentRef.setInput('condition', {
      resourceType: 'Condition',
      subject,
      clinicalStatus: { coding: [{ system: CodeSystems.conditionClinical, code: 'active' }] },
      code: {
        text: 'Pneumonia',
        coding: [{ system: CodeSystems.snomed, code: '233604007', display: 'Pneumonia' }],
      },
    } satisfies Condition);
    TestBed.tick();
    const req = http.expectOne((r) => r.url === '/tx/ConceptMap/$translate');
    expect(req.request.params.get('code')).toBe('233604007');
    req.flush({
      resourceType: 'Parameters',
      parameter: [
        { name: 'result', valueBoolean: true },
        {
          name: 'match',
          part: [
            { name: 'equivalence', valueCode: 'equivalent' },
            {
              name: 'concept',
              valueCoding: {
                system: CodeSystems.icd10,
                code: 'J18.9',
                display: 'Pneumonia, unspecified',
              },
            },
          ],
        },
      ],
    });
    await fixture.whenStable();

    const suggestions = codeField('ICD-10').querySelector('.suggestions');
    expect(suggestions?.textContent).toContain('J18.9');
    expect(field('icd10Code')).toBeNull(); // nothing filled in by itself

    suggestions!.querySelector<HTMLButtonElement>('button')!.click();
    await fixture.whenStable();
    expect(codeField('ICD-10').querySelector('.suggestions')).toBeNull();

    await submit();
    expect(saved[0].code?.coding).toEqual([
      { system: CodeSystems.snomed, code: '233604007', display: 'Pneumonia' },
      { system: CodeSystems.icd10, code: 'J18.9', display: 'Pneumonia, unspecified' },
    ]);
  });
});
