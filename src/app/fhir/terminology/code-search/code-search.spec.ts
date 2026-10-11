import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { ValueSet } from 'fhir/r4';
import { CodeSystems } from '../../code-systems';
import { CodeOption, ValueSets } from '../terminology-client';
import { CodeSearch } from './code-search';

const pneumonia: CodeOption = {
  system: CodeSystems.snomed,
  code: '233604007',
  display: 'Pneumonia',
};
const pneumonitis: CodeOption = {
  system: CodeSystems.snomed,
  code: '205237003',
  display: 'Pneumonitis',
};

describe('CodeSearch', () => {
  let fixture: ComponentFixture<CodeSearch>;
  let element: HTMLElement;
  let http: HttpTestingController;
  let picked: (CodeOption | null)[];

  const input = () => element.querySelector<HTMLInputElement>('input[role="combobox"]')!;
  const options = () =>
    [...element.querySelectorAll('[role="option"]')].map((o) => o.getAttribute('aria-label'));
  const key = (k: string) =>
    input().dispatchEvent(new KeyboardEvent('keydown', { key: k, cancelable: true }));

  /** Types `text` and waits for the debounce; answers the search with `found` if one is sent. */
  const type = async (text: string, found?: CodeOption[] | 'error') => {
    input().value = text;
    input().dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 350)); // the 300 ms debounce
    TestBed.tick();
    if (found !== undefined) {
      const req = http.expectOne('/tx/ValueSet/$expand');
      if (found === 'error') req.flush({}, { status: 503, statusText: 'Unavailable' });
      else
        req.flush({
          resourceType: 'ValueSet',
          status: 'active',
          expansion: { timestamp: '2026-10-11', contains: found },
        } satisfies ValueSet);
    }
    await fixture.whenStable();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CodeSearch],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CodeSearch);
    element = fixture.nativeElement;
    fixture.componentRef.setInput('valueSet', ValueSets.snomedClinicalFindings);
    fixture.componentRef.setInput('label', 'SNOMED CT code');
    picked = [];
    fixture.componentInstance.picked.subscribe((option) => picked.push(option));
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  it('is an accessible combobox', () => {
    expect(input().getAttribute('aria-label')).toBe('SNOMED CT code');
    expect(input().getAttribute('aria-autocomplete')).toBe('list');
    expect(input().getAttribute('aria-expanded')).toBe('false');
  });

  it("doesn't search for a single character", async () => {
    await type('p'); // http.verify() fails if a request was sent
    expect(element.querySelector('[role="listbox"]')).toBeNull();
  });

  it('lists the codes found and picks one with the mouse', async () => {
    await type('pneum', [pneumonia, pneumonitis]);

    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(options()).toEqual(['Pneumonia, code 233604007', 'Pneumonitis, code 205237003']);

    element.querySelectorAll('[role="option"]')[1].dispatchEvent(new MouseEvent('mousedown'));
    expect(picked).toEqual([pneumonitis]);
  });

  it('can be used with the keyboard', async () => {
    await type('pneum', [pneumonia, pneumonitis]);

    key('ArrowDown');
    key('ArrowDown');
    await fixture.whenStable();
    const active = element.querySelector('[aria-selected="true"]');
    expect(active?.textContent).toContain('Pneumonitis');
    expect(input().getAttribute('aria-activedescendant')).toBe(active?.id);

    key('Enter');
    expect(picked).toEqual([pneumonitis]);

    await type('pneum'); // same text: the results are already there
    key('Escape');
    await fixture.whenStable();
    expect(input().getAttribute('aria-expanded')).toBe('false');
  });

  it('says when nothing matches, and when the server is unavailable', async () => {
    await type('zzzz', []);
    expect(element.querySelector('[role="listbox"]')?.textContent).toContain('No codes match');

    await type('zzzzz', 'error');
    expect(element.querySelector('[role="listbox"]')?.textContent).toContain('Search unavailable');
  });

  it('shows the chosen code with a Change button that clears it', async () => {
    fixture.componentRef.setInput('value', pneumonia);
    await fixture.whenStable();

    expect(element.querySelector('app-coding-chip .code')?.textContent).toBe('233604007');
    expect(element.querySelector('.display')?.textContent).toBe('Pneumonia');
    expect(input()).toBeNull();

    element.querySelector<HTMLButtonElement>('button.change')!.click();
    expect(picked).toEqual([null]);
  });
});
