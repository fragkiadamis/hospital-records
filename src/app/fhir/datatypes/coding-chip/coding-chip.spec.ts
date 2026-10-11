import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Coding } from 'fhir/r4';
import { CodeSystems } from '../../code-systems';
import { CodingChip } from './coding-chip';

describe('CodingChip', () => {
  let fixture: ComponentFixture<CodingChip>;
  let element: HTMLElement;

  const render = async (coding: Coding) => {
    fixture.componentRef.setInput('coding', coding);
    await fixture.whenStable();
  };
  const text = (selector: string) => element.querySelector(selector)?.textContent?.trim();

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CodingChip] }).compileComponents();
    fixture = TestBed.createComponent(CodingChip);
    element = fixture.nativeElement;
  });

  it('shows the short system name and the code, with the name on hover', async () => {
    await render({
      system: CodeSystems.icd10,
      code: 'C50.9',
      display: 'Malignant neoplasm of breast, unspecified',
    });

    expect(text('.system')).toBe('ICD-10');
    expect(text('.code')).toBe('C50.9');
    expect(element.getAttribute('title')).toBe(
      'Malignant neoplasm of breast, unspecified\nhttp://hl7.org/fhir/sid/icd-10',
    );
  });

  it('gives screen readers the name, since they cannot hover', async () => {
    await render({ system: CodeSystems.icd10, code: 'C50.9', display: 'Malignant neoplasm' });

    expect(text('.sr-only')).toBe(': Malignant neoplasm');
  });

  it('labels unknown systems as "Code" and still shows their URI on hover', async () => {
    await render({ system: 'urn:oid:1.2.3', code: 'X1' });

    expect(text('.system')).toBe('Code');
    expect(element.getAttribute('title')).toBe('urn:oid:1.2.3');
    expect(element.querySelector('.sr-only')).toBeNull();
  });
});
