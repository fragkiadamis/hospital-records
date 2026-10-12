import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { Endpoint, OperationOutcome } from 'fhir/r4';
import { EndpointNew } from './endpoint-new';

describe('EndpointNew', () => {
  let fixture: ComponentFixture<EndpointNew>;
  let element: HTMLElement;
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  /** Fills in an address and submits the form. */
  const submitForm = async () => {
    const address = element.querySelector<HTMLInputElement>('[formControlName="address"]')!;
    address.value = 'http://localhost:8042/dicom-web';
    address.dispatchEvent(new Event('input'));
    element.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EndpointNew],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(EndpointNew);
    element = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  it('creates the endpoint and opens its page', async () => {
    await submitForm();

    const req = http.expectOne('/fhir/Endpoint');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.address).toBe('http://localhost:8042/dicom-web');
    req.flush({ ...req.request.body, id: 'new-id' } satisfies Endpoint);

    expect(navigate).toHaveBeenCalledWith(['/endpoints', 'new-id']);
  });

  it("shows the server's error and lets the user try again", async () => {
    await submitForm();
    http.expectOne('/fhir/Endpoint').flush(
      {
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'invalid', diagnostics: 'Endpoint.address: bad' }],
      } satisfies OperationOutcome,
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await fixture.whenStable();

    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'The endpoint was not saved: Endpoint.address: bad',
    );
    expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('goes back to the list on cancel', async () => {
    element.querySelector<HTMLButtonElement>('button[type="button"]')!.click();

    expect(navigate).toHaveBeenCalledWith(['/endpoints']);
  });
});
