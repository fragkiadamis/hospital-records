import { InjectionToken } from '@angular/core';

/**
 * Base URL of the PACS's DICOMweb API. Relative, so it goes through the dev-server proxy
 * (proxy.conf.mjs), which also logs in to Orthanc, locally and through nginx in deployment.
 */
export const DICOMWEB_BASE_URL = new InjectionToken<string>('DICOMWEB_BASE_URL', {
  providedIn: 'root',
  factory: () => '/dicom-web',
});
