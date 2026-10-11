import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { CodeSystems } from '../code-systems';
import { IcdMaps } from './icd-maps';

describe('IcdMaps', () => {
  let maps: IcdMaps;
  let http: HttpTestingController;

  const table = (map: Record<string, [string, string]>) => ({ source: 'WHO, test', map });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    maps = TestBed.inject(IcdMaps);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("gives the ICD-11 code of WHO's table for an ICD-10 code", async () => {
    const result = firstValueFrom(maps.icd11For('j18.9 '));
    http
      .expectOne('terminology/icd10-to-icd11.json')
      .flush(table({ 'J18.9': ['CA40.Z', 'Pneumonia, organism unspecified'] }));

    expect(await result).toEqual({
      system: CodeSystems.icd11,
      code: 'CA40.Z',
      display: 'Pneumonia, organism unspecified',
    });
  });

  it('gives the ICD-10 code for an ICD-11 code, and null when the table has none', async () => {
    const found = firstValueFrom(maps.icd10For('2C6Z'));
    http
      .expectOne('terminology/icd11-to-icd10.json')
      .flush(table({ '2C6Z': ['C50', 'Malignant neoplasm of breast'] }));
    expect((await found)?.code).toBe('C50');

    // Loaded once: the second lookup uses the same table.
    expect(await firstValueFrom(maps.icd10For('CA40.Z'))).toBeNull();
  });

  it('maps nothing when a table cannot be loaded, and tries again next time', async () => {
    const failed = firstValueFrom(maps.icd11For('J18.9'));
    http.expectOne('terminology/icd10-to-icd11.json').flush({}, { status: 404, statusText: 'x' });
    expect(await failed).toBeNull();

    const retried = firstValueFrom(maps.icd11For('J18.9'));
    http.expectOne('terminology/icd10-to-icd11.json').flush(table({ 'J18.9': ['CA40.Z', 'x'] }));
    expect((await retried)?.code).toBe('CA40.Z');
  });
});
