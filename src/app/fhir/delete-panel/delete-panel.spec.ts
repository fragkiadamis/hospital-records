import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Bundle, BundleEntry, FhirResource } from 'fhir/r4';
import { of } from 'rxjs';
import { DeletePanel } from './delete-panel';

const subject = { reference: 'Patient/seed-patient-1' };
const hypertension: FhirResource = {
  resourceType: 'Condition',
  id: 'seed-condition-2',
  subject,
};

describe('DeletePanel', () => {
  let fixture: ComponentFixture<DeletePanel>;
  let element: HTMLElement;
  let http: HttpTestingController;
  let deleted: number;

  const text = () => element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const button = (label: string) =>
    [...element.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === label,
    );

  /** Opens the panel and answers the linked-records check with `linked` resources. */
  const openWith = async (linked: BundleEntry<FhirResource>[] = []) => {
    fixture.componentRef.setInput('open', true);
    await fixture.whenStable();
    const req = http.expectOne((r) => r.url === '/fhir/Condition');
    expect(req.request.params.get('_id')).toBe('seed-condition-2');
    expect(req.request.params.get('_revinclude')).toBe('*');
    req.flush({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: hypertension, search: { mode: 'match' } }, ...linked],
    } satisfies Bundle<FhirResource>);
    await fixture.whenStable();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeletePanel],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(DeletePanel);
    element = fixture.nativeElement;
    fixture.componentRef.setInput('resourceType', 'Condition');
    fixture.componentRef.setInput('resourceId', 'seed-condition-2');
    fixture.componentRef.setInput('name', 'Hypertension');
    fixture.componentRef.setInput('noun', 'condition');
    deleted = 0;
    fixture.componentInstance.deleted.subscribe(() => deleted++);
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  it('shows nothing until opened', () => {
    expect(text()).toBe('');
  });

  it('deletes a resource nothing points to, after confirmation', async () => {
    await openWith();
    expect(text()).toContain('Delete Hypertension? The condition is removed');

    button('Delete condition')!.click();
    const req = http.expectOne('/fhir/Condition/seed-condition-2');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    await fixture.whenStable();

    expect(deleted).toBe(1);
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('refuses while other records point to the resource', async () => {
    await openWith([
      {
        resource: {
          resourceType: 'ImagingStudy',
          id: 's1',
          status: 'available',
          subject,
          reasonReference: [{ reference: 'Condition/seed-condition-2' }],
        },
        search: { mode: 'include' },
      },
    ]);

    expect(text()).toContain("Hypertension can't be deleted");
    expect(text()).toContain('ImagingStudy (1)');
    expect(button('Delete condition')).toBeUndefined();

    button('Close')!.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('does not offer the delete when the check fails, and can try again', async () => {
    fixture.componentRef.setInput('open', true);
    await fixture.whenStable();
    http.expectOne((r) => r.url === '/fhir/Condition').flush({}, { status: 500, statusText: 'x' });
    await fixture.whenStable();

    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      "Linked records could not be checked, so the condition can't be deleted safely",
    );
    expect(button('Delete condition')).toBeUndefined();

    button('Try again')!.click();
    await fixture.whenStable();
    http
      .expectOne((r) => r.url === '/fhir/Condition')
      .flush({ resourceType: 'Bundle', type: 'searchset' });
    await fixture.whenStable();
    expect(button('Delete condition')).toBeDefined();
  });

  it('adds the links found by extraLinks to those found by _revinclude', async () => {
    fixture.componentRef.setInput('extraLinks', () => of([{ type: 'ImagingStudy', count: 2 }]));
    await openWith([
      {
        resource: { resourceType: 'ImagingStudy', id: 's1', status: 'available', subject },
        search: { mode: 'include' },
      },
    ]);

    expect(text()).toContain('ImagingStudy (3)');
    expect(button('Delete condition')).toBeUndefined();
  });

  it('shows a note before confirming, when given one', async () => {
    fixture.componentRef.setInput('note', 'The next PACS sync will create it again.');
    await openWith();

    expect(element.querySelector('.note')?.textContent).toBe(
      'The next PACS sync will create it again.',
    );
  });
});
