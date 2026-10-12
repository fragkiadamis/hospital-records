# Contributing to Hospital Records

Thanks for helping out. This guide covers how work is planned, how to set up, and what a pull
request needs before it can be merged.

## Before you start

- Every change starts from an issue. Look for an open one, or open a new one describing the
  feature or bug before writing code.
- Issues are grouped under the current release milestone, and FHIR resource work under the
  "FHIR Resources CRUD" parent issue. Assign the issue to yourself when you pick it up.
- Never commit real patient data. Seed data, test fixtures and screenshots must be synthetic or
  openly licensed and de-identified. `.env` holds passwords and stays out of git.

## Setup

Follow [Getting started](README.md#getting-started) in the README: Node.js 24, npm 11 and Podman
(or Docker) Compose. In short:

```bash
npm ci
cp .env.example .env      # fill in the passwords
podman compose up -d      # HAPI-FHIR, Orthanc and their databases
npm run seed              # sample data
npm run seed:orthanc      # sample DICOM studies (needs DCMTK and scripts/seed/dicom/)
npm start                 # http://localhost:4200, then click "Sync with PACS" on the patient list
```

## Branches

Branch from `main` and name the branch after the issue: `feature/<issue number>`, for example
`feature/19`.

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/), checked by commitlint
on every pull request. The subject is written in sentence case and says what the change does:

```
feat: Add imaging study detail page with series table
fix: Keep the condition's notes when editing its code
refactor: Name conditions by their ICD-10 code and drop the name field
```

| Type       | Use for                                                   |
| ---------- | --------------------------------------------------------- |
| `feat`     | A new feature                                             |
| `fix`      | A bug fix                                                 |
| `docs`     | Documentation only                                        |
| `style`    | Formatting, no code change                                |
| `refactor` | A code change that neither fixes a bug nor adds a feature |
| `perf`     | A performance improvement                                 |
| `test`     | Adding or fixing tests                                    |
| `build`    | Build system or dependencies (npm, Angular CLI, images)   |
| `ci`       | GitHub Actions                                            |
| `chore`    | Other maintenance that doesn't touch `src` or tests       |
| `revert`   | Reverting an earlier commit                               |

Commits drive the version number: `feat` bumps the minor version, `fix` and `perf` the patch
version, and a `!` after the type (`feat!: ...`) or a `BREAKING CHANGE:` footer the major version.
Keep each commit focused on one change, since every `feat` and `fix` becomes a line in the
changelog.

## Code conventions

- Angular 22, standalone components only, signals for state, lazy-loaded routes.
- File names follow the Angular CLI style without a `Component` suffix: `header.ts`,
  `header.html`, `header.scss`, `header.spec.ts`, class `Header`.
- Prettier: 100-character lines, single quotes. ESLint must pass.
- Icons are Tabler SVGs through `<app-icon name="..." />`; add new ones to
  `src/app/shared/icon/icons.ts`.
- Component stylesheets must stay under the build budget (4 kB warning, 8 kB error).

### Adding a FHIR resource

Each resource lives in `src/app/fhir/resources/<resource>/` and follows the same pattern:

```
<resource>-mapper.ts     FHIR ↔ form value and display helpers (pure functions)
<resource>-summary/      compact row for lists
<resource>-detail/       full read-only view
<resource>-form/         create / edit
```

- **Resource components only display.** They take the resource as an `input()` and never call the
  server. Pages in `src/app/pages/` fetch and save; forms emit the built resource.
- **Mappers, not components, build FHIR JSON.** `formToX(value, existing?)` starts from the
  existing resource, because a PUT replaces the whole resource.
- **Use the one generic `FhirClient`.** No per-resource CRUD services.
- **Use exact FHIR names** in code and files (`imaging-study`, not `study`).
- Types come from `@types/fhir` (`import type { Patient } from 'fhir/r4'`); the server runs R4.
- Edits send `If-Match`, so saving over a newer version is refused instead of overwriting it.
- Deleting must be refused while other resources still reference the record.
- Add the resource to the seed data (`scripts/seed/`). Except ImagingStudy: those come only from the
  PACS, through the sync, so put DICOM in `scripts/seed/dicom/` instead.
- Pages go under the patient (`/patients/:id/<resource>/…`) when the resource belongs to one, or
  get their own section otherwise (`/endpoints/…`): add it to `SECTIONS` in the header, and to
  `TOP_PAGES` in `resources/resource-links.ts` so references to it link to its page.

### A new kind of patient identifier

Add an entry to `src/app/fhir/resources/patient/patient-identifiers.json`, then run `npm run seed`:
`key`, `system`, `label` and `searchParam` are required; `use`, `typeCode` / `typeDisplay` (HL7 v2
table 0203) and a form `hint` are optional. That one entry gives the patient form a field for it,
the patient detail its label, a patient without a name a fallback, the search a "Search in"
choice, and HAPI its search parameter.

## Tests

- Specs sit next to the code they test (`*.spec.ts`) and run on Vitest with Angular `TestBed`.
- Await `fixture.whenStable()`; don't use `fakeAsync` or other zone helpers.
- New mappers, pipes and components come with specs. Bug fixes come with a test that fails without
  the fix.

## Before opening a pull request

```bash
npm run lint
npm test -- --watch=false
npx prettier --check .
npm run build             # checks the size budgets
```

Update the README and other docs in the same pull request when the change affects setup,
configuration, commands or behaviour.

## Pull requests

- Open the pull request against `main` and link its issue (`Closes #19`).
- Describe what changed and how you checked it; add screenshots for UI changes.
- CI runs commitlint, ESLint and the unit tests; all three must pass.
- Merge with **Rebase and merge**, so every conventional commit reaches `main` and the changelog.

## Releases

Releases are made by hand from Actions → Release → Run workflow, usually when a milestone is done.
semantic-release works out the version from the commits since the last tag, updates
[CHANGELOG.md](CHANGELOG.md) and publishes the GitHub release.
