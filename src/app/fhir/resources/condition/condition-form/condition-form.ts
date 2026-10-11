import {
  Component,
  computed,
  effect,
  inject,
  input,
  LOCALE_ID,
  output,
  signal,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import type { Condition, Reference } from 'fhir/r4';
import { map } from 'rxjs';
import { notInFuture, today } from '../../../../shared/forms/date-validators';
import { CodeSystems } from '../../../code-systems';
import { formatTimeChoice } from '../../../datatypes/time-choice-pipe';
import { CodeSearch } from '../../../terminology/code-search/code-search';
import { IcdMaps } from '../../../terminology/icd-maps';
import { CodeOption, ValueSets } from '../../../terminology/terminology-client';
import {
  CLINICAL_STATUSES,
  CONDITION_CATEGORIES,
  ConditionFormValue,
  conditionToForm,
  formToCondition,
  VERIFICATION_STATUSES,
} from '../condition-mapper';

const ONGOING = ['active', 'recurrence', 'relapse'];

/** WHO ICD-10 codes: a letter, two characters, and optionally a dot and up to four more (C50.9). */
const ICD10_CODE = /^[A-Z]\d[0-9A-Z](\.[0-9A-Z]{1,4})?$/i;
/**
 * WHO ICD-11 MMS codes (CA40.Z), possibly combined with five-character extension codes by & or /
 * (1A00&XN8P1), as WHO's mapping gives some of them.
 */
const ICD11_CODE = /^[0-9A-Z]{4}(\.[0-9A-Z]{1,4})?([&/][0-9A-Z]{4,5}(\.[0-9A-Z]{1,4})?)*$/i;

/** The two coded fields, each a code + name pair, filled in parallel. */
type CodeField = 'icd10' | 'icd11';

const SYSTEMS: Record<CodeField, string> = { icd10: CodeSystems.icd10, icd11: CodeSystems.icd11 };

/**
 * Rules across fields. con-3, con-4 and con-5 are FHIR's own Condition invariants: HAPI reports
 * them in $validate but stores the resource anyway, so the form has to enforce them.
 */
function conditionRules(group: AbstractControl): ValidationErrors | null {
  const v = group.value as ConditionFormValue;
  const errors: ValidationErrors = {};
  // A code is what identifies the condition; its name is the condition's name.
  if (!v.icd10Code.trim() && !v.icd11Code.trim()) errors['codeRequired'] = true;
  if (v.icd10Display.trim() && !v.icd10Code.trim()) errors['icd10CodeMissing'] = true;
  if (v.icd11Display.trim() && !v.icd11Code.trim()) errors['icd11CodeMissing'] = true;
  if (v.onsetDate && v.abatementDate && v.abatementDate < v.onsetDate) {
    errors['endBeforeOnset'] = true;
  }
  if (v.abatementDate && ONGOING.includes(v.clinicalStatus)) errors['con4'] = true;
  if (v.verificationStatus === 'entered-in-error' && v.clinicalStatus) errors['con5'] = true;
  if (
    v.category === 'problem-list-item' &&
    !v.clinicalStatus &&
    v.verificationStatus !== 'entered-in-error'
  ) {
    errors['con3'] = true;
  }
  return Object.keys(errors).length ? errors : null;
}

/**
 * Create / edit form for a Condition. Like the patient form it saves nothing itself: on submit
 * it emits the Condition built by the mapper, and the page creates or updates it.
 */
@Component({
  imports: [CodeSearch, ReactiveFormsModule],
  selector: 'app-condition-form',
  templateUrl: './condition-form.html',
})
export class ConditionForm {
  /** The stored condition when editing; fields the form doesn't show are kept from it. */
  readonly condition = input<Condition>();
  /** The patient a new condition is for. */
  readonly subject = input.required<Reference>();
  readonly saving = input(false);

  readonly save = output<Condition>();
  readonly cancelled = output<void>();

  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      icd10Code: ['', Validators.pattern(ICD10_CODE)],
      icd10Display: [''],
      icd11Code: ['', Validators.pattern(ICD11_CODE)],
      icd11Display: [''],
      // A new condition starts as an active problem. Verification starts empty on purpose:
      // a diagnosis shouldn't become "confirmed" just because nobody changed a default.
      clinicalStatus: ['active' as ConditionFormValue['clinicalStatus']],
      verificationStatus: ['' as ConditionFormValue['verificationStatus']],
      category: ['problem-list-item' as ConditionFormValue['category']],
      onsetDate: ['', notInFuture],
      abatementDate: ['', notInFuture],
      details: [''],
    },
    { validators: conditionRules },
  );

  protected readonly today = today();
  protected readonly clinicalStatuses = Object.entries(CLINICAL_STATUSES);
  protected readonly verificationStatuses = Object.entries(VERIFICATION_STATUSES);
  protected readonly categories = Object.entries(CONDITION_CATEGORIES);
  protected readonly valueSets = ValueSets;

  /** Set once the user tries to save, so every error shows from then on. */
  private readonly submitted = signal(false);

  private readonly locale = inject(LOCALE_ID);

  /** The form's current values as a signal, for what the template derives from them. */
  private readonly values = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );

  /** The chosen code of each classification, shown by its search box. */
  protected readonly chosen = computed(() => ({
    icd10: this.codeOf('icd10'),
    icd11: this.codeOf('icd11'),
  }));

  /** Fields whose code is typed by hand (not found by the search, or the server is down). */
  protected readonly manual = signal<Record<CodeField, boolean>>({ icd10: false, icd11: false });

  private readonly maps = inject(IcdMaps);

  /**
   * The ICD-11 code WHO's official mapping gives for the chosen ICD-10 code, offered while ICD-11
   * is empty (and the other way round below). Applied only when the user chooses to use it.
   */
  protected readonly icd11Suggestion = rxResource({
    params: () => this.mapFrom('icd10', 'icd11'),
    stream: ({ params: code }) => this.maps.icd11For(code),
  });

  protected readonly icd10Suggestion = rxResource({
    params: () => this.mapFrom('icd11', 'icd10'),
    stream: ({ params: code }) => this.maps.icd10For(code),
  });

  /** A stored onset / end the date field can't show (an age, a period, text): kept unless replaced. */
  protected readonly storedOnset = computed(() => this.storedNonDate('onset'));
  protected readonly storedEnd = computed(() => this.storedNonDate('abatement'));

  constructor() {
    effect(() => {
      const condition = this.condition();
      if (condition) this.form.reset(conditionToForm(condition));
    });
  }

  protected submit(): void {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.save.emit(
      formToCondition(
        {
          ...value,
          icd10Code: value.icd10Code.trim().toUpperCase(),
          icd11Code: value.icd11Code.trim().toUpperCase(),
        },
        this.subject(),
        this.condition(),
      ),
    );
  }

  /** A code picked in a search box or from a suggestion (or cleared with Change). */
  protected pick(field: CodeField, option: CodeOption | null): void {
    const code = this.form.controls[`${field}Code`];
    code.setValue(option?.code ?? '');
    this.form.controls[`${field}Display`].setValue(option?.display ?? '');
    code.markAsTouched();
  }

  protected enterByHand(field: CodeField, byHand: boolean): void {
    this.manual.update((manual) => ({ ...manual, [field]: byHand }));
  }

  /** Whether a field shows code + name inputs instead of the search: chosen so, or invalid code. */
  protected showsFields(field: CodeField): boolean {
    return this.manual()[field] || this.form.controls[`${field}Code`].invalid;
  }

  /** A field's own error, once the user has left the field (or tried to save). */
  protected fieldError(field: keyof ConditionFormValue, error: string): boolean {
    const control = this.form.controls[field];
    return (control.touched || this.submitted()) && control.hasError(error);
  }

  /** A rule across fields, once one of `fields` was touched (or the user tried to save). */
  protected ruleError(error: string, ...fields: (keyof ConditionFormValue)[]): boolean {
    const touched = this.submitted() || fields.some((f) => this.form.controls[f].touched);
    return touched && this.form.hasError(error);
  }

  private codeOf(field: CodeField): CodeOption | null {
    const code = this.values()[`${field}Code`].trim();
    const display = this.values()[`${field}Display`].trim();
    return code ? { system: SYSTEMS[field], code, display: display || code } : null;
  }

  /** The code to look up in WHO's mapping: chosen in `from`, while `to` is empty and searched. */
  private mapFrom(from: CodeField, to: CodeField): string | undefined {
    const source = this.chosen()[from];
    const valid = source && this.form.controls[`${from}Code`].valid;
    return valid && !this.chosen()[to] && !this.manual()[to] ? source.code : undefined;
  }

  private storedNonDate(prefix: 'onset' | 'abatement'): string {
    const condition = this.condition();
    if (!condition || condition[`${prefix}DateTime`]) return '';
    return formatTimeChoice(condition, prefix, this.locale);
  }
}
