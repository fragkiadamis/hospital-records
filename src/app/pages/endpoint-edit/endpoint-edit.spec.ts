import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { Endpoint, OperationOutcome } from 'fhir/r4';
import { EndpointEdit } from './endpoint-edit';

const stored: Endpoint = {
  resourceType: 'Endpoint',
  id: 'pacs-dicomweb',
  meta: { versionId: '3' },
  status: 'active',
  connectionType: { code: 'dicom-wado-rs' },
  name: 'Hospital PACS',
  payloadType: [{ text: 'DICOM' }],
  address: 'http://localhost:8042/dicom-web',
  header: ['X-Trace: on'],
};

describe('EndpointEdit', () => {
  let fixture: ComponentFixture<EndpointEdit>;
  let element: HTMLElement;
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  const load = async (endpoint: Endpoint) => {
    TestBed.tick();
    http.expectOne(`/fhir/Endpoint/${endpoint.id}`).flush(endpoint);
    await fixture.whenStable();
  };

  const nameField = () => element.querySelector<HTMLInputElement>('[formControlName="name"]')!;

  /** Changes the name and submits; returns the PUT the page sent. */
  const editAndSave = async (name: string) => {
    nameField().value = name;
    nameField().dispatchEvent(new Event('input'));
    element.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
    return http.expectOne((r) => r.method === 'PUT');
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EndpointEdit],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(EndpointEdit);
    element = fixture.nativeElement;
    fixture.componentRef.setInput('id', 'pacs-dicomweb');
  });

  afterEach(() => http.verify());

  it('saves with the loaded version as If-Match, keeping other fields, then opens the endpoint', async () => {
    await load(stored);
    expect(nameField().value).toBe('Hospital PACS');

    const req = await editAndSave('Orthanc');

    expect(req.request.url).toBe('/fhir/Endpoint/pacs-dicomweb');
    expect(req.request.headers.get('If-Match')).toBe('W/"3"');
    expect(req.request.body.name).toBe('Orthanc');
    expect(req.request.body.header).toEqual(['X-Trace: on']);
    req.flush({ ...req.request.body, meta: { versionId: '4' } });

    expect(navigate).toHaveBeenCalledWith(['/endpoints', 'pacs-dicomweb']);
  });

  it('explains a version conflict and loads the latest version on request', async () => {
    await load(stored);
    const req = await editAndSave('Orthanc');
    req.flush(
      {
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'conflict', diagnostics: 'HAPI-0989: not current' }],
      } satisfies OperationOutcome,
      { status: 409, statusText: 'Conflict' },
    );
    await fixture.whenStable();

    const alert = element.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Someone else changed this endpoint');
    expect(navigate).not.toHaveBeenCalled();

    alert?.querySelector('button')?.click();
    await load({ ...stored, meta: { versionId: '4' }, name: 'PACS (renamed)' });
    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(nameField().value).toBe('PACS (renamed)');
  });
});
