import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DicomwebClient, dicomwebErrorMessage, StowResponse } from './dicomweb-client';

/** A batch is sent once it holds this many files… */
const MAX_FILES_PER_REQUEST = 20;
/** …or this many bytes (a larger file goes on its own). */
const MAX_BYTES_PER_REQUEST = 50 * 1024 * 1024;

/** A file the PACS did not store, and why. */
export interface UploadFailure {
  /** The file's path within what was picked, or its name. */
  name: string;
  reason: string;
}

export interface UploadReport {
  /** How many files were sent. */
  files: number;
  /** How many the PACS stored, or already had. */
  stored: number;
  failed: UploadFailure[];
  /** The studies the stored files belong to, each once, in the order first seen. */
  studyInstanceUids: string[];
}

/**
 * Sends DICOM files to the PACS with STOW-RS, in batches. A batch the PACS stores whole costs one
 * request; one it partly refuses is sent again a file at a time, since STOW-RS can't say which
 * file it refused when it couldn't read it. When the PACS can't be reached or refuses the login,
 * the rest is not sent: every file left is reported with that reason.
 */
@Injectable({ providedIn: 'root' })
export class DicomUpload {
  private readonly dicomweb = inject(DicomwebClient);

  async upload(
    files: readonly File[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<UploadReport> {
    const report: UploadReport = {
      files: files.length,
      stored: 0,
      failed: [],
      studyInstanceUids: [],
    };
    const studies = new Set<string>();
    const record = (response: StowResponse) => {
      for (const { studyInstanceUid } of response.stored) {
        if (studyInstanceUid) studies.add(studyInstanceUid);
      }
    };

    /** Sends one file on its own, so the outcome is known to be that file's. */
    const sendAlone = async (file: File) => {
      try {
        const response = await this.store([file]);
        record(response);
        if (response.stored.length) report.stored++;
        else report.failed.push(failure(file, response.failed[0]?.reason));
      } catch (err) {
        report.failed.push(failure(file, dicomwebErrorMessage(err)));
      }
    };

    let done = 0;
    onProgress?.(0, files.length);
    const batches = toBatches(files);
    for (const [index, batch] of batches.entries()) {
      try {
        const response = await this.store(batch);
        if (!response.failed.length && response.stored.length >= batch.length) {
          record(response);
          report.stored += batch.length;
        } else if (batch.length === 1) {
          record(response);
          report.failed.push(failure(batch[0], response.failed[0]?.reason));
        } else {
          for (const file of batch) await sendAlone(file);
        }
      } catch (err) {
        if (!isRetryable(err)) {
          // The PACS is down or refuses the login: sending the rest would fail the same way.
          const reason = dicomwebErrorMessage(err);
          report.failed.push(
            ...batches
              .slice(index)
              .flat()
              .map((file) => failure(file, reason)),
          );
          onProgress?.(files.length, files.length);
          break;
        }
        for (const file of batch) await sendAlone(file);
      }
      done += batch.length;
      onProgress?.(done, files.length);
    }

    report.studyInstanceUids = [...studies];
    return report;
  }

  private store(files: readonly File[]): Promise<StowResponse> {
    return firstValueFrom(this.dicomweb.store(files));
  }
}

/** Files grouped into requests of at most MAX_FILES_PER_REQUEST files and MAX_BYTES_PER_REQUEST. */
function toBatches(files: readonly File[]): File[][] {
  const batches: File[][] = [];
  let batch: File[] = [];
  let bytes = 0;
  for (const file of files) {
    if (
      batch.length &&
      (batch.length === MAX_FILES_PER_REQUEST || bytes + file.size > MAX_BYTES_PER_REQUEST)
    ) {
      batches.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(file);
    bytes += file.size;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

/**
 * Whether sending the batch's files one by one could help: the PACS answered, but refused the
 * request as it was. Not when it is down (0, 502–504) or refuses the login (401, 403).
 */
function isRetryable(err: unknown): boolean {
  return err instanceof HttpErrorResponse && [400, 409, 413, 415, 422].includes(err.status);
}

function failure(file: File, reason = 'The PACS did not store it'): UploadFailure {
  return { name: file.webkitRelativePath || file.name, reason };
}
