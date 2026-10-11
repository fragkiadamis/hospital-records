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
import type { Condition, Reference } from 'fhir/r4';
import { notInFuture, today } from '../../../../shared/forms/date-validators';
import { formatTimeChoice } from '../../../datatypes/time-choice-pipe';
import {
  CLINICAL_STATUSES,
  CONDITION_CATEGORIES,
  ConditionFormValue,
  conditionToForm,
  formToCondition,
  VERIFICATION_STATUSES,
} from '../condition-mapper';

const ONGOING = ['active', 'recurrence', 'relapse'];

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
  imports: [ReactiveFormsModule],
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

  private storedNonDate(prefix: 'onset' | 'abatement'): string {
    const condition = this.condition();
    if (!condition || condition[`${prefix}DateTime`]) return '';
    return formatTimeChoice(condition, prefix, this.locale);
  }
}
