import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { map, of } from 'rxjs';
import { FhirClient } from '../../fhir/client/fhir-client';
import { fhirErrorMessage } from '../../fhir/client/fhir-error';
import { DeletePanel } from '../../fhir/delete-panel/delete-panel';
import { ImagingStudyDetail } from '../../fhir/resources/imaging-study/imaging-study-detail/imaging-study-detail';
import {
  imagingStudyDisplayName,
  isStudyOf,
  studyInstanceUid,
} from '../../fhir/resources/imaging-study/imaging-study-mapper';
import { DicomwebClient, dicomwebErrorMessage } from '../../pacs/dicomweb-client';
import { Icon } from '../../shared/icon/icon';
import { StudyReasons } from './study-reasons/study-reasons';

@Component({
  imports: [DeletePanel, Icon, ImagingStudyDetail, RouterLink, StudyReasons],
  selector: 'app-study-page',
  templateUrl: './study-page.html',
})
export class StudyPage {
  private readonly fhir = inject(FhirClient);
  private readonly dicomweb = inject(DicomwebClient);
  private readonly router = inject(Router);

  /** From the route, /patients/:id/studies/:studyId (router input binding). */
  readonly id = input.required<string>();
  readonly studyId = input.required<string>();

  protected readonly study = rxResource({
    params: () => this.studyId(),
    stream: ({ params: id }) => this.fhir.read('ImagingStudy', id),
  });

  protected readonly errorMessage = computed(() => fhirErrorMessage(this.study.error()));

  /** Whether the reasons panel is open; it is two-way bound to the panel's `open`. */
  protected readonly editingReasons = signal(false);

  /** False when the URL pairs the study with a patient it doesn't belong to. */
  protected readonly belongsToPatient = computed(
    () => this.study.hasValue() && isStudyOf(this.study.value(), this.id()),
  );

  /**
   * Whether the PACS still has the study's DICOM study, asked each time the page opens:
   * ImagingStudies come only from the PACS, so one without a DICOM study should be deleted, and
   * one with a DICOM study comes back on the next sync after being deleted.
   */
  protected readonly inPacs = rxResource({
    // An object, so a study without a UID ('') is still asked about rather than left idle.
    params: () =>
      this.belongsToPatient() && this.study.hasValue()
        ? { uid: studyInstanceUid(this.study.value()) }
        : undefined,
    stream: ({ params: { uid } }) =>
      uid ? this.dicomweb.findStudy(uid).pipe(map((study) => !!study)) : of(false),
  });

  /** The PACS was asked and doesn't have the study (or the ImagingStudy has no UID to ask by). */
  protected readonly missingFromPacs = computed(
    () => this.inPacs.hasValue() && this.inPacs.value() === false,
  );

  protected readonly pacsError = computed(() =>
    this.inPacs.error()
      ? dicomwebErrorMessage(this.inPacs.error()!.cause ?? this.inPacs.error())
      : '',
  );

  protected readonly studyUid = computed(() =>
    this.study.hasValue() ? studyInstanceUid(this.study.value()) : '',
  );

  protected readonly name = computed(() =>
    this.study.hasValue() ? imagingStudyDisplayName(this.study.value()) : '',
  );

  /** What deleting means for this study, depending on what the PACS said. */
  protected readonly deleteNote = computed(() => {
    if (this.missingFromPacs()) return '';
    if (this.inPacs.hasValue() && this.inPacs.value()) {
      return (
        'Its DICOM study is still in the PACS, so the next PACS sync will create the imaging ' +
        'study again, without the reasons set here.'
      );
    }
    return 'If its DICOM study is still in the PACS, the next PACS sync will create it again.';
  });

  /** Whether the delete panel is open; it is two-way bound to the panel's `open`. */
  protected readonly deleting = signal(false);

  protected onDeleted(): void {
    this.router.navigate(['/patients', this.id()]);
  }

  constructor() {
    const title = inject(Title);
    effect(() => {
      if (this.belongsToPatient() && this.study.hasValue()) {
        title.setTitle(`${imagingStudyDisplayName(this.study.value())} · Hospital Records`);
      }
    });
  }
}
