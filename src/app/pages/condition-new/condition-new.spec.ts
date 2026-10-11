import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { Condition, OperationOutcome, Patient } from 'fhir/r4';
import { ConditionNew } from './condition-new';

describe('ConditionNew', () => {
  let fixture: ComponentFixture<ConditionNew>;
  let element: HTMLElement;
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  /** Answers the page's read of the patient. */
  const loadPatient = async () => {
    TestBed.tick();
    http.expectOne('/fhir/Patient/seed-patient-3').flush({
      resourceType: 'Patient',
      id: 'seed-patient-3',
      name: [{ family: 'Varga', given: ['Ilse'] }],
    } satisfies Patient);
    await fixture.whenStable();
  };

  /** Names the condition and submits the form. */
  const submitForm = async () => {
    const text = element.querySelector<HTMLInputElement>('[formControlName="text"]')!;
    text.value = 'Asthma';
    text.dispatchEvent(new Event('input'));
    element.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConditionNew],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(ConditionNew);
    element = fixture.nativeElement;
    fixture.componentRef.setInput('id', 'seed-patient-3');
  });

  afterEach(() => http.verify());

  it('says whom the condition is for', async () => {
    await loadPatient();

    expect(element.querySelector('h1')?.textContent).toContain('for Ilse Varga');
  });

  it('creates the condition for the patient and opens it', async () => {
    await loadPatient();
    await submitForm();

    const req = http.expectOne('/fhir/Condition');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.subject).toEqual({
      reference: 'Patient/seed-patient-3',
      display: 'Ilse Varga',
    });
    expect(req.request.body.code).toEqual({ text: 'Asthma' });
    req.flush({ ...req.request.body, id: 'new-condition' } satisfies Condition);

    expect(navigate).toHaveBeenCalledWith([
      '/patients',
      'seed-patient-3',
      'conditions',
      'new-condition',
    ]);
  });

  it("shows the server's error and keeps the form", async () => {
    await loadPatient();
    await submitForm();
    http.expectOne('/fhir/Condition').flush(
      {
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'invalid', diagnostics: 'Condition.code: bad' }],
      } satisfies OperationOutcome,
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await fixture.whenStable();

    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'The condition was not saved: Condition.code: bad',
    );
    expect(element.querySelector('app-condition-form')).not.toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });
});
