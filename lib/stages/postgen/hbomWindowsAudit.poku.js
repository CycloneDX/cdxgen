import { readFileSync } from "node:fs";

import { assert, describe, it } from "poku";

import { auditBom } from "./auditBom.js";

// Real captures from a Windows 11 ARM64 VM; see test/data/hbom-windows/README.md.
const loadWindowsHbom = (name) =>
  JSON.parse(
    readFileSync(
      new URL(`../../../test/data/hbom-windows/${name}.json`, import.meta.url),
      "utf8",
    ),
  );

const ELEVATED = "vm-parallels-elevated";
const ELEVATED_PRIVILEGED = "vm-parallels-elevated-privileged";
const STD_LOCAL_PRIVILEGED = "vm-parallels-std-local-privileged";
// A network logon: every WMI query is denied, so only the Node baseline remains.
const STD_NETWORK_PRIVILEGED = "vm-parallels-std-network-privileged";
const ALL_CAPTURES = Object.freeze([
  ELEVATED,
  ELEVATED_PRIVILEGED,
  STD_LOCAL_PRIVILEGED,
  STD_NETWORK_PRIVILEGED,
]);

const HBOM_CATEGORIES = "hbom-security,hbom-performance,hbom-compliance";
const auditCapture = (bomJson, categories = HBOM_CATEGORIES) =>
  auditBom(bomJson, { bomAuditCategories: categories });
const only = (findings, ruleId) =>
  findings.filter((finding) => finding.ruleId === ruleId);

function makeLinuxOrWindowsBom(platform, bomProperties) {
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.7",
    serialNumber: "urn:uuid:test-hbom",
    metadata: {
      component: {
        type: "device",
        name: "test-host",
        "bom-ref": "urn:uuid:test-host",
        properties: [{ name: "cdx:hbom:platform", value: platform }],
      },
    },
    components: [],
    properties: bomProperties.map(([name, value]) => ({ name, value })),
  };
}

