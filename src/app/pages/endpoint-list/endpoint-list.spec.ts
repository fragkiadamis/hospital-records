import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Bundle, Endpoint, OperationOutcome } from 'fhir/r4';
import { EndpointList } from './endpoint-list';

const endpoint = (id: string, name: string): Endpoint => ({
  resourceType: 'Endpoint',
  id,
  name,
  status: 'active',
  connectionType: { code: 'dicom-wado-rs' },
  payloadType: [{ text: 'DICOM' }],
  address: `http://${id}/dicom-web`,
});

describe('EndpointList', () => {
  let fixture: ComponentFixture<EndpointList>;
  let element: HTMLElement;
  let http: HttpTestingController;

  /** Answers the page's search, then lets it render. */
  const respond = async (body: object, status = 200) => {
    TestBed.tick();
    const req = http.expectOne((r) => r.url === '/fhir/Endpoint');
    req.flush(body, { status, statusText: status === 200 ? 'OK' : 'Error' });
    await fixture.whenStable();
    return req.request;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EndpointList],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(EndpointList);
    element = fixture.nativeElement;
  });

  afterEach(() => http.verify());

  it('lists the endpoints by name, each linking to its page', async () => {
    const request = await respond({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        { resource: endpoint('pacs', 'Hospital PACS') },
        { resource: endpoint('fhir', 'Regional FHIR') },
      ],
    } satisfies Bundle<Endpoint>);

    expect(request.params.get('_sort')).toBe('name');
    const names = [...element.querySelectorAll('app-endpoint-summary .name')].map(
      (n) => n.textContent,
    );
    expect(names).toEqual(['Hospital PACS', 'Regional FHIR']);
    const links = [...element.querySelectorAll('.list a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/endpoints/pacs', '/endpoints/fhir']);
    expect(element.querySelector('a[href="/endpoints/new"]')).not.toBeNull();
  });

  it('says so when there are no endpoints', async () => {
    await respond({ resourceType: 'Bundle', type: 'searchset' } satisfies Bundle);

    expect(element.querySelector('.state')?.textContent).toContain('No endpoints yet.');
  });

  it("shows the server's error and can try again", async () => {
    await respond(
      {
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'exception', diagnostics: 'Database is down' }],
      } satisfies OperationOutcome,
      500,
    );
    const alert = element.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Database is down');

    alert?.querySelector('button')?.click();
    await respond({ resourceType: 'Bundle', type: 'searchset' } satisfies Bundle);
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });
});
