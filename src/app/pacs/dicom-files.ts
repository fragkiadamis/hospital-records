// Picking DICOM files in the browser: what was dropped or chosen, and which of it is DICOM.

/** The DICOM files among `files`, and the others with why they were left out. */
export interface PickedFiles {
  dicom: File[];
  skipped: SkippedFile[];
}

export interface SkippedFile {
  /** Its path within a picked folder, or its name. */
  name: string;
  /** "Not DICOM" (which includes a DICOMDIR, only an index), or why it couldn't be read. */
  reason: string;
}

/** How many files are read at the same time: browsers fail or slow down with thousands. */
const READS_AT_ONCE = 32;

/**
 * Whether the file is a DICOM file (DICOM PS3.10): a 128-byte preamble, then "DICM". Only those
 * 4 bytes are read. A DICOMDIR has the marker too, but only indexes a media's files and holds no
 * images, so it doesn't count.
 */
export async function isDicomFile(file: File): Promise<boolean> {
  if (file.name.toUpperCase() === 'DICOMDIR' || file.size < 132) return false;
  const marker = new Uint8Array(await file.slice(128, 132).arrayBuffer());
  return String.fromCharCode(...marker) === 'DICM';
}

/**
 * Sorts files into DICOM and skipped, keeping their order. A file that can't be read (e.g. no
 * read permission) is skipped with the reason, never fails the whole check.
 */
export async function pickDicom(
  files: readonly File[],
  onProgress?: (done: number, total: number) => void,
): Promise<PickedFiles> {
  const outcomes: (true | string)[] = new Array(files.length);
  let next = 0;
  let done = 0;
  onProgress?.(0, files.length);
  const worker = async () => {
    while (next < files.length) {
      const i = next++;
      try {
        outcomes[i] = (await isDicomFile(files[i])) || 'Not DICOM';
      } catch {
        outcomes[i] = 'Could not be read (check its permissions)';
      }
      onProgress?.(++done, files.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(READS_AT_ONCE, files.length) }, worker));
  return {
    dicom: files.filter((_, i) => outcomes[i] === true),
    skipped: files.flatMap((file, i) =>
      outcomes[i] === true ? [] : [{ name: filePath(file), reason: outcomes[i] as string }],
    ),
  };
}

/** Where the file was within a picked folder, or just its name. */
export function filePath(file: File): string {
  return file.webkitRelativePath || file.name;
}

/**
 * Every file dropped: files as they are, and the files inside dropped folders, at any depth.
 * Browsers expose dropped folders only through the (non-standard but universal) entry API.
 */
export async function droppedFiles(data: DataTransfer): Promise<File[]> {
  const entries = [...data.items]
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => !!entry);
  if (!entries.length) return [...data.files];
  return (await Promise.all(entries.map(filesIn))).flat();
}

async function filesIn(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return [
      await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      ),
    ];
  }
  if (!entry.isDirectory) return [];
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const children: FileSystemEntry[] = [];
  // readEntries returns a folder's entries a chunk at a time, then an empty array.
  for (;;) {
    const chunk = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (!chunk.length) break;
    children.push(...chunk);
  }
  return (await Promise.all(children.map(filesIn))).flat();
}
