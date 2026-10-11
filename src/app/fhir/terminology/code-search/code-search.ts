import { Component, computed, inject, input, output, signal } from '@angular/core';
import { rxResource, toObservable, toSignal } from '@angular/core/rxjs-interop';
import type { ValueSet } from 'fhir/r4';
import { debounceTime, distinctUntilChanged, of } from 'rxjs';
import { Icon } from '../../../shared/icon/icon';
import { fhirErrorMessage } from '../../client/fhir-error';
import { CodingChip } from '../../datatypes/coding-chip/coding-chip';
import { CodeOption, TerminologyClient } from '../terminology-client';

let nextId = 0;

/** Searches start at this many characters. */
const MIN_LENGTH = 2;

/**
 * Search-as-you-type for a code in a value set (WAI-ARIA combobox with a listbox popup).
 * Shows the chosen code as a chip with a Change button; emits `picked` with the chosen code, or
 * null when it is cleared. It holds no form state: the form decides what to do with the code.
 */
@Component({
  imports: [CodingChip, Icon],
  selector: 'app-code-search',
  styleUrl: './code-search.scss',
  templateUrl: './code-search.html',
})
export class CodeSearch {
  private readonly terminology = inject(TerminologyClient);

  readonly valueSet = input.required<ValueSet>();
  /** The input's accessible name, e.g. "SNOMED CT code". */
  readonly label = input.required<string>();
  /** The code chosen so far, shown instead of the search box. */
  readonly value = input<CodeOption | null>(null);
  readonly placeholder = input('Search by name or code');

  readonly picked = output<CodeOption | null>();

  protected readonly id = `code-search-${nextId++}`;
  protected readonly query = signal('');
  protected readonly open = signal(false);
  protected readonly active = signal(-1);

  private readonly term = toSignal(
    toObservable(this.query).pipe(debounceTime(300), distinctUntilChanged()),
    { initialValue: '' },
  );

  protected readonly results = rxResource({
    params: () => {
      const term = this.term().trim();
      return term.length >= MIN_LENGTH ? { term, valueSet: this.valueSet() } : undefined;
    },
    stream: ({ params }) =>
      params ? this.terminology.search(params.valueSet, params.term) : of([]),
  });

  protected readonly options = computed(() =>
    this.results.hasValue() ? this.results.value() : [],
  );
  protected readonly errorMessage = computed(() => fhirErrorMessage(this.results.error()));
  protected readonly tooShort = computed(() => this.query().trim().length < MIN_LENGTH);

  protected onInput(text: string): void {
    this.query.set(text);
    this.open.set(true);
    this.active.set(-1);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.options().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.open.set(true);
        if (count) this.active.update((i) => (i + 1) % count);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (count) this.active.update((i) => (i <= 0 ? count - 1 : i - 1));
        break;
      case 'Enter':
        // Don't submit the surrounding form while choosing from the list.
        if (this.open() && this.active() >= 0) {
          event.preventDefault();
          this.choose(this.options()[this.active()]);
        }
        break;
      case 'Escape':
        if (this.open()) {
          event.preventDefault();
          this.open.set(false);
        }
        break;
    }
  }

  protected choose(option: CodeOption): void {
    this.picked.emit(option);
    this.query.set('');
    this.open.set(false);
    this.active.set(-1);
  }

  protected clear(): void {
    this.picked.emit(null);
  }

  protected optionId(index: number): string {
    return `${this.id}-option-${index}`;
  }
}
