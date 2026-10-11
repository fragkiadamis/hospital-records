import { HttpErrorResponse } from '@angular/common/http';
import type { OperationOutcome } from 'fhir/r4';
import { fhirErrorMessage } from './fhir-error';

describe('fhirErrorMessage', () => {
  it("shows the server's OperationOutcome diagnostics", () => {
    const outcome: OperationOutcome = {
      resourceType: 'OperationOutcome',
      issue: [
        { severity: 'error', code: 'invalid', diagnostics: 'Patient.birthDate: invalid date' },
        { severity: 'error', code: 'required', details: { text: 'Patient.name is required' } },
      ],
    };
    const err = new HttpErrorResponse({ status: 422, error: outcome });

    expect(fhirErrorMessage(err)).toBe(
      'Patient.birthDate: invalid date · Patient.name is required',
    );
  });

  it('says the server is unreachable when there is no response', () => {
    const err = new HttpErrorResponse({ status: 0 });

    expect(fhirErrorMessage(err)).toContain('Cannot reach the FHIR server');
  });

  it('falls back to a message for the status code', () => {
    const err = new HttpErrorResponse({ status: 412, statusText: 'OK' }); // what HTTP/2 reports

    expect(fhirErrorMessage(err)).toBe(
      'The resource was changed by someone else; reload it and try again (HTTP 412)',
    );
  });
});
