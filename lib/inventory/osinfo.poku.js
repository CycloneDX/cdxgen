import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { assert, describe, it } from "poku";

import {
  _resetOsReleaseCache,
  canonicalDistroQualifier,
  getDistroInfo,
  OS_DISTRO_ALIAS,
  OS_NAMESPACE_ALIAS,
} from "./osinfo.js";

const AZURE_LINUX_3_OS_RELEASE = [
  'NAME="Microsoft Azure Linux"',
  'VERSION="3.0.20260809"',
  "ID=azurelinux",
  'VERSION_ID="3.0"',
  'PRETTY_NAME="Microsoft Azure Linux 3.0"',
  'ANSI_COLOR="1;34"',
  'HOME_URL="https://aka.ms/azurelinux"',
  'BUG_REPORT_URL="https://aka.ms/azurelinux"',
  'SUPPORT_URL="https://aka.ms/azurelinux"',
  "",
].join("\n");

const MARINER_2_OS_RELEASE = [
  'NAME="Common Base Linux Mariner"',
  'VERSION="2.0.20260304"',
  "ID=mariner",
  'VERSION_ID="2.0"',
  'PRETTY_NAME="CBL-Mariner/Linux"',
  'ANSI_COLOR="1;34"',
  'HOME_URL="https://aka.ms/cbl-mariner"',
  'BUG_REPORT_URL="https://aka.ms/cbl-mariner"',
  'SUPPORT_URL="https://aka.ms/cbl-mariner"',
  "",
].join("\n");

function osReleaseRoot(body, location = join("etc", "os-release")) {
  const root = mkdtempSync(join(tmpdir(), "cdxgen-osinfo-"));
  const osReleaseFile = join(root, location);
  mkdirSync(dirname(osReleaseFile), { recursive: true });
  writeFileSync(osReleaseFile, body);
  return root;
}

