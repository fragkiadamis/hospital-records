import { InjectionToken } from '@angular/core';

/**
 * Base URL of the FHIR server. Relative, so it goes through the dev-server proxy
 * (proxy.conf.json) locally and through nginx in deployment.
 */
export const FHIR_BASE_URL = new InjectionToken<string>('FHIR_BASE_URL', {
  providedIn: 'root',
  factory: () => '/fhir',
});
