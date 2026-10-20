import { readdirSync, readFileSync } from "node:fs";

import { assert, describe, it } from "poku";

import { addHbomAnalysisProperties } from "./hbom.js";
import {
  formatHbomHardwareClassSummary,
  getHbomCommandDiagnosticSummary,
  getHbomHardwareClassCounts,
  getHbomPrivilegeGuidance,
  getHbomSummary,
  isHbomLikeBom,
} from "./hbomAnalysis.js";

describe("hbomAnalysis helpers", () => {
  const hbomFixture = {
    metadata: {
      component: {
        name: "demo-host",
        type: "device",
        manufacturer: { name: "Example Corp" },
        properties: [
          { name: "cdx:hbom:platform", value: "linux" },
          { name: "cdx:hbom:architecture", value: "amd64" },
          { name: "cdx:hbom:identifierPolicy", value: "redacted-by-default" },
        ],
      },
    },
    components: [
      {
        name: "eth0",
        properties: [
          { name: "cdx:hbom:hardwareClass", value: "network-interface" },
        ],
      },
      {
        name: "wlan0",
        properties: [
          { name: "cdx:hbom:hardwareClass", value: "network-interface" },
        ],
      },
      {
        name: "nvme0",
        properties: [{ name: "cdx:hbom:hardwareClass", value: "storage" }],
      },
      {
        name: "BAT0",
        properties: [{ name: "cdx:hbom:hardwareClass", value: "power" }],
      },
    ],
    properties: [
      { name: "cdx:hbom:collectorProfile", value: "linux-amd64-v1" },
      { name: "cdx:hbom:targetPlatform", value: "linux" },
      { name: "cdx:hbom:targetArchitecture", value: "amd64" },
      { name: "cdx:hbom:evidence:commandCount", value: "2" },
      {
        name: "cdx:hbom:evidence:command",
        value: "lscpu-json|cpu-memory|/usr/bin/lscpu -J",
      },
      {
        name: "cdx:hbom:evidence:command",
        value: "ip-link-json|network|/usr/sbin/ip -j link",
      },
      { name: "cdx:hbom:evidence:commandDiagnosticCount", value: "2" },
      {
        name: "cdx:hbom:evidence:commandDiagnostic",
        value: JSON.stringify({
          command: "lsusb",
          id: "lsusb",
          installHint:
            "Command not found: install the Linux package providing lsusb (commonly `usbutils`).",
          issue: "missing-command",
          message: "lsusb failed with missing-command",
        }),
      },
      {
        name: "cdx:hbom:evidence:commandDiagnostic",
        value: JSON.stringify({
          command: "drm_info",
          id: "drm-info-json",
          issue: "permission-denied",
          message: "drm_info failed with permission-denied",
          privilegeHint:
            "Retry with --privileged to allow a non-interactive sudo attempt for permission-sensitive Linux commands.",
        }),
      },
      { name: "cdx:hbom:evidence:fileCount", value: "1" },
      { name: "cdx:hbom:evidence:file", value: "/etc/os-release" },
    ],
  };

  it("detects HBOMs from document and component properties", () => {
    assert.strictEqual(isHbomLikeBom(hbomFixture), true);
    assert.strictEqual(
      isHbomLikeBom({ metadata: { component: { type: "application" } } }),
      false,
    );
  });

  it("summarizes hardware classes and evidence", () => {
    assert.deepStrictEqual(getHbomHardwareClassCounts(hbomFixture.components), [
      { hardwareClass: "network-interface", count: 2 },
      { hardwareClass: "power", count: 1 },
      { hardwareClass: "storage", count: 1 },
    ]);
    assert.strictEqual(
      formatHbomHardwareClassSummary(
        getHbomHardwareClassCounts(hbomFixture.components),
      ),
      "network-interface (2), power (1), storage (1)",
    );

    assert.deepStrictEqual(getHbomCommandDiagnosticSummary(hbomFixture), {
      actionableDiagnosticCount: 2,
      commandDiagnosticCount: 2,
      commandDiagnostics: [
        {
          command: "lsusb",
          id: "lsusb",
          installHint:
            "Command not found: install the Linux package providing lsusb (commonly `usbutils`).",
          issue: "missing-command",
          message: "lsusb failed with missing-command",
        },
        {
          command: "drm_info",
          id: "drm-info-json",
          issue: "permission-denied",
          message: "drm_info failed with permission-denied",
          privilegeHint:
            "Retry with --privileged to allow a non-interactive sudo attempt for permission-sensitive Linux commands.",
        },
      ],
      commandErrorCount: 0,
      commandErrorIds: [],
      diagnosticIssues: ["missing-command", "permission-denied"],
      installHintCount: 1,
      installHints: [
        "Command not found: install the Linux package providing lsusb (commonly `usbutils`).",
      ],
      missingCommandCount: 1,
      missingCommandIds: ["lsusb"],
      missingCommands: ["lsusb"],
      partialSupportCount: 0,
      partialSupportIds: [],
      permissionDeniedCommands: ["drm_info"],
      permissionDeniedCount: 1,
      permissionDeniedIds: ["drm-info-json"],
      privilegeHintCount: 1,
      privilegeHints: [
        "Retry with --privileged to allow a non-interactive sudo attempt for permission-sensitive Linux commands.",
      ],
      requiresPrivilegedEnrichment: true,
      timeoutIds: [],
      timeoutCount: 0,
    });

    assert.deepStrictEqual(getHbomSummary(hbomFixture), {
      actionableDiagnosticCount: 2,
      architecture: "amd64",
      collectorProfile: "linux-amd64-v1",
      commandDiagnosticCount: 2,
      commandDiagnostics: [
        {
          command: "lsusb",
          id: "lsusb",
          installHint:
            "Command not found: install the Linux package providing lsusb (commonly `usbutils`).",
          issue: "missing-command",
          message: "lsusb failed with missing-command",
        },
        {
          command: "drm_info",
          id: "drm-info-json",
          issue: "permission-denied",
          message: "drm_info failed with permission-denied",
          privilegeHint:
            "Retry with --privileged to allow a non-interactive sudo attempt for permission-sensitive Linux commands.",
        },
      ],
      commandErrorCount: 0,
      commandErrorIds: [],
      componentCount: 4,
      diagnosticIssues: ["missing-command", "permission-denied"],
      evidenceCommandCount: 2,
      evidenceCommands: [
        "lscpu-json|cpu-memory|/usr/bin/lscpu -J",
        "ip-link-json|network|/usr/sbin/ip -j link",
      ],
      evidenceFileCount: 1,
      evidenceFiles: ["/etc/os-release"],
      hardwareClassCount: 3,
      hardwareClassCounts: [
        { hardwareClass: "network-interface", count: 2 },
        { hardwareClass: "power", count: 1 },
        { hardwareClass: "storage", count: 1 },
      ],
      identifierPolicy: "redacted-by-default",
      installHintCount: 1,
      installHints: [
        "Command not found: install the Linux package providing lsusb (commonly `usbutils`).",
      ],
      manufacturer: "Example Corp",
      metadataName: "demo-host",
      metadataType: "device",
      missingCommandCount: 1,
      missingCommandIds: ["lsusb"],
      missingCommands: ["lsusb"],
      partialSupportCount: 0,
      partialSupportIds: [],
      platform: "linux",
      permissionDeniedCommands: ["drm_info"],
      permissionDeniedCount: 1,
      permissionDeniedIds: ["drm-info-json"],
      privilegeHintCount: 1,
      privilegeHints: [
        "Retry with --privileged to allow a non-interactive sudo attempt for permission-sensitive Linux commands.",
      ],
      requiresPrivilegedEnrichment: true,
      timeoutIds: [],
      timeoutCount: 0,
      topHardwareClasses: [
        { hardwareClass: "network-interface", count: 2 },
        { hardwareClass: "power", count: 1 },
        { hardwareClass: "storage", count: 1 },
      ],
    });
  });

  it("counts invalid command argument diagnostics as other command errors", () => {
    const summary = getHbomCommandDiagnosticSummary({
      properties: [
        {
          name: "cdx:hbom:evidence:commandDiagnostic",
          value: JSON.stringify({
            argumentName: "edid-path",
            command: "edid-decode",
            id: "edid-decode:display-1",
            issue: "invalid-command-argument",
            message:
              "edid-decode:display-1 blocked invalid edid-path: expected an absolute /sys/class/drm/<connector>/edid path after normalization",
          }),
        },
      ],
    });

    assert.deepStrictEqual(summary.commandErrorIds, ["edid-decode:display-1"]);
    assert.strictEqual(summary.commandErrorCount, 1);
    assert.deepStrictEqual(summary.diagnosticIssues, [
      "invalid-command-argument",
    ]);
  });
});

