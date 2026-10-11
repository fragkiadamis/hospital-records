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
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import type { Condition, Reference } from 'fhir/r4';
import { map } from 'rxjs';
import { notInFuture, today } from '../../../../shared/forms/date-validators';
import { CodeSystems } from '../../../code-systems';
import { formatTimeChoice } from '../../../datatypes/time-choice-pipe';
import { CodeSearch } from '../../../terminology/code-search/code-search';
import { CodeOption, TerminologyClient, ValueSets } from '../../../terminology/terminology-client';
import {
  CLINICAL_STATUSES,
  CONDITION_CATEGORIES,
  ConditionFormValue,
  conditionToForm,
  formToCondition,
  VERIFICATION_STATUSES,
} from '../condition-mapper';

const ONGOING = ['active', 'recurrence', 'relapse'];

/** The coded fields of the form, each a code + name pair. */
type CodeField = 'snomed' | 'icd10';

const SYSTEMS: Record<CodeField, string> = { snomed: CodeSystems.snomed, icd10: CodeSystems.icd10 };

/** SNOMED CT concept ids are 6 to 18 digits. */
const SNOMED_CODE = /^\d{6,18}$/;
/** WHO ICD-10 codes: a letter, two characters, and optionally a dot and up to four more (C50.9). */
const ICD10_CODE = /^[A-Z]\d[0-9A-Z](\.[0-9A-Z]{1,4})?$/i;

/**
 * Rules across fields. con-3, con-4 and con-5 are FHIR's own Condition invariants: HAPI reports
 * them in $validate but stores the resource anyway, so the form has to enforce them.
 */
function conditionRules(group: AbstractControl): ValidationErrors | null {
  const v = group.value as ConditionFormValue;
  const errors: ValidationErrors = {};
  if (!v.text.trim() && !v.snomedCode.trim() && !v.icd10Code.trim()) errors['identity'] = true;
  if (v.snomedDisplay.trim() && !v.snomedCode.trim()) errors['snomedCodeMissing'] = true;
  if (v.icd10Display.trim() && !v.icd10Code.trim()) errors['icd10CodeMissing'] = true;
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
      text: [''],
      snomedCode: ['', Validators.pattern(SNOMED_CODE)],
      snomedDisplay: [''],
      icd10Code: ['', Validators.pattern(ICD10_CODE)],
      icd10Display: [''],
      // A new condition starts as an active problem. Verification starts empty on purpose:
      // a diagnosis shouldn't become "confirmed" just because nobody changed a default.
      clinicalStatus: ['active' as ConditionFormValue['clinicalStatus']],
      verificationStatus: ['' as ConditionFormValue['verificationStatus']],
      category: ['problem-list-item' as ConditionFormValue['category']],
      onsetDate: ['', notInFuture],
      abatementDate: ['', notInFuture],
    },
    { validators: conditionRules },
  );

  protected readonly today = today();
  protected readonly clinicalStatuses = Object.entries(CLINICAL_STATUSES);
  protected readonly verificationStatuses = Object.entries(VERIFICATION_STATUSES);
  protected readonly categories = Object.entries(CONDITION_CATEGORIES);

  /** Set once the user tries to save, so every error shows from then on. */
  private readonly submitted = signal(false);

  private readonly locale = inject(LOCALE_ID);

  protected readonly valueSets = ValueSets;

  /** The form's current values as a signal, for what the template derives from them. */
  private readonly values = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );

  /** The chosen code of each system, shown by its search box. */
  protected readonly chosen = computed(() => ({
    snomed: this.codeOf('snomed'),
    icd10: this.codeOf('icd10'),
  }));

  /** Systems whose code is typed by hand (not found by the search, or the server is down). */
  protected readonly manual = signal<Record<CodeField, boolean>>({ snomed: false, icd10: false });

  /**
   * ICD-10 codes the official SNOMED CT → ICD-10 map gives for the chosen SNOMED concept, offered
   * while no ICD-10 code is chosen. Never applied automatically: the map's rules and advice need
   * a person's judgement. Empty when the terminology server has no such map.
   */
  protected readonly icd10Suggestions = rxResource({
    params: () => {
      const { snomed, icd10 } = this.chosen();
      const ask = snomed && !icd10 && !this.manual().icd10 && SNOMED_CODE.test(snomed.code);
      return ask ? snomed.code : undefined;
    },
    stream: ({ params: code }) => this.terminology.icd10ForSnomed(code),
  });

  private readonly terminology = inject(TerminologyClient);

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
        { ...value, icd10Code: value.icd10Code.trim().toUpperCase() },
        this.subject(),
        this.condition(),
      ),
    );
  }

  /** A code picked in a search box (or cleared with its Change button). */
  protected pick(field: CodeField, option: CodeOption | null): void {
    const {
      [`${field}Code` as const]: code,
      [`${field}Display` as const]: display,
      text,
    } = this.form.controls;
    code.setValue(option?.code ?? '');
    display.setValue(option?.display ?? '');
    code.markAsTouched();
    // A SNOMED concept's name is a good default for the condition's name.
    if (field === 'snomed' && option && !text.value.trim()) text.setValue(option.display);
  }

  /** Shows the code + name fields instead of the search box, or back. */
  protected enterByHand(field: CodeField, byHand: boolean): void {
    this.manual.update((manual) => ({ ...manual, [field]: byHand }));
  }

  /** Whether a system shows the code + name fields: chosen so, or its stored code is invalid. */
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
    const values = this.values();
    const code = values[`${field}Code`].trim();
    const display = values[`${field}Display`].trim();
    return code ? { system: SYSTEMS[field], code, display: display || code } : null;
  }

  private storedNonDate(prefix: 'onset' | 'abatement'): string {
    const condition = this.condition();
    if (!condition || condition[`${prefix}DateTime`]) return '';
    return formatTimeChoice(condition, prefix, this.locale);
  }
}
