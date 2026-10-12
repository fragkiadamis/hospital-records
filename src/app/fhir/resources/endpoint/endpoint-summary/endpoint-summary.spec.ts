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
    expect(text('.status')).toBe('Active');
  });

  it('tags every status, so the colour can tell them apart', async () => {
    const statuses = ['active', 'suspended', 'error', 'off', 'test', 'entered-in-error'] as const;
    const tags = [];
    for (const status of statuses) {
      await render({ ...pacs, status });
      const tag = element.querySelector('.status');
      tags.push([tag?.textContent?.trim(), tag?.getAttribute('data-status')]);
    }

    expect(tags).toEqual([
      ['Active', 'active'],
      ['Suspended', 'suspended'],
      ['Error', 'error'],
      ['Off', 'off'],
      ['Test', 'test'],
      ['Entered in error', 'entered-in-error'],
    ]);
  });

  it('does not repeat the address when it is the name', async () => {
    await render({ ...pacs, name: undefined });

    expect(text('.name')).toBe('http://localhost:8042/dicom-web');
    expect(element.querySelector('.address')).toBeNull();
  });
});
