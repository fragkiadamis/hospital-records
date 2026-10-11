import { HttpErrorResponse } from '@angular/common/http';
import type { OperationOutcome } from 'fhir/r4';
import { fhirErrorMessage, isVersionConflict } from './fhir-error';

describe('isVersionConflict', () => {
  it('recognises the 412 of the FHIR spec and the 409 HAPI sends', () => {
    expect(isVersionConflict(new HttpErrorResponse({ status: 412 }))).toBe(true);
    expect(isVersionConflict(new HttpErrorResponse({ status: 409 }))).toBe(true);
    expect(
      isVersionConflict(new Error('wrapped', { cause: new HttpErrorResponse({ status: 409 }) })),
    ).toBe(true);
  });

  it('is false for other errors', () => {
    expect(isVersionConflict(new HttpErrorResponse({ status: 422 }))).toBe(false);
    expect(isVersionConflict(new Error('boom'))).toBe(false);
  });
});

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

  it('looks inside the error a signal resource wraps around an HttpErrorResponse', () => {
    const wrapped = new Error('Resource returned an error…', {
      cause: new HttpErrorResponse({ status: 404 }),
    });

    expect(fhirErrorMessage(wrapped)).toBe('The resource was not found (HTTP 404)');
  });

  it('falls back to a message for the status code', () => {
    const err = new HttpErrorResponse({ status: 412, statusText: 'OK' }); // what HTTP/2 reports

    expect(fhirErrorMessage(err)).toBe(
      'The resource was changed by someone else; reload it and try again (HTTP 412)',
    );
  });
});
