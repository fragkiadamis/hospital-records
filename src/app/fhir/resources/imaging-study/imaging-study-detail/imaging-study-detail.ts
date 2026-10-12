import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ImagingStudy } from 'fhir/r4';
import { Icon } from '../../../../shared/icon/icon';
import { CodeSystems } from '../../../code-systems';
import { CodeableConceptPipe } from '../../../datatypes/codeable-concept-pipe';
import { FhirDatePipe } from '../../../datatypes/fhir-date-pipe';
import { identifierLabel } from '../../../datatypes/identifier-pipe';
import { ReferencePipe } from '../../../datatypes/reference-pipe';
import { referenceLink } from '../../resource-links';
import {
  accessionNumber,
  imagingStudyDisplayName,
  instanceCount,
  isVoidStudy,
  modalityName,
  seriesCount,
  sortedSeries,
  STUDY_STATUSES,
  studyInstanceUid,
  studyModalities,
} from '../imaging-study-mapper';

/** Everything on an ImagingStudy record, read-only, including its series. */
@Component({
  imports: [CodeableConceptPipe, FhirDatePipe, Icon, ReferencePipe, RouterLink],
  selector: 'app-imaging-study-detail',
  styleUrl: './imaging-study-detail.scss',
  templateUrl: './imaging-study-detail.html',
})
export class ImagingStudyDetail {
  readonly study = input.required<ImagingStudy>();
  /** The patient the page shows; when set, reason conditions link to their pages. */
  readonly patientId = input<string>();

  protected readonly name = computed(() => imagingStudyDisplayName(this.study()));
  protected readonly voided = computed(() => isVoidStudy(this.study()));
  protected readonly status = computed(() => STUDY_STATUSES[this.study().status]);
  protected readonly uid = computed(() => studyInstanceUid(this.study()));
  protected readonly accession = computed(() => accessionNumber(this.study()));
  protected readonly seriesTotal = computed(() => seriesCount(this.study()));
  protected readonly images = computed(() => instanceCount(this.study()));
  protected readonly series = computed(() => sortedSeries(this.study()));
  /** Where the study's images are retrieved from: the PACS Endpoint the sync links it to. */
  protected readonly endpoints = computed(() =>
    (this.study().endpoint ?? []).map((endpoint) => referenceLink(endpoint)),
  );
  protected readonly reasons = computed(() =>
    (this.study().reasonReference ?? []).map((reason) => referenceLink(reason, this.patientId())),
  );

  protected readonly modalities = computed(() =>
    studyModalities(this.study())
      .map((coding) => `${modalityName(coding)} (${coding.code})`)
      .join(', '),
  );

  /** Identifiers besides the Study Instance UID and accession number shown above them. */
  protected readonly otherIdentifiers = computed(() =>
    (this.study().identifier ?? [])
      .filter(
        (i) =>
          i.system !== CodeSystems.dicomUid &&
          !i.type?.coding?.some(
            (c) => c.system === CodeSystems.identifierType && c.code === 'ACSN',
          ),
      )
      .map((identifier) => ({ label: identifierLabel(identifier), value: identifier.value ?? '' })),
  );

  protected readonly modalityName = modalityName;
}
