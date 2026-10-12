import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Endpoint } from 'fhir/r4';
import { CodeSystems } from '../../../code-systems';
import { EndpointDetail } from './endpoint-detail';

const pacs: Endpoint = {
  resourceType: 'Endpoint',
  id: 'pacs-dicomweb',
  status: 'active',
  connectionType: { system: CodeSystems.endpointConnectionType, code: 'dicom-wado-rs' },
  name: 'Hospital PACS (DICOMweb)',
  payloadType: [{ text: 'DICOM' }],
  payloadMimeType: ['application/dicom'],
  address: 'http://localhost:8042/dicom-web',
};

describe('EndpointDetail', () => {
  let fixture: ComponentFixture<EndpointDetail>;
  let element: HTMLElement;

  const render = async (endpoint: Endpoint) => {
    fixture.componentRef.setInput('endpoint', endpoint);
    await fixture.whenStable();
  };
  const texts = (selector: string) =>
    [...element.querySelectorAll(selector)].map((e) => e.textContent?.replace(/\s+/g, ' ').trim());

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [EndpointDetail] }).compileComponents();
    fixture = TestBed.createComponent(EndpointDetail);
    element = fixture.nativeElement;
  });

  it('shows the connection and payload, and marks the PACS endpoint', async () => {
    await render(pacs);

    expect(texts('h2')).toEqual(['Hospital PACS (DICOMweb)']);
    expect(texts('.sub > span')).toEqual(['DICOM WADO-RS', 'Active']);
    expect(texts('.badge')).toEqual(['PACS endpoint']);
    expect(texts('dt')).toEqual(['Address', 'Type', 'Status', 'Type', 'MIME types']);
    expect(texts('dd')).toEqual([
      'http://localhost:8042/dicom-web',
      'DICOM WADO-RS',
      'Active',
      'DICOM',
      'application/dicom',
    ]);
    // The base of an API, not a page: shown as text, not offered as a link.
    expect(element.querySelector('dd a')).toBeNull();
  });

  it('does not mark an endpoint that is off, or not WADO-RS, as the PACS endpoint', async () => {
    await render({ ...pacs, status: 'off' });
    expect(element.querySelector('.badge')).toBeNull();

    await render({
      ...pacs,
      connectionType: { system: CodeSystems.endpointConnectionType, code: 'hl7-fhir-rest' },
    });
    expect(element.querySelector('.badge')).toBeNull();
  });

  it('shows any kind of address, and the identifiers', async () => {
    await render({
      ...pacs,
      address: 'mllp://ris.local:2575',
      payloadMimeType: undefined,
      identifier: [{ system: 'urn:other', value: 'E-1' }],
    });

    expect(element.querySelector('dd a')).toBeNull();
    expect(texts('dd')).toContain('mllp://ris.local:2575');
    expect(texts('dd')).toContain('Any');
    expect(texts('section:last-child dd')).toEqual(['E-1']);
  });
});
