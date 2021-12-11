# Changelog

All notable changes to this project will be documented in this file.

## unreleased

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

## 3.1.3

**Full Changelog**: https://github.com/CycloneDX/cyclonedx-node-module/compare/v3.1.2...v3.1.3

## 3.1.2

**Full Changelog**: https://github.com/CycloneDX/cyclonedx-node-module/compare/v3.1.1...v3.1.2

## 3.1.1

**Full Changelog**: https://github.com/CycloneDX/cyclonedx-node-module/compare/v3.1.0...v3.1.1

## 3.1.0

* Added
  * Added object model support for dependencies.

**Full Changelog**: https://github.com/CycloneDX/cyclonedx-node-module/compare/v3.0.7...v3.1.0

## 3.0.7

**Full Changelog**: https://github.com/CycloneDX/cyclonedx-node-module/compare/v3.0.6...v3.0.7

## 3.0.6

**Full Changelog**: https://github.com/CycloneDX/cyclonedx-node-module/compare/v3.0.5...v3.0.6

## 3.0.5

**Full Changelog**: https://github.com/CycloneDX/cyclonedx-node-module/compare/v3.0.4...v3.0.5

## 3.0.4

**Full Changelog**: https://github.com/CycloneDX/cyclonedx-node-module/compare/v3.0.3...v3.0.4

## 3.0.3

**Full Changelog**: https://github.com/CycloneDX/cyclonedx-node-module/compare/v3.0.2...v3.0.3

## 3.0.2

**Full Changelog**: https://github.com/CycloneDX/cyclonedx-node-module/compare/v3.0.1...v3.0.2

## 3.0.1

**Full Changelog**: https://github.com/CycloneDX/cyclonedx-node-module/compare/v3.0.0...v3.0.1

## 3.0.0

**Full Changelog**: https://github.com/CycloneDX/cyclonedx-node-module/compare/v2.0.2...v3.0.0
