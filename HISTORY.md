# Changelog

All notable changes to this project will be documented in this file.

## unreleased

## 3.8.1 - 2022-05-05

* Fixed
  * Added missing handling of `Dependency` when environment variable `BOM_REPRODUCIBLE` is present. (via [#297])
* Misc:
  * Worked packaging from whitelist to blacklist to add files, like `NOTICE`. (via [#289])

[#289]: https://github.com/CycloneDX/cyclonedx-node-module/pull/289
[#297]: https://github.com/CycloneDX/cyclonedx-node-module/pull/297

## 3.8.0 - 2022-04-24

* Added
  * Environment variable `BOM_REPRODUCIBLE` causes bom result to be more consistent
    over multiple runs by omitting time/rand-based values, and sorting lists. (via [#288])
  * Method `Component.compare()` compares self by `purl` or `group`/`name`/`version`. (via [#288])
  * Method `ExternalReference.compare()` compares self by `type`/`url`. (via [#288])
  * Method `Hash.compare()` compares self by `algorithm`/`value`. (via [#288])
  * JSDoc for `ExternalReference`, `ExternalReferenceList`, `Hash`, `HashList`. (via [#288])
* Fixed
  * `ExternalReference.url` is now correctly treated as mandatory. (via [#288])
  * `Hash.value` is now correctly treated as mandatory. (via [#288])
  * `ExternalReferenceList.isEligibleHomepage` now returns the correct result, was inverted. (via [#288])
* Changed
  * Private properties of `ExternalReference`, `ExternalReferenceList`,  `Hash`, `HashList`
    became inaccessible. ([#233] via [#288])
* Misc: Dependencies
  * Bump `jest-junit` from 13.1.0 to 13.2.0 (via [#287])

[#288]: https://github.com/CycloneDX/cyclonedx-node-module/pull/288
[#287]: https://github.com/CycloneDX/cyclonedx-node-module/pull/287

## 3.7.0 - 2022-04-13

* Added
  * Added support for `yarn.lock` file. ([#238] via [#282])
* Misc: Dependencies
  * Bump `@xmldom/xmldom` from 0.7.5 to 0.8.2 (via [#279])
  * Bump `packageurl-js` from 0.0.5 to 0.0.6 (via [#276]) 

[#238]: https://github.com/CycloneDX/cyclonedx-node-module/issues/238
[#282]: https://github.com/CycloneDX/cyclonedx-node-module/pull/282
[#279]: https://github.com/CycloneDX/cyclonedx-node-module/pull/279
[#276]: https://github.com/CycloneDX/cyclonedx-node-module/pull/276

## 3.6.0 - 2022-03-09

* Changed
  * Updated available set of SPDX license. (via [c837ada][commit:c837ada74553d2e73f111e11dcd9be46efed6a00])
* Tests
  * Reduced code duplication and made integration tests more consistent. (via [#271])

[#271]: https://github.com/CycloneDX/cyclonedx-node-module/pull/271
[commit:c837ada74553d2e73f111e11dcd9be46efed6a00]: https://github.com/CycloneDX/cyclonedx-node-module/commit/c837ada74553d2e73f111e11dcd9be46efed6a00

## 3.5.0 - 2022-03-03

* Changed
  * If `homepage` property of a package is solely a period(`.`), then omit `website` entry from the `ExternalReferences`. ([#263] via [#264])
* Documentation
  * Examples use the preferred call via `cyclonedx-node`, instead of the fallback `cyclonedx-bom`. (via [#258])  
    This is a follow-up of [#193].
* Tests
  * Moved integration tests to a dedicated space and updated documentation for it. (via [#260])

[#263]: https://github.com/CycloneDX/cyclonedx-node-module/issues/263
[#264]: https://github.com/CycloneDX/cyclonedx-node-module/pull/264
[#258]: https://github.com/CycloneDX/cyclonedx-node-module/pull/258
[#260]: https://github.com/CycloneDX/cyclonedx-node-module/pull/260

## 3.4.1 - 2022-02-11

* Fixed
  * root-packages without a name no longer cause unexpected crashes ([#252] via [#253])

[#252]: https://github.com/CycloneDX/cyclonedx-node-module/issues/252
[#253]: https://github.com/CycloneDX/cyclonedx-node-module/pull/253

## 3.4.0 - 2022-02-02

* Changed
  * Private/protected properties of Component models are no longer directly accessible. ([#233] via [#247])  
    Access via public getter/setter.
* Fixed
  * Normalization guarantees `component.version`. ([#248] via [#247])
  * Component's constructor may detect & set `author` based on package info. ([#246] via [#247])
* Added
  * JSDoc for Component model. ([#220] via [#247])

[#220]: https://github.com/CycloneDX/cyclonedx-node-module/issues/220
[#233]: https://github.com/CycloneDX/cyclonedx-node-module/issues/233
[#246]: https://github.com/CycloneDX/cyclonedx-node-module/issues/246
[#247]: https://github.com/CycloneDX/cyclonedx-node-module/pull/247
[#248]: https://github.com/CycloneDX/cyclonedx-node-module/issues/248

## 3.3.1 - 2021-12-11

* Fixed
  * Brought deprecated file `bin/cyclonedx-bom` back. (via [#224])  
    File is now a compatibility-layer that spits a warning.

[#224]: https://github.com/CycloneDX/cyclonedx-node-module/pull/224

## 3.3.0 - 2021-12-10

* Changed
  * Renamed `bin/cyclonedx-bom` to `bin/make-bom.js` (via [#216])  
    This is considered a none-breaking change,
    as the CLI use of `npx cyclonedx-node`/`npx cyclonedx-bom`
    is untouched.
  * Errors are no longer thrown as `String`, but inherited `Error`. (via [#217])  
    This is considered a none-breaking change,
    as `Error.toString()` returns the original error message.
* Fixed
  * `ExternalReference.type` setter sets value correctly now. (via [#217])  
    Setter caused an Error or set to `undefined` in the past.
  * `AttachmentText` sets `encoding` correctly via setter and constructor now. (via [#217])  
    Set to `undefined` in the past.

[#216]: https://github.com/CycloneDX/cyclonedx-node-module/pull/216
[#217]: https://github.com/CycloneDX/cyclonedx-node-module/pull/217

## 3.2.0 - 2021-12-07

* Added
  * CLI endpoint `cyclonedx-node` is now available. ([#193] via [#197])  
    Already existing `cyclonedx-bom` stayed as is.
* Fixed
  * CLI no fails longer silently in case of errors. ([#168] via [#210])  
    Instead the exit code is non-zero and a proper error message is displayed.

[#193]: https://github.com/CycloneDX/cyclonedx-node-module/issues/193
[#197]: https://github.com/CycloneDX/cyclonedx-node-module/pull/197
[#168]: https://github.com/CycloneDX/cyclonedx-node-module/issues/168
[#210]: https://github.com/CycloneDX/cyclonedx-node-module/pull/210

## 3.1.3 - 2021-12-05

**Full Changelog**: https://github.com/CycloneDX/cyclonedx-node-module/compare/v3.1.2...v3.1.3

## 3.1.2 - 2021-12-05

**Full Changelog**: https://github.com/CycloneDX/cyclonedx-node-module/compare/v3.1.1...v3.1.2

## 3.1.1 - 2021-09-10

**Full Changelog**: https://github.com/CycloneDX/cyclonedx-node-module/compare/v3.1.0...v3.1.1

## 3.1.0 - 2021-09-07

* Added
  * Added object model support for dependencies.

**Full Changelog**: https://github.com/CycloneDX/cyclonedx-node-module/compare/v3.0.7...v3.1.0

## 3.0.7 - 2021-09-02

**Full Changelog**: https://github.com/CycloneDX/cyclonedx-node-module/compare/v3.0.6...v3.0.7

## 3.0.6 - 2021-09-02

**Full Changelog**: https://github.com/CycloneDX/cyclonedx-node-module/compare/v3.0.5...v3.0.6

## 3.0.5 - 2021-09-02

**Full Changelog**: https://github.com/CycloneDX/cyclonedx-node-module/compare/v3.0.4...v3.0.5

## 3.0.4 - 2021-08-27

**Full Changelog**: https://github.com/CycloneDX/cyclonedx-node-module/compare/v3.0.3...v3.0.4

## 3.0.3 - 2021-07-11

**Full Changelog**: https://github.com/CycloneDX/cyclonedx-node-module/compare/v3.0.2...v3.0.3

## 3.0.2 - 2021-07-02

**Full Changelog**: https://github.com/CycloneDX/cyclonedx-node-module/compare/v3.0.1...v3.0.2

## 3.0.1 - 2021-07-01

**Full Changelog**: https://github.com/CycloneDX/cyclonedx-node-module/compare/v3.0.0...v3.0.1

## 3.0.0 - 2021-06-30

* Breaking changes:
  * Requires Node >= 12.0, was Node >= 8.0 before.
  * CLI
    * Dropped option `-a`/`--append`.
      There is no replacement for it.
    * Dropped option `-s`/`--schema`.
      There is no replacement for it. 
* Changes
  * CLI output in CycloneDX v1.3 spec now,
    was switchable defaulting CycloneDX v1.2 before.
  * Dropped support for CycloneDX v1.2 spec.
  * Dropped support for CycloneDX v1.1 spec.
  * Dropped support for Node version 8.
  * Dropped support for Node version 10.
* Added
  * Supports CycloneDX v1.3 spec.

**Full Changelog**: https://github.com/CycloneDX/cyclonedx-node-module/compare/v2.0.2...v3.0.0