describe("HBOM audit rules on Windows captures", () => {
  it("reports the unencrypted system volume, and only when BitLocker status was collected (HBS-001)", async () => {
    const findings = only(
      await auditCapture(loadWindowsHbom(ELEVATED_PRIVILEGED)),
      "HBS-001",
    );

    assert.strictEqual(findings.length, 1);
    assert.match(
      findings[0].message,
      /Storage component 'C:' is reported as unencrypted/u,
    );
    // isEncrypted comes from Win32_EncryptableVolume, which only --privileged reads
    assert.deepStrictEqual(
      only(await auditCapture(loadWindowsHbom(ELEVATED)), "HBS-001"),
      [],
    );
  });

  it("finds no raw identifiers in any capture (HBS-004)", async () => {
    for (const name of ALL_CAPTURES) {
      assert.deepStrictEqual(
        only(await auditCapture(loadWindowsHbom(name)), "HBS-004"),
        [],
        name,
      );
    }
  });

  it("flags a Windows HBOM without board or firmware provenance only when the platform batch is missing (HBC-001)", async () => {
    const baselineOnly = only(
      await auditCapture(loadWindowsHbom(STD_NETWORK_PRIVILEGED)),
      "HBC-001",
    );

    assert.strictEqual(baselineOnly.length, 1);
    assert.match(baselineOnly[0].mitigation, /Windows/u);
    for (const name of [ELEVATED, ELEVATED_PRIVILEGED, STD_LOCAL_PRIVILEGED]) {
      assert.deepStrictEqual(
        only(await auditCapture(loadWindowsHbom(name)), "HBC-001"),
        [],
        name,
      );
    }
  });

  it("reports board and BIOS provenance blocked by a network logon, not by the elevated-only batch (HBC-009)", async () => {
    const networkLogon = only(
      await auditCapture(loadWindowsHbom(STD_NETWORK_PRIVILEGED)),
      "HBC-009",
    );

    assert.strictEqual(networkLogon.length, 1);
    assert.deepStrictEqual(networkLogon[0].evidence.permissionDeniedIds, [
      "windows-cim-platform:network-logon",
    ]);
    // windows-cim-privileged holds TPM, BitLocker and reliability data, no board or BIOS fields
    for (const name of [ELEVATED, ELEVATED_PRIVILEGED, STD_LOCAL_PRIVILEGED]) {
      assert.deepStrictEqual(
        only(await auditCapture(loadWindowsHbom(name)), "HBC-009"),
        [],
        name,
      );
    }
  });

  it("gives Windows its own recovery advice for permission-denied and missing encryption evidence (HBC-007, HBC-004)", async () => {
    for (const name of [STD_LOCAL_PRIVILEGED, STD_NETWORK_PRIVILEGED]) {
      const [denied] = only(
        await auditCapture(loadWindowsHbom(name)),
        "HBC-007",
      );
      assert.ok(denied, name);
      // --privileged cannot help a denied network logon, so the headline names the session
      assert.match(
        denied.message,
        /likely require a rerun from a local or elevated session/u,
        name,
      );
      assert.doesNotMatch(denied.message, /--privileged/u, name);
      // One static text for every platform: it must tell a Windows user what
      // to do, and say that nothing elevates or prompts on their behalf.
      assert.match(denied.mitigation, /On Windows it never elevates/u, name);
      assert.match(
        denied.mitigation,
        /elevated \(Run as administrator\)/u,
        name,
      );
    }

    const [noEncryptionEvidence] = only(
      await auditCapture(loadWindowsHbom(ELEVATED)),
      "HBC-004",
    );
    assert.match(noEncryptionEvidence.mitigation, /Windows/u);
    assert.match(noEncryptionEvidence.mitigation, /--privileged/u);
  });

  it("keeps the Linux advice of the permission-denied rule (HBC-007)", async () => {
    const bomJson = makeLinuxOrWindowsBom("linux", [
      ["cdx:hbom:analysis:permissionDeniedCount", "1"],
      ["cdx:hbom:analysis:permissionDeniedIds", "drm-info-json"],
    ]);

    const [finding] = only(await auditCapture(bomJson), "HBC-007");
    assert.match(finding.mitigation, /non-interactive sudo path/u);
    assert.match(finding.message, /likely require a rerun with --privileged$/u);
  });

  it("treats Warning and Unhealthy storage health like a degraded SMART state (HBP-002)", async () => {
    // Not captured: the VM's only disk reports Healthy, so the other
    // MSFT_PhysicalDisk.HealthStatus names that cdx-hbom emits are derived here
    // (https://learn.microsoft.com/en-us/windows-hardware/drivers/storage/msft-physicaldisk).
    const withDiskHealth = (healthStatus) => {
      const bomJson = loadWindowsHbom(ELEVATED_PRIVILEGED);
      const disk = bomJson.components.find((component) =>
        component.properties.some(
          (property) =>
            property.name === "cdx:hbom:hardwareClass" &&
            property.value === "storage",
        ),
      );
      disk.properties.find(
        (property) => property.name === "cdx:hbom:healthStatus",
      ).value = healthStatus;
      return bomJson;
    };

    for (const healthStatus of ["Warning", "Unhealthy"]) {
      const findings = only(
        await auditCapture(withDiskHealth(healthStatus), "hbom-performance"),
        "HBP-002",
      );
      assert.strictEqual(findings.length, 1, healthStatus);
      assert.strictEqual(findings[0].evidence.healthStatus, healthStatus);
    }
    // Healthy is the captured value; Unknown means the state could not be read
    for (const healthStatus of ["Healthy", "Unknown"]) {
      assert.deepStrictEqual(
        only(
          await auditCapture(withDiskHealth(healthStatus), "hbom-performance"),
          "HBP-002",
        ),
        [],
        healthStatus,
      );
    }
  });

  it("keeps the fwupd rule on Linux, where fwupdmgr exists (HBC-008)", async () => {
    const missingFwupd = [
      ["cdx:hbom:analysis:missingCommandIds", "fwupdmgr-devices-json"],
    ];

    assert.strictEqual(
      only(
        await auditCapture(makeLinuxOrWindowsBom("linux", missingFwupd)),
        "HBC-008",
      ).length,
      1,
    );
    assert.deepStrictEqual(
      only(
        await auditCapture(makeLinuxOrWindowsBom("windows", missingFwupd)),
        "HBC-008",
      ),
      [],
    );
  });
});
