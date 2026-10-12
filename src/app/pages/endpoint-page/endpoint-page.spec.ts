import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import type { Bundle, BundleEntry, Endpoint, FhirResource } from 'fhir/r4';
import { EndpointPage } from './endpoint-page';

const pacs: Endpoint = {
  resourceType: 'Endpoint',
  id: 'pacs-dicomweb',
  status: 'active',
  connectionType: { code: 'dicom-wado-rs' },
  name: 'Hospital PACS',
  payloadType: [{ text: 'DICOM' }],
  address: 'http://localhost:8042/dicom-web',
};

describe('EndpointPage', () => {
  let fixture: ComponentFixture<EndpointPage>;
  let element: HTMLElement;
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  const respond = async (id: string, body: object, status = 200) => {
    fixture.componentRef.setInput('id', id);
    TestBed.tick();
    http.expectOne(`/fhir/Endpoint/${id}`).flush(body, { status, statusText: 'OK' });
    await fixture.whenStable();
  };

  const button = (text: string) =>
    [...element.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === text,
    );

  /** Clicks Delete and answers the linked-records check with `linked` resources. */
  const startDelete = async (linked: BundleEntry<FhirResource>[] = []) => {
    button('Delete')!.click();
    await fixture.whenStable();
    http
      .expectOne((r) => r.url === '/fhir/Endpoint' && r.params.get('_revinclude') === '*')
      .flush({
        resourceType: 'Bundle',
        type: 'searchset',
        entry: [{ resource: pacs, search: { mode: 'match' } }, ...linked],
      } satisfies Bundle<FhirResource>);
    await fixture.whenStable();
  };

  const panelText = () =>
    element.querySelector('app-delete-panel .panel')?.textContent?.replace(/\s+/g, ' ').trim();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EndpointPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(EndpointPage);
    element = fixture.nativeElement;
  });

  afterEach(() => http.verify());

  it('reads the endpoint from the route id and shows it', async () => {
    await respond('pacs-dicomweb', pacs);

    expect(element.querySelector('app-endpoint-detail h2')?.textContent).toBe('Hospital PACS');
    expect(TestBed.inject(Title).getTitle()).toBe('Hospital PACS · Hospital Records');
    expect(element.querySelector('a.back')?.getAttribute('href')).toBe('/endpoints');
    expect(element.querySelector('a[href$="/edit"]')?.getAttribute('href')).toBe(
      '/endpoints/pacs-dicomweb/edit',
    );
  });

  it('says when the endpoint does not exist', async () => {
    await respond('missing', {}, 404);

    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'The resource was not found (HTTP 404)',
    );
    expect(button('Delete')).toBeUndefined();
  });

  it('deletes an endpoint nothing points to, then goes back to the list', async () => {
    await respond('pacs-dicomweb', pacs);
    await startDelete();
    expect(panelText()).toContain('Delete Hospital PACS?');

    button('Delete endpoint')!.click();
    const req = http.expectOne('/fhir/Endpoint/pacs-dicomweb');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    expect(navigate).toHaveBeenCalledWith(['/endpoints']);
  });

  it('does not offer to delete an endpoint imaging studies point to', async () => {
    await respond('pacs-dicomweb', pacs);
    const study = (id: string) => ({
      resource: {
        resourceType: 'ImagingStudy' as const,
        id,
        status: 'available' as const,
        subject: { reference: 'Patient/p1' },
        endpoint: [{ reference: 'Endpoint/pacs-dicomweb' }],
      },
      search: { mode: 'include' as const },
    });
    await startDelete([study('s1'), study('s2')]);

    expect(panelText()).toContain("Hospital PACS can't be deleted");
    expect(panelText()).toContain('ImagingStudy (2)');
    expect(button('Delete endpoint')).toBeUndefined();
  });
});
