import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { IcdMaps } from '../../fhir/terminology/icd-maps';
import type { Condition, OperationOutcome } from 'fhir/r4';
import { CodeSystems } from '../../fhir/code-systems';
import { ConditionEdit } from './condition-edit';

const stored: Condition = {
  resourceType: 'Condition',
  id: 'seed-condition-4',
  meta: { versionId: '3' },
  subject: { reference: 'Patient/seed-patient-2', display: 'Nikos Andreou' },
  clinicalStatus: { coding: [{ system: CodeSystems.conditionClinical, code: 'active' }] },
  verificationStatus: {
    coding: [{ system: CodeSystems.conditionVerification, code: 'provisional' }],
  },
  code: {
    text: 'Type 2 diabetes',
    coding: [{ system: CodeSystems.icd10, code: 'E11.9', display: 'Type 2 diabetes mellitus' }],
  },
  note: [{ text: 'HbA1c pending' }],
};

describe('ConditionEdit', () => {
  let fixture: ComponentFixture<ConditionEdit>;
  let element: HTMLElement;
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  /** Opens the edit page of `stored` under `patientId` and answers the read with `condition`. */
  const open = async (condition: Condition = stored, patientId = 'seed-patient-2') => {
    fixture.componentRef.setInput('id', patientId);
    fixture.componentRef.setInput('conditionId', 'seed-condition-4');
    TestBed.tick();
    http.expectOne('/fhir/Condition/seed-condition-4').flush(condition);
    await fixture.whenStable();
  };

  /** Changes the verification and submits; returns the PUT the page sent. */
  const editAndSave = async (verification: string) => {
    const select = element.querySelector<HTMLSelectElement>(
      '[formControlName="verificationStatus"]',
    )!;
    select.value = verification;
    select.dispatchEvent(new Event('change'));
    element.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
    return http.expectOne((r) => r.method === 'PUT');
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConditionEdit],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        // The ICD-10 ↔ ICD-11 mapping has its own tests; here it maps nothing.
        { provide: IcdMaps, useValue: { icd11For: () => of(null), icd10For: () => of(null) } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(ConditionEdit);
    element = fixture.nativeElement;
  });

  afterEach(() => http.verify());

  it('saves with the loaded version as If-Match, keeping other fields, then opens the condition', async () => {
    await open();
    const req = await editAndSave('confirmed');

    expect(req.request.url).toBe('/fhir/Condition/seed-condition-4');
    expect(req.request.headers.get('If-Match')).toBe('W/"3"');
    expect(req.request.body.verificationStatus.coding[0].code).toBe('confirmed');
    expect(req.request.body.subject).toEqual(stored.subject);
    expect(req.request.body.note).toEqual([{ text: 'HbA1c pending' }]);
    req.flush({ ...req.request.body, meta: { versionId: '4' } });

    expect(navigate).toHaveBeenCalledWith([
      '/patients',
      'seed-patient-2',
      'conditions',
      'seed-condition-4',
    ]);
  });

  it('explains a version conflict and loads the latest version on request', async () => {
    await open();
    const req = await editAndSave('confirmed');
    req.flush(
      {
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'conflict', diagnostics: 'HAPI-0989: not current' }],
      } satisfies OperationOutcome,
      { status: 409, statusText: 'Conflict' },
    );
    await fixture.whenStable();

    const alert = element.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Someone else changed this condition');

    alert?.querySelector('button')?.click();
    TestBed.tick();
    http.expectOne('/fhir/Condition/seed-condition-4').flush({
      ...stored,
      meta: { versionId: '4' },
      code: { coding: [{ system: CodeSystems.icd10, code: 'E11.8' }] },
    });
    await fixture.whenStable();

    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(element.querySelector('app-coding-chip .code')?.textContent).toBe('E11.8');
  });

  it('refuses to edit a condition under a patient it does not belong to', async () => {
    await open(stored, 'seed-patient-1');

    expect(element.querySelector('app-condition-form')).toBeNull();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'This condition does not belong to this patient.',
    );
  });
});
