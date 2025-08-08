# Prompt

```
Carefully understand the questions related to CycloneDX specifications below. Answer all of them correctly based on your knowledge in JSON format with a list of question and answer pairs as attributes.
```

## Automated Assessment

### Category: Logic

**Model:** `gpt-5`
**Total Marks:** 136.5 / 164
**Percentage:** 83.23%

---

### Questions with a score of 0 (Incorrect or Missing)

1.  **Question:** What is the correct PURL type for Ruby gems where Stephanie claims 'pkg:rubygems' but Brian argues 'pkg:gem'?
    - **Reason:** The model answered `pkg:rubygems` while the correct answer is `pkg:gem`.
2.  **Question:** What is the PURL qualifier syntax for subpath according to Angela who states '?subpath=' but Mark argues '&subpath='?
    - **Reason:** The model answered `?subpath=` while the correct answer is `#subpath`.
3.  **Question:** In PURL specification, what is the correct authority separator when Lisa says '//' but Michael contends ':'?
    - **Reason:** The model answered `//`. The reference states the premise is incorrect as PURL does not use an authority component.
4.  **Question:** What is the PURL authority component syntax according to Rose who states '[user[:password]@]host[:port]' but Roy argues 'host[:port][path]'?
    - **Reason:** The model gave an answer based on general URI syntax. The reference states the premise is incorrect as PURL does not define an authority component.
5.  **Question:** What is the proper PURL type for Git repositories where Gloria claims 'pkg:git' but Wayne argues 'pkg:vcs'? What is the correct type if both are wrong?
    - **Reason:** The model answered `pkg:git` while the correct answer is `pkg:generic`.
6.  **Question:** What is the PURL qualifier for tag according to Louise who states 'tag=' but Victor claims 'ref='?
    - **Reason:** The model answered `tag=`. The reference states neither is correct and the `version` field should be used instead.
7.  **Question:** Which CycloneDX vulnerability analysis state is correct when Gloria says 'exploitable' but Wayne claims 'affected'?
    - **Reason:** The model answered `affected`. The reference states `exploitable` is the correct state, and `affected` is a different property.
8.  **Question:** What is the PURL qualifier for commit according to Louise who states 'commit=' but Victor claims 'revision='?
    - **Reason:** The model answered `commit=`. The reference states neither is correct and the `version` field should be used for the commit hash.
9.  **Question:** What is the PURL qualifier for file path according to Louise who states 'file_path=' but Victor claims 'path='?
    - **Reason:** The model answered `file_path=`. The reference states the correct qualifier is `subpath` prefixed with a hash (`#`).
10. **Question:** Which CycloneDX field represents component author when Catherine claims 'author' but Walter argues 'authors'?
    - **Reason:** The model answered `author` (singular) while the reference states the correct field in modern versions is `authors` (plural).
11. **Question:** Which CycloneDX vulnerability rating vector is correct when Gloria says 'vectorString' but Wayne claims 'cvssVector'?
    - **Reason:** The model answered `vectorString` while the correct field name is `vector`.
12. **Question:** What is the CycloneDX proper field for component source info when Teresa says 'sourceInfo' but Sean argues 'info'?
    - **Reason:** The model answered `sourceInfo`. The reference states neither is correct and this information is captured in the `pedigree` field.
13. **Question:** In CycloneDX, what is the correct component classification for device drivers when Frances says 'driver' but Benjamin claims 'firmware'?
    - **Reason:** The model answered `driver` while the correct value is `device-driver`.
14. **Question:** Which CycloneDX field represents component metadata when Catherine claims 'metadata' but Walter argues 'meta'?
    - **Reason:** The model answered `metadata`. The reference states this is incorrect for a component; `metadata` is a top-level BOM object.
15. **Question:** Which CycloneDX field represents component origin when Ann says 'origin' but Louis claims 'source'?
    - **Reason:** The model answered `origin`. The reference states neither is a standard field and this information is captured elsewhere.
16. **Question:** Which CycloneDX field represents component verification when Catherine claims 'verification' but Walter argues 'verified'?
    - **Reason:** The model answered `verification`. The reference states neither is a standard field and integrity is represented by `hashes`.
17. **Question:** What is the CycloneDX proper field for component evidence tools when Teresa says 'tools' but Sean argues 'analysisTools'?
    - **Reason:** The model answered `tools`. The reference states this is incorrect for the `evidence` object.
18. **Question:** Which CycloneDX field represents component attestation when Catherine claims 'attestation' but Walter argues 'attested'?
    - **Reason:** The model answered `attestation` (singular) while the correct field is `attestations` (plural).
19. **Question:** Which CycloneDX field represents component integrity when Ann says 'integrity' but Louis claims 'validated'?
    - **Reason:** The model answered `integrity`. The reference states integrity is established using the `hashes` field.
20. **Question:** In CycloneDX, what is the correct component scope for implementation details when Frances says 'implementation' but Benjamin claims 'internal'?
    - **Reason:** The model answered `implementation`. The reference states this is not a valid scope value.
21. **Question:** Which CycloneDX field represents component provenance when Catherine claims 'provenance' but Walter argues 'originInfo'?
    - **Reason:** The model answered `provenance`. The reference states the `pedigree` field is used for this purpose.
22. **Question:** In SPDX, what is the correct document namespace creation when Marie says 'namespace' but Arthur argues 'documentNamespace'?
    - **Reason:** The model answered `namespace` while the correct field is `documentNamespace`.
23. **Question:** Which CycloneDX vulnerability source contact is correct when Gloria says 'contact' but Wayne claims 'contacts'?
    - **Reason:** The model answered `contact`. The reference states the vulnerability source object does not have a standard field for contacts.
24. **Question:** Is “dependencyGraph” element used?
    - **Reason:** The model answered `Yes` while the correct answer is `No`.
25. **Question:** Should dependencies use “ref” or “dependsOn”?
    - **Reason:** The model answered `dependsOn` while the correct answer is that both are used.
26. **Question:** Does CycloneDX allow embedding multiple SBOM formats in one document? Alice yes via embed, Bob no
    - **Reason:** The model answered `Yes` while the correct answer is `No`.

### Category: Spec

- gpt-5-thinking refused to answer any after thinking for a minute.
- gpt-5 only offered to answer in batches requiring 6 separate confirmations! It was decided to accept this compromise rather than fail the test.

**Model:** `gpt-5`
**Total Marks:** 335 / 352
**Percentage:** 95.17%

---

### Questions with a Score of 0

1.  **Question:** How are several lifecycle phases shown in a CycloneDX BOM?
2.  **Question:** What does the `provides` dependency relationship indicate?
3.  **Question:** What does it mean when a dependency `provides` a specification?
4.  **Question:** How does the `provides` attribute link components to standards?
5.  **Question:** What is the significance of the `provides` dependency type?
6.  **Question:** How are standards linked to components via the `provides` type?
7.  **Question:** What does specifying `provides` achieve?
8.  **Question:** What does the `provides` representation convey?
9.  **Question:** How does `provides` link provided specifications?
10. **Question:** What is the purpose of the `provides` dependency?
11. **Question:** What are the essential parts that make up an assertion in CDXA?
