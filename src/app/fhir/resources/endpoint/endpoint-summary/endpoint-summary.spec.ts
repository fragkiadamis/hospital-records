import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Endpoint } from 'fhir/r4';
import { CodeSystems } from '../../../code-systems';
import { EndpointSummary } from './endpoint-summary';

const pacs: Endpoint = {
  resourceType: 'Endpoint',
  id: 'pacs-dicomweb',
  status: 'active',
  connectionType: { system: CodeSystems.endpointConnectionType, code: 'dicom-wado-rs' },
  name: 'Hospital PACS (DICOMweb)',
  payloadType: [{ text: 'DICOM' }],
  address: 'http://localhost:8042/dicom-web',
};

describe('EndpointSummary', () => {
  let fixture: ComponentFixture<EndpointSummary>;
  let element: HTMLElement;

  const render = async (endpoint: Endpoint) => {
    fixture.componentRef.setInput('endpoint', endpoint);
    await fixture.whenStable();
  };
  const text = (selector: string) => element.querySelector(selector)?.textContent?.trim();

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [EndpointSummary] }).compileComponents();
    fixture = TestBed.createComponent(EndpointSummary);
    element = fixture.nativeElement;
  });

  it('shows the name, connection type and address', async () => {
    await render(pacs);

    expect(text('.name')).toBe('Hospital PACS (DICOMweb)');
    expect([...element.querySelectorAll('.details > span')].map((s) => s.textContent)).toEqual([
      'DICOM WADO-RS',
      'http://localhost:8042/dicom-web',
    ]);
    expect(element.querySelector('.status')).toBeNull();
  });

  it('shows the status when the endpoint is not active', async () => {
    await render({ ...pacs, status: 'off' });

    expect(text('.status')).toBe('Off');
  });

  it('does not repeat the address when it is the name', async () => {
    await render({ ...pacs, name: undefined });

    expect(text('.name')).toBe('http://localhost:8042/dicom-web');
    expect(element.querySelector('.address')).toBeNull();
  });
});
