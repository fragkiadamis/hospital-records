import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { OperationOutcome, Patient } from 'fhir/r4';
import { PatientNew } from './patient-new';

describe('PatientNew', () => {
  let fixture: ComponentFixture<PatientNew>;
  let element: HTMLElement;
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  /** Fills in a family name and submits the form. */
  const submitForm = async () => {
    const family = element.querySelector<HTMLInputElement>('[formControlName="family"]')!;
    family.value = 'Varga';
    family.dispatchEvent(new Event('input'));
    element.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PatientNew],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(PatientNew);
    element = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  it('creates the patient and opens its page', async () => {
    await submitForm();

    const req = http.expectOne('/fhir/Patient');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.name).toEqual([{ use: 'official', family: 'Varga' }]);
    req.flush({ ...req.request.body, id: 'new-id' } satisfies Patient);

    expect(navigate).toHaveBeenCalledWith(['/patients', 'new-id']);
  });

  it("shows the server's error and lets the user try again", async () => {
    await submitForm();
    http.expectOne('/fhir/Patient').flush(
      {
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'invalid', diagnostics: 'Patient.gender: bad code' }],
      } satisfies OperationOutcome,
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await fixture.whenStable();

    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'Patient.gender: bad code',
    );
    expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('goes back to the list on cancel', async () => {
    element.querySelector<HTMLButtonElement>('button[type="button"]')!.click();

    expect(navigate).toHaveBeenCalledWith(['/patients']);
  });
});
