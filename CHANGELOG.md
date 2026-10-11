## [0.3.0](https://github.com/fragkiadamis/hospital-records/compare/v0.2.0...v0.3.0) (2026-10-11)

### Features

* Add free-text details to conditions, stored as the condition's first note ([1d3cdd2](https://github.com/fragkiadamis/hospital-records/commit/1d3cdd2b7bcfb9b731478004b0c502ce79eaabe9))
* Add terminology client and code search component ([313e82e](https://github.com/fragkiadamis/hospital-records/commit/313e82e68a24b1991469459686adfe2af452a0cc))
* Code conditions in ICD-11 too, with WHO's official ICD-10 ↔ ICD-11 mapping ([f0fef56](https://github.com/fragkiadamis/hospital-records/commit/f0fef56f2a66f61bfba7b47c06f1815b1914ca6c))
* Search SNOMED CT and ICD-10 codes in the condition form ([fdd4c3e](https://github.com/fragkiadamis/hospital-records/commit/fdd4c3e8d9bdd429a4c1044fc33b25841732bd7b))
* Suggest ICD-10 codes from SNOMED CT's official ICD-10 map ([4103dec](https://github.com/fragkiadamis/hospital-records/commit/4103dec3d58ab16d3ee2bc357a6853498df7892e))

## [0.2.0](https://github.com/fragkiadamis/hospital-records/compare/v0.1.0...v0.2.0) (2026-10-11)

### Features

* Add CodeableConcept and Reference pipes ([0d98b87](https://github.com/fragkiadamis/hospital-records/commit/0d98b87c776175a16f6552d51fff2ed846969f62))
* Add CodingChip component and shared code system URIs ([584aeec](https://github.com/fragkiadamis/hospital-records/commit/584aeec79d44b7a36ff66d92239eb9680cf1b296))
* Add condition delete, refused while imaging studies name it as their reason ([26506b0](https://github.com/fragkiadamis/hospital-records/commit/26506b0ef91b3403e8f212503516d08fa017c67c))
* Add condition detail page and link conditions from the patient page ([5060ec3](https://github.com/fragkiadamis/hospital-records/commit/5060ec33ce244ca3f1e51be23c2e53bb8c2476a0))
* Add condition edit page with version conflict handling ([4d00883](https://github.com/fragkiadamis/hospital-records/commit/4d00883ad50ad92ade41507cb46666451ff22c0e))
* Add condition form and create page ([a360aa3](https://github.com/fragkiadamis/hospital-records/commit/a360aa37a202a7f3d988d2ff8566e57a60bcc6ff))
* Add Condition mapper between FHIR resource and form values ([14bae98](https://github.com/fragkiadamis/hospital-records/commit/14bae980a0af7e2809f64e7db7de8055c80af784))
* Add ConditionSummary component ([4d45c01](https://github.com/fragkiadamis/hospital-records/commit/4d45c0166d4ef7d2729d58fbd7b0908076c76263))
* Add generic FHIR REST client ([3f15919](https://github.com/fragkiadamis/hospital-records/commit/3f159197b0e1be5f0078e8a8de91b1d38fe9be4c))
* Add imaging study detail page with series table ([7e9c302](https://github.com/fragkiadamis/hospital-records/commit/7e9c302cc6981b721e0f923b0e6906c5bad59612))
* Add ImagingStudy display helpers and DICOM modality names ([c60e691](https://github.com/fragkiadamis/hospital-records/commit/c60e691f854d72bc8a166f0b44a673091f6cc0c7))
* Add ImagingStudySummary component ([368097a](https://github.com/fragkiadamis/hospital-records/commit/368097a567a30d04d6d2fa2573fe5dab7edb7e63))
* Add patient delete, refused while other records reference the patient ([10573aa](https://github.com/fragkiadamis/hospital-records/commit/10573aa7612cdee82d6ce7c520eb44524e429339))
* Add patient detail page and link it from the patient list ([40b2032](https://github.com/fragkiadamis/hospital-records/commit/40b203238b0807467d66f261b8604e04e1dcba78))
* Add patient edit page with version conflict handling ([4cb6dfc](https://github.com/fragkiadamis/hospital-records/commit/4cb6dfc8d27775a6e4ce907b7e574593f836757d))
* Add patient form and create page ([08313b0](https://github.com/fragkiadamis/hospital-records/commit/08313b0c5cd539a0e4bb435e05bd7674a0fdf948))
* Add patient list page with name search ([f7b988a](https://github.com/fragkiadamis/hospital-records/commit/f7b988a36a9259d29c1930b879e4187bbceadefc))
* Add Patient mapper between FHIR resource and form values ([a0788a9](https://github.com/fragkiadamis/hospital-records/commit/a0788a9999a6859901b2b572170d60cf91130716))
* Add PatientSummary component ([b75f781](https://github.com/fragkiadamis/hospital-records/commit/b75f78195061260056cf39800127c0949a746fe5))
* Format FHIR periods, ages, ranges and onset/abatement values ([e1f75c5](https://github.com/fragkiadamis/hospital-records/commit/e1f75c56fba85015d607248f549a29d4b3b3bc6c))
* Implement FHIR date and name formatting pipes with corresponding tests ([5102979](https://github.com/fragkiadamis/hospital-records/commit/5102979a12c14b2b506664d0988dbeeb0a520db6))
* Link imaging studies and conditions to each other's pages ([b489329](https://github.com/fragkiadamis/hospital-records/commit/b48932969ee3e6501c1a46914a1566ae9d2a5b51))
* Show the patient's conditions on the patient page ([968d166](https://github.com/fragkiadamis/hospital-records/commit/968d166342c8d6f175a19bb19fb95470e8ae8eb3))
* Show the patient's imaging studies on the patient page ([070c49b](https://github.com/fragkiadamis/hospital-records/commit/070c49bf8f489d3ecb7c611c1066a57da9937e13))

### Bug Fixes

* Empty block statement lint error ([7028ac0](https://github.com/fragkiadamis/hospital-records/commit/7028ac0d94f7cfab49837a0396d1d6784597bd79))

### Performance Improvements

* Replace the Tabler icon font with inlined SVG icons ([e297ba4](https://github.com/fragkiadamis/hospital-records/commit/e297ba44894b477c26b476181fc216c7130c5dcb))

## [0.1.0](https://github.com/fragkiadamis/hospital-records/compare/v0.0.0...v0.1.0) (2026-10-11)

### Features

* Add Docker Compose configuration for local development stack with HAPI-FHIR and Orthanc ([8cda994](https://github.com/fragkiadamis/hospital-records/commit/8cda99447df373a99b787453e7802ce3d90384c5))
* Add theming support with light and dark modes ([c680bec](https://github.com/fragkiadamis/hospital-records/commit/c680becc3588f9a3f14ac01dec360bcfbcb7baf4))
* Implement reusable Header component ([24879f6](https://github.com/fragkiadamis/hospital-records/commit/24879f656b114eab581179915b2501e38be55b42))
