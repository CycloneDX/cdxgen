import { assert, describe, it } from "poku";

import {
  createOsQueryFallbackBomRef,
  createOsQueryPackageIdentity,
  createOsQueryPurl,
  deriveOsQueryDescription,
  deriveOsQueryName,
  deriveOsQueryPublisher,
  deriveOsQueryVersion,
  osPackagePropertyName,
  sanitizeOsQueryBomRefValue,
  sanitizeOsQueryIdentity,
  shouldCreateOsQueryPurl,
} from "./osqueryTransform.js";

// Rows as osquery 5.x returns them on the hosts of the real-system runs: every
// value is a string and a NULL column is an empty string.
const DEB_PHP_ROW = {
  name: "php8.3-cli",
  version: "8.3.6-0ubuntu0.24.04.13",
  source: "php8.3",
  size: "5752",
  arch: "amd64",
  revision: "0ubuntu0.24.04.13",
  status: "install ok installed",
  maintainer: "Ubuntu Developers <ubuntu-devel-discuss@lists.ubuntu.com>",
  section: "php",
  priority: "optional",
  admindir: "/var/lib/dpkg",
};
const DEB_EPOCH_ROW = {
  name: "bsdutils",
  version: "1:2.39.3-9ubuntu6.6",
  source: "util-linux (2.39.3-9ubuntu6.6)",
  size: "289",
  arch: "amd64",
  revision: "9ubuntu6.6",
  status: "install ok installed",
  maintainer: "Ubuntu Developers <ubuntu-devel-discuss@lists.ubuntu.com>",
  section: "utils",
  priority: "required",
  admindir: "/var/lib/dpkg",
};
const RPM_EPOCH_ROW = {
  name: "openssl-libs",
  version: "3.5.8",
  release: "1.el9_8",
  source: "openssl-3.5.8-1.el9_8.src.rpm",
  size: "7490835",
  sha1: "b3b4764c426023090093576f42ca02ea4489b381",
  arch: "x86_64",
  epoch: "1",
  install_time: "1790931855",
  vendor: "AlmaLinux",
  package_group: "Unspecified",
};
const RPM_PLAIN_ROW = {
  name: "php-cli",
  version: "8.0.30",
  release: "8.el9_8.alma.1",
  source: "php-8.0.30-8.el9_8.alma.1.src.rpm",
  size: "16976035",
  sha1: "d105f558645f421571ecfb1bb4cda372c6514e31",
  arch: "x86_64",
  epoch: "",
  install_time: "1792683935",
  vendor: "AlmaLinux",
  package_group: "Unspecified",
};
const BREW_FORMULA_ROW = {
  name: "php",
  path: "/opt/homebrew/Cellar/php",
  version: "8.5.11_1",
  type: "formula",
  auto_updates: "",
  app_name: "",
};
const BREW_CASK_ROW = {
  name: "android-commandlinetools",
  path: "/opt/homebrew/Caskroom/android-commandlinetools",
  version: "15859902",
  type: "cask",
  auto_updates: "0",
  app_name: "",
};
const UBUNTU_2404 = {
  purlType: "deb",
  namespace: "ubuntu",
  distroId: "ubuntu-24.04",
  distroName: "noble",
};
const ALMALINUX_98 = {
  purlType: "rpm",
  namespace: "almalinux",
  distroId: "almalinux-9.8",
  distroName: "",
};
const ALPINE_324 = {
  purlType: "apk",
  namespace: "alpine",
  distroId: "alpine-3.24.3",
  distroName: "alpine-3.24",
};

