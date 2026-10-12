import type { Endpoint } from 'fhir/r4';
import { CodeSystems } from '../../code-systems';
import {
  connectionTypeName,
  endpointDisplayName,
  EndpointFormValue,
  endpointToForm,
  formToEndpoint,
  isPacsEndpoint,
  NEW_ENDPOINT_FORM,
} from './endpoint-mapper';

const wadoRs = { system: CodeSystems.endpointConnectionType, code: 'dicom-wado-rs' };

// The local Orthanc, plus fields the form does not edit.
const stored: Endpoint = {
  resourceType: 'Endpoint',
  id: 'pacs-dicomweb',
  meta: { versionId: '3' },
  identifier: [{ system: 'urn:other', value: 'E-1' }],
  status: 'active',
  connectionType: { ...wadoRs, display: 'DICOM WADO-RS' },
  name: 'Hospital PACS (DICOMweb)',
  payloadType: [
    { coding: [{ system: 'urn:payload', code: 'dicom' }], text: 'DICOM' },
    { text: 'Other payload' },
  ],
  payloadMimeType: ['application/dicom', 'application/dicom+json'],
  address: 'http://localhost:8042/dicom-web',
  header: ['X-Trace: on'],
};

const form = (changes: Partial<EndpointFormValue> = {}): EndpointFormValue => ({
  ...endpointToForm(stored),
  ...changes,
});

describe('endpointToForm', () => {
  it('reads the fields the form edits', () => {
    expect(endpointToForm(stored)).toEqual({
      name: 'Hospital PACS (DICOMweb)',
      status: 'active',
      connectionType: 'dicom-wado-rs',
      address: 'http://localhost:8042/dicom-web',
      payloadType: 'DICOM',
      payloadMimeTypes: 'application/dicom, application/dicom+json',
    });
  });
});

describe('formToEndpoint', () => {
  it('changes nothing when the form is saved unedited', () => {
    expect(formToEndpoint(form(), stored)).toEqual(stored);
  });

  it('keeps id, meta and the fields the form does not edit', () => {
    const endpoint = formToEndpoint(form({ status: 'off' }), stored);

    expect(endpoint).toMatchObject({
      id: 'pacs-dicomweb',
      meta: { versionId: '3' },
      identifier: stored.identifier,
      header: ['X-Trace: on'],
      status: 'off',
    });
  });

  it('replaces only the first payload type, and only when its text changed', () => {
    const endpoint = formToEndpoint(form({ payloadType: 'DICOM images' }), stored);

    expect(endpoint.payloadType).toEqual([{ text: 'DICOM images' }, { text: 'Other payload' }]);
  });

  it('codes a changed connection type in HL7 endpoint-connection-type', () => {
    const endpoint = formToEndpoint(form({ connectionType: 'hl7-fhir-rest' }), stored);

    expect(endpoint.connectionType).toEqual({
      system: CodeSystems.endpointConnectionType,
      code: 'hl7-fhir-rest',
      display: 'HL7 FHIR',
    });
  });

  it('splits the MIME types and trims what was typed', () => {
    const endpoint = formToEndpoint(
      form({ name: '  ', address: ' http://pacs/dicom-web ', payloadMimeTypes: ' a/b , ,c/d ' }),
      stored,
    );

    expect(endpoint.payloadMimeType).toEqual(['a/b', 'c/d']);
    expect(endpoint.address).toBe('http://pacs/dicom-web');
    expect(endpoint.name).toBeUndefined();
  });

  it('builds a new DICOMweb endpoint from the default form', () => {
    const endpoint = formToEndpoint({
      ...NEW_ENDPOINT_FORM,
      name: 'PACS',
      address: 'http://pacs/dicom-web',
    });

    expect(JSON.parse(JSON.stringify(endpoint))).toEqual({
      resourceType: 'Endpoint',
      status: 'active',
      connectionType: { ...wadoRs, display: 'DICOM WADO-RS' },
      name: 'PACS',
      address: 'http://pacs/dicom-web',
      payloadType: [{ text: 'DICOM' }],
      payloadMimeType: ['application/dicom'],
    });
    expect(isPacsEndpoint(endpoint)).toBe(true);
  });
});

describe('names', () => {
  it('names a connection type, also one the app does not offer', () => {
    expect(connectionTypeName(wadoRs)).toBe('DICOM WADO-RS');
    expect(connectionTypeName({ code: 'ihe-xds', display: 'IHE XDS' })).toBe('IHE XDS');
    expect(connectionTypeName({ code: 'direct-project' })).toBe('direct-project');
  });

  it('names an endpoint by its name, else its address, else its reference', () => {
    expect(endpointDisplayName(stored)).toBe('Hospital PACS (DICOMweb)');
    expect(endpointDisplayName({ ...stored, name: undefined })).toBe(
      'http://localhost:8042/dicom-web',
    );
    expect(endpointDisplayName({ ...stored, name: undefined, address: '', id: 'e9' })).toBe(
      'Endpoint/e9',
    );
  });
});

describe('isPacsEndpoint', () => {
  it('is an active DICOMweb WADO-RS endpoint, and nothing else', () => {
    expect(isPacsEndpoint(stored)).toBe(true);
    expect(isPacsEndpoint({ ...stored, status: 'off' })).toBe(false);
    expect(
      isPacsEndpoint({ ...stored, connectionType: { ...wadoRs, code: 'dicom-qido-rs' } }),
    ).toBe(false);
    expect(isPacsEndpoint({ ...stored, connectionType: { code: 'dicom-wado-rs' } })).toBe(false);
  });
});
