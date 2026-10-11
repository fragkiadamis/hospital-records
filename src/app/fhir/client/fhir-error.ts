import { HttpErrorResponse } from '@angular/common/http';
import type { OperationOutcome } from 'fhir/r4';

// Built from the status code: HttpErrorResponse.statusText is always 'OK' over HTTP/2.
const STATUS_MESSAGES: Record<number, string> = {
  400: 'The request was invalid',
  401: 'You are not signed in',
  403: 'You do not have access to this resource',
  404: 'The resource was not found',
  409: 'The resource is referenced by others or conflicts with existing data',
  410: 'The resource has been deleted',
  412: 'The resource was changed by someone else; reload it and try again',
  422: 'The resource failed validation',
};

/** Turns an HTTP error into display text, using the server's OperationOutcome when there is one. */
export function fhirErrorMessage(err: unknown): string {
  // Signal resources wrap errors that are not Error instances (like HttpErrorResponse) in .cause.
  if (err instanceof Error && err.cause instanceof HttpErrorResponse) err = err.cause;
  if (err instanceof HttpErrorResponse) {
    const outcome = err.error as OperationOutcome | undefined;
    if (outcome?.resourceType === 'OperationOutcome' && outcome.issue?.length) {
      return outcome.issue
        .map((i) => i.diagnostics ?? i.details?.text ?? i.code)
        .filter(Boolean)
        .join(' · ');
    }
    if (err.status === 0) return 'Cannot reach the FHIR server. Is the compose stack running?';
    const message =
      STATUS_MESSAGES[err.status] ??
      (err.status >= 500 ? 'The FHIR server failed' : 'The request failed');
    return `${message} (HTTP ${err.status})`;
  }
  return err instanceof Error ? err.message : String(err);
}