describe("osqueryTransform helpers", () => {
  it("derives version, name, publisher, and description from osquery rows", () => {
    const row = {
      pid: "1024",
      provider: "null",
      summary: "sample description",
    };
    assert.strictEqual(deriveOsQueryVersion(row), "1024");
    assert.strictEqual(deriveOsQueryName(row, false), "1024");
    assert.strictEqual(deriveOsQueryPublisher(row), "");
    assert.strictEqual(deriveOsQueryDescription(row), "sample description");
  });

  it("falls back to query name for single-row synthetic entries", () => {
    const row = {};
    assert.strictEqual(deriveOsQueryName(row, true, "os-image"), "os-image");
  });

  it("sanitizes osquery identity strings used in purl fields", () => {
    assert.strictEqual(
      sanitizeOsQueryIdentity("{My App:%Name}"),
      "My+App--Name",
    );
  });

  it("creates valid purl strings for osquery-derived components", () => {
    const purl = createOsQueryPurl(
      "swid",
      "microsoft",
      "windows+11",
      "22H2",
      undefined,
      "windows",
    );
    assert.ok(purl.startsWith("pkg:swid/microsoft/"));
    assert.ok(purl.includes("@22H2"));
  });

  it("creates readable fallback bom-ref strings for non-package osquery rows", () => {
    const bomRef = createOsQueryFallbackBomRef(
      "authorized_keys_snapshot",
      "data",
      "root",
      "ssh-ed25519",
      "key_file",
      "/root/.ssh/authorized_keys",
    );
    assert.strictEqual(
      bomRef,
      "osquery:authorized_keys_snapshot:data:root@ssh-ed25519[key_file=/root/.ssh/authorized_keys]",
    );
  });

  it("omits the bracketed suffix when no extra identity field exists", () => {
    const bomRef = createOsQueryFallbackBomRef(
      "windows_run_keys",
      "data",
      "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\Updater",
      undefined,
    );
    assert.strictEqual(
      bomRef,
      "osquery:windows_run_keys:data:HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\Updater@unknown",
    );
  });

  it("sanitizes fallback bom-ref fragments without percent-encoding them", () => {
    assert.strictEqual(
      sanitizeOsQueryBomRefValue(" launchd: updater@[user]=#1\n"),
      "launchd- updater--user---1",
    );
  });

  it("limits purl generation to package-like osquery component types", () => {
    assert.strictEqual(shouldCreateOsQueryPurl(undefined), true);
    assert.strictEqual(shouldCreateOsQueryPurl("application"), true);
    assert.strictEqual(shouldCreateOsQueryPurl("operating-system"), true);
    assert.strictEqual(shouldCreateOsQueryPurl("data"), false);
    assert.strictEqual(shouldCreateOsQueryPurl("device"), false);
    assert.strictEqual(shouldCreateOsQueryPurl("cryptographic-asset"), false);
  });
});

describe("createOsQueryPurl() for rows that are not OS packages", () => {
  // The OS package categories moved to createOsQueryPackageIdentity. Rows that
  // describe a file or an app keep the path of the row as their subpath.
  it("keeps the path of an app row as the subpath", () => {
    assert.strictEqual(
      createOsQueryPurl(
        "swid",
        "",
        "Safari",
        "17.1",
        undefined,
        "/Applications/Safari.app",
      ),
      "pkg:swid/Safari@17.1?tag_id=Safari#Applications/Safari.app",
    );
  });

  it("keeps the path of the pypi and npm rows, which this change leaves alone", () => {
    assert.strictEqual(
      createOsQueryPurl(
        "pypi",
        "",
        "requests",
        "2.31.0",
        undefined,
        "/usr/lib/python3/dist-packages/requests",
      ),
      "pkg:pypi/requests@2.31.0#usr/lib/python3/dist-packages/requests",
    );
    assert.strictEqual(
      createOsQueryPurl(
        "npm",
        "",
        "left-pad",
        "1.3.0",
        undefined,
        "/usr/lib/node_modules/left-pad",
      ),
      "pkg:npm/left-pad@1.3.0#usr/lib/node_modules/left-pad",
    );
  });

  it("keeps the Windows tag_id qualifier", () => {
    assert.strictEqual(
      createOsQueryPurl(
        "chocolatey",
        "",
        "php",
        "8.4.0",
        { tag_id: "abc-1" },
        undefined,
      ),
      "pkg:chocolatey/php@8.4.0?tag_id=abc-1",
    );
  });
});

