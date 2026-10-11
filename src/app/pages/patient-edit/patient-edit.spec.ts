import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { OperationOutcome, Patient } from 'fhir/r4';
import { PatientEdit } from './patient-edit';

const stored: Patient = {
  resourceType: 'Patient',
  id: 'seed-patient-1',
  meta: { versionId: '3' },
  name: [{ use: 'official', family: 'Kostaki', given: ['Daphne'] }],
  address: [{ city: 'Athens' }],
};

describe('PatientEdit', () => {
  let fixture: ComponentFixture<PatientEdit>;
  let element: HTMLElement;
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  /** Answers the page's read of the patient. */
  const load = async (patient: Patient) => {
    TestBed.tick();
    http.expectOne(`/fhir/Patient/${patient.id}`).flush(patient);
    await fixture.whenStable();
  };

  /** Changes the given names and submits; returns the PUT the page sent. */
  const editAndSave = async (given: string) => {
    const input = element.querySelector<HTMLInputElement>('[formControlName="given"]')!;
    input.value = given;
    input.dispatchEvent(new Event('input'));
    element.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
    return http.expectOne((r) => r.method === 'PUT');
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PatientEdit],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(PatientEdit);
    element = fixture.nativeElement;
    fixture.componentRef.setInput('id', 'seed-patient-1');
  });

  afterEach(() => http.verify());

  it('fills the form with the stored patient', async () => {
    await load(stored);

    expect(element.querySelector<HTMLInputElement>('[formControlName="family"]')!.value).toBe(
      'Kostaki',
    );
  });

  it('saves with the loaded version as If-Match, keeping other fields, then opens the patient', async () => {
    await load(stored);
    const req = await editAndSave('Daphne Maria');

    expect(req.request.url).toBe('/fhir/Patient/seed-patient-1');
    expect(req.request.headers.get('If-Match')).toBe('W/"3"');
    expect(req.request.body.name[0].given).toEqual(['Daphne', 'Maria']);
    expect(req.request.body.address).toEqual([{ city: 'Athens' }]);
    req.flush({ ...req.request.body, meta: { versionId: '4' } });

    expect(navigate).toHaveBeenCalledWith(['/patients', 'seed-patient-1']);
  });

  it('explains a version conflict and loads the latest version on request', async () => {
    await load(stored);
    const req = await editAndSave('Daphne Maria');
    req.flush(
      {
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'conflict', diagnostics: 'HAPI-0989: not current' }],
      } satisfies OperationOutcome,
      { status: 409, statusText: 'Conflict' },
    );
    await fixture.whenStable();

    const alert = element.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Someone else changed this patient');
    expect(navigate).not.toHaveBeenCalled();

    alert?.querySelector('button')?.click();
    await load({ ...stored, meta: { versionId: '4' }, name: [{ family: 'Kostaki-Lee' }] });

    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(element.querySelector<HTMLInputElement>('[formControlName="family"]')!.value).toBe(
      'Kostaki-Lee',
    );
  });

  it("shows other save errors with the server's message", async () => {
    await load(stored);
    const req = await editAndSave('Daphne');
    req.flush(
      {
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'invalid', diagnostics: 'Patient.name: too long' }],
      } satisfies OperationOutcome,
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await fixture.whenStable();

    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'The patient was not saved: Patient.name: too long',
    );
  });
});