// Real captures from a Windows 11 ARM64 VM; see test/data/hbom-windows/README.md.
const WINDOWS_FIXTURES = new URL(
  "../../test/data/hbom-windows/",
  import.meta.url,
);
const loadWindowsHbom = (name) =>
  JSON.parse(readFileSync(new URL(`${name}.json`, WINDOWS_FIXTURES), "utf8"));
const WINDOWS_HBOM_FIXTURES = Object.freeze([
  "vm-parallels-elevated",
  "vm-parallels-elevated-privileged",
  "vm-parallels-std-local-privileged",
  "vm-parallels-std-network-privileged",
]);

describe("hbomAnalysis on Windows captures", () => {
  it("summarizes an elevated Windows HBOM", () => {
    const summary = getHbomSummary(loadWindowsHbom("vm-parallels-elevated"));

    assert.strictEqual(summary.platform, "windows");
    assert.strictEqual(summary.architecture, "arm64");
    assert.strictEqual(summary.collectorProfile, "windows-arm64-v1");
    assert.strictEqual(summary.identifierPolicy, "redacted-by-default");
    assert.strictEqual(summary.componentCount, 25);
    assert.strictEqual(summary.hardwareClassCount, 17);
    assert.deepStrictEqual(summary.topHardwareClasses[0], {
      count: 5,
      hardwareClass: "storage-volume",
    });
    assert.strictEqual(summary.evidenceCommandCount, 5);
    assert.strictEqual(summary.commandDiagnosticCount, 0);
    assert.strictEqual(summary.requiresPrivilegedEnrichment, false);
    // --privileged adds the windows-cim-privileged batch
    assert.strictEqual(
      getHbomSummary(loadWindowsHbom("vm-parallels-elevated-privileged"))
        .evidenceCommandCount,
      6,
    );
  });

  it("reads the elevated-only denials of a standard user with a local logon", () => {
    const summary = getHbomSummary(
      loadWindowsHbom("vm-parallels-std-local-privileged"),
    );

    assert.strictEqual(summary.componentCount, 25);
    assert.deepStrictEqual(summary.diagnosticIssues, ["permission-denied"]);
    assert.strictEqual(summary.permissionDeniedCount, 5);
    assert.strictEqual(summary.commandErrorCount, 0);
    assert.deepStrictEqual(summary.permissionDeniedIds, [
      "windows-cim-privileged",
      "windows-cim-privileged:encryptableVolume",
      "windows-cim-privileged:secureBootCmdlet",
      "windows-cim-privileged:storageReliability",
      "windows-cim-privileged:tpm",
    ]);
    assert.strictEqual(summary.requiresPrivilegedEnrichment, true);
    assert.match(
      summary.privilegeHints[0],
      /elevated \(Run as administrator\)/u,
    );
  });

  it("reads the network-logon denial as the only diagnostic of a baseline-only HBOM", () => {
    const summary = getHbomSummary(
      loadWindowsHbom("vm-parallels-std-network-privileged"),
    );

    assert.strictEqual(summary.platform, "windows");
    assert.strictEqual(summary.componentCount, 2);
    assert.deepStrictEqual(summary.permissionDeniedIds, [
      "windows-cim-platform:network-logon",
    ]);
    assert.strictEqual(summary.commandDiagnosticCount, 1);
    assert.strictEqual(summary.requiresPrivilegedEnrichment, true);
    assert.match(summary.privilegeHints[0], /network logon/u);
  });

  it("recomputes the analysis properties of each capture unchanged", () => {
    const analysisOf = (bomJson) =>
      bomJson.properties
        .filter((property) => property.name.startsWith("cdx:hbom:analysis:"))
        .map((property) => `${property.name}=${property.value}`)
        .sort();

    for (const name of WINDOWS_HBOM_FIXTURES) {
      const captured = loadWindowsHbom(name);
      assert.ok(analysisOf(captured).length > 0, name);
      assert.deepStrictEqual(
        analysisOf(addHbomAnalysisProperties(structuredClone(captured))),
        analysisOf(captured),
        name,
      );
    }
  });

  it("keeps raw identifiers out of every committed Windows capture", () => {
    const macAddress = /\b[0-9a-f]{2}([:-])[0-9a-f]{2}(\1[0-9a-f]{2}){4}\b/iu;
    const identifierProperty =
      /^cdx:hbom:(serialNumber|deviceSerial|macAddress|platformUuid|volumeUuid|uuid|displaySerialNumber)$/u;

    const fixtures = readdirSync(WINDOWS_FIXTURES).filter(
      (file) =>
        file.endsWith(".json") && file !== "osquery-logical-drives.json",
    );
    assert.strictEqual(fixtures.length, WINDOWS_HBOM_FIXTURES.length);
    for (const file of fixtures) {
      const text = readFileSync(new URL(file, WINDOWS_FIXTURES), "utf8");
      const bomJson = JSON.parse(text);
      assert.doesNotMatch(text, macAddress, file);
      assert.doesNotMatch(text, /[A-Za-z]:\\Users\\/u, file);
      assert.strictEqual(
        bomJson.properties.find(
          (property) => property.name === "cdx:hbom:identifierPolicy",
        )?.value,
        "redacted-by-default",
        file,
      );
      for (const subject of [
        bomJson.metadata.component,
        ...bomJson.components,
      ]) {
        for (const property of subject.properties || []) {
          if (identifierProperty.test(property.name)) {
            assert.match(
              property.value,
              /^redacted/u,
              `${file}: ${subject.name} ${property.name}`,
            );
          }
        }
      }
    }
  });

  it("explains privilege recovery per platform and keeps the Linux wording", () => {
    assert.strictEqual(
      getHbomPrivilegeGuidance("linux"),
      "Some Linux enrichments can likely succeed only with --privileged and a target environment that allows non-interactive sudo.",
    );
    assert.strictEqual(
      getHbomPrivilegeGuidance(undefined),
      getHbomPrivilegeGuidance("linux"),
    );
    const windows = getHbomPrivilegeGuidance("windows");
    assert.match(windows, /Windows/u);
    assert.match(windows, /elevated \(Run as administrator\)/u);
    assert.match(windows, /--privileged/u);
    assert.match(windows, /never prompts/u);
    assert.match(windows, /SSH or WinRM/u);
    assert.doesNotMatch(windows, /sudo/u);
  });
});