describe("createOsQueryPackageIdentity()", () => {
  it("gives a deb row its qualifiers, with no subpath", () => {
    const identity = createOsQueryPackageIdentity(
      "deb",
      DEB_PHP_ROW,
      "php8.3-cli",
      UBUNTU_2404,
    );
    assert.deepStrictEqual(identity, {
      version: "8.3.6-0ubuntu0.24.04.13",
      purl: "pkg:deb/ubuntu/php8.3-cli@8.3.6-0ubuntu0.24.04.13?arch=amd64&distro=ubuntu-24.04&distro_name=noble",
    });
  });

  it("keeps the version of a deb row with an epoch and adds the qualifier", () => {
    assert.deepStrictEqual(
      createOsQueryPackageIdentity(
        "deb",
        DEB_EPOCH_ROW,
        "bsdutils",
        UBUNTU_2404,
      ),
      {
        version: "1:2.39.3-9ubuntu6.6",
        purl: "pkg:deb/ubuntu/bsdutils@1:2.39.3-9ubuntu6.6?arch=amd64&distro=ubuntu-24.04&distro_name=noble&epoch=1",
      },
    );
  });

  it("gives an rpm row the release in its version and a non-zero epoch in both places", () => {
    assert.deepStrictEqual(
      createOsQueryPackageIdentity(
        "rpm",
        RPM_EPOCH_ROW,
        "openssl-libs",
        ALMALINUX_98,
      ),
      {
        version: "1:3.5.8-1.el9_8",
        purl: "pkg:rpm/almalinux/openssl-libs@1:3.5.8-1.el9_8?arch=x86_64&distro=almalinux-9.8&epoch=1",
      },
    );
  });

  it("gives an rpm row without an epoch the release and no epoch", () => {
    assert.deepStrictEqual(
      createOsQueryPackageIdentity(
        "rpm",
        RPM_PLAIN_ROW,
        "php-cli",
        ALMALINUX_98,
      ),
      {
        version: "8.0.30-8.el9_8.alma.1",
        purl: "pkg:rpm/almalinux/php-cli@8.0.30-8.el9_8.alma.1?arch=x86_64&distro=almalinux-9.8",
      },
    );
    assert.ok(
      !createOsQueryPackageIdentity(
        "rpm",
        { ...RPM_PLAIN_ROW, epoch: "0" },
        "php-cli",
        ALMALINUX_98,
      ).purl.includes("epoch"),
    );
  });

  it("gives an apk row the distro of the host", () => {
    assert.deepStrictEqual(
      createOsQueryPackageIdentity(
        "apk",
        { name: "php84", version: "8.4.27-r0", arch: "x86_64" },
        "php84",
        ALPINE_324,
      ),
      {
        version: "8.4.27-r0",
        purl: "pkg:apk/alpine/php84@8.4.27-r0?arch=x86_64&distro=alpine-3.24.3&distro_name=alpine-3.24",
      },
    );
  });

  it("gives a Homebrew formula the brew type", () => {
    assert.deepStrictEqual(
      createOsQueryPackageIdentity("brew", BREW_FORMULA_ROW, "php"),
      { version: "8.5.11_1", purl: "pkg:brew/php@8.5.11_1" },
    );
  });

  it("gives a cask the same purl form as a formula", () => {
    assert.deepStrictEqual(
      createOsQueryPackageIdentity(
        "brew",
        BREW_CASK_ROW,
        "android-commandlinetools",
      ),
      {
        version: "15859902",
        purl: "pkg:brew/android-commandlinetools@15859902",
      },
    );
  });

  it("never lets a path, admindir or source file become a subpath", () => {
    for (const [type, row, name, distro] of [
      ["deb", DEB_PHP_ROW, "php8.3-cli", UBUNTU_2404],
      ["rpm", RPM_EPOCH_ROW, "openssl-libs", ALMALINUX_98],
      ["brew", BREW_FORMULA_ROW, "php", undefined],
      ["brew", BREW_CASK_ROW, "android-commandlinetools", undefined],
    ]) {
      const { purl } = createOsQueryPackageIdentity(type, row, name, distro);
      assert.ok(!purl.includes("#"), purl);
    }
  });

  it("returns a null purl when the host has no vendor to name", () => {
    const { purl, version } = createOsQueryPackageIdentity(
      "deb",
      DEB_PHP_ROW,
      "php8.3-cli",
      { namespace: "", distroId: "", distroName: "" },
    );
    assert.strictEqual(purl, null);
    assert.strictEqual(version, "8.3.6-0ubuntu0.24.04.13");
  });
});

describe("osPackagePropertyName()", () => {
  it("names the source package of a deb and drops the dpkg admin directory", () => {
    assert.strictEqual(
      osPackagePropertyName("deb", "source"),
      "cdx:deb:source",
    );
    assert.strictEqual(osPackagePropertyName("deb", "admindir"), undefined);
    assert.strictEqual(osPackagePropertyName("deb", "arch"), "arch");
    assert.strictEqual(osPackagePropertyName("deb", "revision"), "revision");
  });

  it("names the source rpm file of an rpm", () => {
    assert.strictEqual(
      osPackagePropertyName("rpm", "source"),
      "cdx:rpm:sourceRpm",
    );
    assert.strictEqual(osPackagePropertyName("rpm", "vendor"), "vendor");
    assert.strictEqual(osPackagePropertyName("rpm", "epoch"), "epoch");
  });

  it("names the origin of an apk package", () => {
    assert.strictEqual(
      osPackagePropertyName("apk", "origin"),
      "cdx:apk:origin",
    );
  });

  it("says whether a Homebrew entry is a formula or a cask", () => {
    assert.strictEqual(
      osPackagePropertyName("brew", "type"),
      "cdx:homebrew:type",
    );
    assert.strictEqual(osPackagePropertyName("brew", "path"), "path");
  });

  it("leaves the columns of every other category as they are", () => {
    assert.strictEqual(osPackagePropertyName("pypi", "source"), "source");
    assert.strictEqual(osPackagePropertyName("swid", "type"), "type");
    assert.strictEqual(
      osPackagePropertyName(undefined, "admindir"),
      "admindir",
    );
  });
});