describe("getDistroInfo() azure linux canonicalisation", () => {
  it("canonicalises azurelinux 3.0 to the azure-linux namespace", () => {
    _resetOsReleaseCache();
    const root = osReleaseRoot(AZURE_LINUX_3_OS_RELEASE);
    try {
      const info = getDistroInfo(root);
      assert.strictEqual(info.purlType, "rpm");
      assert.strictEqual(info.namespace, "azure-linux");
      assert.strictEqual(info.distroId, "azure-linux-3.0");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("canonicalises mariner 2.0 (cbl-mariner) to the azure-linux namespace", () => {
    _resetOsReleaseCache();
    const root = osReleaseRoot(MARINER_2_OS_RELEASE);
    try {
      const info = getDistroInfo(root);
      assert.strictEqual(info.purlType, "rpm");
      assert.strictEqual(info.namespace, "azure-linux");
      assert.strictEqual(info.distroId, "azure-linux-2.0");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("canonicalises the cbl-mariner spelling from usr/lib/os-release", () => {
    _resetOsReleaseCache();
    const root = osReleaseRoot(
      'ID=cbl-mariner\nVERSION_ID="2.0"\n',
      join("usr", "lib", "os-release"),
    );
    try {
      const info = getDistroInfo(root);
      assert.strictEqual(info.namespace, "azure-linux");
      assert.strictEqual(info.distroId, "azure-linux-2.0");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("getDistroInfo() vendor aliases", () => {
  const cases = [
    {
      title: "rhel -> redhat",
      body: 'ID=rhel\nVERSION_ID="9.4"\nNAME="Red Hat Enterprise Linux"\n',
      namespace: "redhat",
      distroId: "redhat-9.4",
      purlType: "rpm",
    },
    {
      title: "ol -> oracle",
      body: 'ID=ol\nVERSION_ID="9.8"\n',
      namespace: "oracle",
      distroId: "oracle-9.8",
      purlType: "rpm",
    },
    {
      title: "amzn -> amazon (the spelling the vulnerability feeds publish)",
      body: 'ID=amzn\nVERSION_ID="2023"\n',
      namespace: "amazon",
      distroId: "amazon-2023",
      purlType: "rpm",
    },
    {
      title: "opensuse-leap -> opensuse",
      body: 'ID=opensuse-leap\nVERSION_ID="15.6"\n',
      namespace: "opensuse",
      distroId: "opensuse-leap-15.6",
      purlType: "rpm",
    },
    {
      title: "ubuntu stays ubuntu with codename",
      body: 'ID=ubuntu\nVERSION_ID="22.04"\nVERSION_CODENAME="jammy"\n',
      namespace: "ubuntu",
      distroId: "ubuntu-22.04",
      distroName: "jammy",
      purlType: "deb",
    },
    {
      title: "ubuntu without VERSION_CODENAME falls back to the alias map",
      body: 'ID=ubuntu\nVERSION_ID="26.04"\n',
      namespace: "ubuntu",
      distroId: "ubuntu-26.04",
      distroName: "resolute",
      purlType: "deb",
    },
    {
      title: "debian takes the codename from os-release",
      body: 'ID=debian\nVERSION_ID="13"\nVERSION_CODENAME=trixie\n',
      namespace: "debian",
      distroId: "debian-13",
      distroName: "trixie",
      purlType: "deb",
    },
    {
      title: "alpine stays alpine with major.minor distro id",
      body: 'ID=alpine\nVERSION_ID="3.20.0"\n',
      namespace: "alpine",
      distroId: "alpine-3.20",
      purlType: "apk",
    },
    {
      title: "alpaquita keeps its own vendor and release channel",
      body: 'ID=alpaquita\nID_LIKE=alpine\nVERSION_ID="stream"\n',
      namespace: "alpaquita",
      distroId: "alpaquita-stream",
      purlType: "apk",
    },
  ];
  for (const testCase of cases) {
    it(testCase.title, () => {
      _resetOsReleaseCache();
      const root = osReleaseRoot(testCase.body);
      try {
        const info = getDistroInfo(root);
        assert.strictEqual(info.namespace, testCase.namespace);
        assert.strictEqual(info.distroId, testCase.distroId);
        assert.strictEqual(info.purlType, testCase.purlType);
        if (testCase.distroName) {
          assert.strictEqual(info.distroName, testCase.distroName);
        }
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
});

describe("canonicalDistroQualifier()", () => {
  const cases = [
    ["azurelinux-3.0", "azure-linux-3.0"],
    ["cbl-mariner-2.0", "azure-linux-2.0"],
    ["mariner-2.0", "azure-linux-2.0"],
    ["rhel-9.8", "redhat-9.8"],
    ["ol-9.8", "oracle-9.8"],
    ["oracle-9.8", "oracle-9.8"],
    ["amzn-2023", "amazon-2023"],
    ["amazon-2023", "amazon-2023"],
    // SUSE is deliberately excluded: these values carry the release channel
    ["opensuse-leap-15.6", "opensuse-leap-15.6"],
    ["opensuse-tumbleweed-20260806", "opensuse-tumbleweed-20260806"],
    ["sles-15.6", "sles-15.6"],
    ["alpine-3.20", "alpine-3.20"],
    ["ubuntu-22.04", "ubuntu-22.04"],
  ];
  for (const [input, expected] of cases) {
    it(`${input} -> ${expected}`, () => {
      assert.strictEqual(canonicalDistroQualifier(input), expected);
    });
  }

  it("passes through empty and undefined values", () => {
    assert.strictEqual(canonicalDistroQualifier(""), "");
    assert.strictEqual(canonicalDistroQualifier(undefined), undefined);
  });

  it("does not rewrite a vendor that only contains an alias key as a substring", () => {
    assert.strictEqual(
      canonicalDistroQualifier("marinerish-1.0"),
      "marinerish-1.0",
    );
    assert.strictEqual(
      canonicalDistroQualifier("azurelinuxish-1"),
      "azurelinuxish-1",
    );
  });
});

describe("OS_DISTRO_ALIAS", () => {
  // Debian's os-release only carries the major version, but trivy stamps the
  // distro qualifier from /etc/debian_version (e.g. "debian-12.6"), so every
  // shipped point release needs its own key.
  it("covers every shipped bookworm and trixie point release", () => {
    for (let minor = 1; minor <= 15; minor++) {
      // 12.3 was withdrawn before release; 12.4 shipped the next day
      if (minor === 3) {
        continue;
      }
      assert.strictEqual(OS_DISTRO_ALIAS[`debian-12.${minor}`], "bookworm");
    }
    for (let minor = 1; minor <= 7; minor++) {
      assert.strictEqual(OS_DISTRO_ALIAS[`debian-13.${minor}`], "trixie");
    }
  });

  it("maps the 26.x ubuntu releases", () => {
    assert.strictEqual(OS_DISTRO_ALIAS["ubuntu-26.04"], "resolute");
    assert.strictEqual(OS_DISTRO_ALIAS["ubuntu-26.10"], "stonking");
  });
});

describe("OS_NAMESPACE_ALIAS", () => {
  it("maps every azure linux spelling to azure-linux", () => {
    assert.strictEqual(OS_NAMESPACE_ALIAS.azurelinux, "azure-linux");
    assert.strictEqual(OS_NAMESPACE_ALIAS["cbl-mariner"], "azure-linux");
    assert.strictEqual(OS_NAMESPACE_ALIAS.mariner, "azure-linux");
  });

  it("keeps the historical aliases", () => {
    assert.strictEqual(OS_NAMESPACE_ALIAS.rhel, "redhat");
    assert.strictEqual(OS_NAMESPACE_ALIAS.ol, "oracle");
    // "amazon" is what the vulnerability feeds publish; "amazonlinux" matched
    // neither them nor trivy
    assert.strictEqual(OS_NAMESPACE_ALIAS.amzn, "amazon");
    assert.strictEqual(OS_NAMESPACE_ALIAS.amazonlinux, "amazon");
    assert.strictEqual(OS_NAMESPACE_ALIAS["opensuse-leap"], "opensuse");
    assert.strictEqual(OS_NAMESPACE_ALIAS["opensuse-tumbleweed"], "opensuse");
    assert.strictEqual(OS_NAMESPACE_ALIAS.alma, "almalinux");
    assert.strictEqual(OS_NAMESPACE_ALIAS["rocky-linux"], "rocky");
  });
});
