import type { Coding, Endpoint } from 'fhir/r4';
import { CodeSystems } from '../../code-systems';
import { formatCodeableConcept } from '../../datatypes/codeable-concept-pipe';
import { replaceEntry } from '../replace-entry';

/** Endpoint.status codes, with the labels the app shows. */
export const ENDPOINT_STATUSES = {
  active: 'Active',
  suspended: 'Suspended',
  error: 'Error',
  off: 'Off',
  test: 'Test',
  'entered-in-error': 'Entered in error',
} as const;

export type EndpointStatus = keyof typeof ENDPOINT_STATUSES;

/**
 * The HL7 endpoint-connection-type codes the app offers, with their names. An Endpoint stored
 * with another code keeps it, and shows its own display.
 */
export const CONNECTION_TYPES = {
  'dicom-wado-rs': 'DICOM WADO-RS',
  'dicom-qido-rs': 'DICOM QIDO-RS',
  'dicom-stow-rs': 'DICOM STOW-RS',
  'hl7-fhir-rest': 'HL7 FHIR',
} as const;

export type ConnectionType = keyof typeof CONNECTION_TYPES;

/** The connection type of the PACS Endpoint: where the images of imaging studies are retrieved. */
export const PACS_CONNECTION_TYPE: ConnectionType = 'dicom-wado-rs';

/** What the endpoint form edits: flat fields, '' when empty. */
export interface EndpointFormValue {
  name: string;
  status: EndpointStatus;
  connectionType: string; // a CONNECTION_TYPES code, or the stored one
  address: string;
  payloadType: string; // what is sent, in words, e.g. "DICOM"
  payloadMimeTypes: string; // comma-separated, e.g. "application/dicom"
}

/** A new endpoint's form: an active DICOMweb (WADO-RS) endpoint for DICOM images. */
export const NEW_ENDPOINT_FORM: EndpointFormValue = {
  name: '',
  status: 'active',
  connectionType: PACS_CONNECTION_TYPE,
  address: '',
  payloadType: 'DICOM',
  payloadMimeTypes: 'application/dicom',
};

/** Endpoint → form. */
export function endpointToForm(endpoint: Endpoint): EndpointFormValue {
  return {
    name: endpoint.name ?? '',
    status: endpoint.status,
    connectionType: endpoint.connectionType?.code ?? '',
    address: endpoint.address ?? '',
    payloadType: formatCodeableConcept(endpoint.payloadType?.[0]),
    payloadMimeTypes: (endpoint.payloadMimeType ?? []).join(', '),
  };
}

/**
 * Form → Endpoint. Pass the stored resource when editing: PUT replaces the whole resource, so
 * what the form doesn't edit (identifiers, contacts, period, headers, other payload types, …)
 * is copied over unchanged.
 */
export function formToEndpoint(value: EndpointFormValue, existing?: Endpoint): Endpoint {
  const currentPayload = existing?.payloadType?.[0];
  const payloadType = value.payloadType.trim();
  // Keep the stored payload type (and its codes) unless its text was changed.
  const editedPayload =
    currentPayload && formatCodeableConcept(currentPayload) === payloadType
      ? currentPayload
      : { text: payloadType };
  const mimeTypes = value.payloadMimeTypes
    .split(',')
    .map((type) => type.trim())
    .filter(Boolean);

  return {
    ...existing,
    resourceType: 'Endpoint',
    status: value.status,
    connectionType: connectionTypeCoding(value.connectionType, existing?.connectionType),
    name: value.name.trim() || undefined,
    address: value.address.trim(),
    payloadType: replaceEntry(existing?.payloadType, currentPayload, editedPayload) ?? [],
    payloadMimeType: mimeTypes.length ? mimeTypes : undefined,
  };
}

/** The coding for a connection type code: the stored one when unchanged, else HL7's. */
function connectionTypeCoding(code: string, current?: Coding): Coding {
  if (current?.code === code) return current;
  const display = CONNECTION_TYPES[code as ConnectionType];
  return {
    system: CodeSystems.endpointConnectionType,
    code,
    ...(display ? { display } : {}),
  };
}

/** "DICOM WADO-RS" for dicom-wado-rs; the coding's own display, or its code, otherwise. */
export function connectionTypeName(coding: Coding | undefined): string {
  return CONNECTION_TYPES[coding?.code as ConnectionType] ?? coding?.display ?? coding?.code ?? '';
}

/** "Hospital PACS (DICOMweb)", else the address, else the resource reference. */
export function endpointDisplayName(endpoint: Endpoint): string {
  return endpoint.name || endpoint.address || `Endpoint/${endpoint.id ?? 'new'}`;
}

/**
 * Whether this is a PACS Endpoint: active, and serving DICOMweb WADO-RS (HL7's code system), so
 * images can be retrieved from it. The sync links imaging studies to the one such Endpoint.
 */
export function isPacsEndpoint(endpoint: Endpoint): boolean {
  return (
    endpoint.status === 'active' &&
    endpoint.connectionType?.system === CodeSystems.endpointConnectionType &&
    endpoint.connectionType.code === PACS_CONNECTION_TYPE
  );
}
