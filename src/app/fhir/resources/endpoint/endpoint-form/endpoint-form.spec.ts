import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Endpoint } from 'fhir/r4';
import { CodeSystems } from '../../../code-systems';
import { EndpointForm } from './endpoint-form';

describe('EndpointForm', () => {
  let fixture: ComponentFixture<EndpointForm>;
  let element: HTMLElement;
  let saved: Endpoint[];

  const field = <T extends HTMLInputElement | HTMLSelectElement>(name: string) =>
    element.querySelector<T>(`[formControlName="${name}"]`)!;

  /** Types into a field the way a user does: input event, then leaving the field. */
  const type = (name: string, value: string) => {
    const control = field(name);
    control.value = value;
    control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? 'change' : 'input'));
    control.dispatchEvent(new Event('blur'));
  };

  const submit = async () => {
    element.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
  };

  const errors = () => [...element.querySelectorAll('.error')].map((e) => e.textContent?.trim());

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [EndpointForm] }).compileComponents();
    fixture = TestBed.createComponent(EndpointForm);
    element = fixture.nativeElement;
    saved = [];
    fixture.componentInstance.save.subscribe((endpoint) => saved.push(endpoint));
    await fixture.whenStable();
  });

  it('starts as an active DICOMweb endpoint for DICOM', () => {
    expect(field('status').value).toBe('active');
    expect(field('connectionType').value).toBe('dicom-wado-rs');
    expect(field('payloadType').value).toBe('DICOM');
    expect(field('payloadMimeTypes').value).toBe('application/dicom');
  });

  it('emits the endpoint built from the filled-in fields', async () => {
    type('name', 'Hospital PACS');
    type('address', 'http://localhost:8042/dicom-web');
    await submit();

    expect(errors()).toEqual([]);
    expect(saved[0]).toMatchObject({
      resourceType: 'Endpoint',
      status: 'active',
      name: 'Hospital PACS',
      connectionType: { system: CodeSystems.endpointConnectionType, code: 'dicom-wado-rs' },
      address: 'http://localhost:8042/dicom-web',
      payloadType: [{ text: 'DICOM' }],
      payloadMimeType: ['application/dicom'],
    });
  });

  it('requires an address and a payload type', async () => {
    type('payloadType', '');
    await submit();

    expect(saved).toHaveLength(0);
    expect(errors()).toEqual([
      "Enter the endpoint's address.",
      'Say what the endpoint sends, e.g. DICOM.',
    ]);
  });

  it('wants the address with its scheme', async () => {
    for (const address of ['localhost:8042/dicom-web', 'pacs.local/dicom-web', '/dicom-web']) {
      type('address', address);
      await submit();
      expect(saved).toHaveLength(0);
      expect(errors()).toEqual(['Enter a full address, starting with its scheme (e.g. http://).']);
    }

    type('address', 'mllp://ris.local:2575');
    await submit();
    expect(saved).toHaveLength(1);
  });

  it('fills in a stored endpoint, keeping a connection type it does not offer', async () => {
    fixture.componentRef.setInput('endpoint', {
      resourceType: 'Endpoint',
      id: 'e1',
      meta: { versionId: '2' },
      status: 'test',
      connectionType: {
        system: CodeSystems.endpointConnectionType,
        code: 'ihe-xds',
        display: 'IHE XDS',
      },
      payloadType: [{ text: 'Documents' }],
      address: 'https://xds.local/registry',
      header: ['X-Trace: on'],
    } satisfies Endpoint);
    await fixture.whenStable();

    expect(field('status').value).toBe('test');
    expect(field('connectionType').value).toBe('ihe-xds');
    expect(field<HTMLSelectElement>('connectionType').selectedOptions[0].textContent).toBe(
      'IHE XDS',
    );

    type('name', 'Document registry');
    await submit();

    expect(saved[0]).toMatchObject({
      id: 'e1',
      meta: { versionId: '2' },
      name: 'Document registry',
      connectionType: { code: 'ihe-xds', display: 'IHE XDS' },
      header: ['X-Trace: on'],
    });
  });

  it('disables the buttons while saving', async () => {
    fixture.componentRef.setInput('saving', true);
    await fixture.whenStable();

    expect([...element.querySelectorAll('button')].every((b) => b.disabled)).toBe(true);
    expect(element.querySelector('button[type="submit"]')?.textContent?.trim()).toBe('Saving…');
  });
});
