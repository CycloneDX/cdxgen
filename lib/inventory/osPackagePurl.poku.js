import { Purl, roundTrip } from "@cdxgen/cdx-purl";
import { assert, describe, it } from "poku";

import {
  buildOsPackagePurl,
  isOsPackagePurlType,
  isRealArchitecture,
  osPackageEpoch,
  osPackageVersion,
} from "./osPackagePurl.js";

// What getDistroInfo() returns for the images the real-system runs used.
const UBUNTU_2404 = {
  purlType: "deb",
  namespace: "ubuntu",
  distroId: "ubuntu-24.04",
  distroName: "noble",
};
const DEBIAN_12 = {
  purlType: "deb",
  namespace: "debian",
  distroId: "debian-12",
  distroName: "bookworm",
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
const WOLFI = {
  purlType: "apk",
  namespace: "wolfi",
  distroId: "wolfi-20230201",
  distroName: "",
};
// archlinux:latest: os-release has ID=arch, BUILD_ID=rolling and the image
// build stamp as its VERSION_ID.
const ARCH = {
  purlType: "alpm",
  namespace: "arch",
  distroId: "arch-20261018.0.612668",
  distroName: "",
};

describe("isRealArchitecture()", () => {
  it("accepts the architectures packages have", () => {
    for (const arch of [
      "amd64",
      "x86_64",
      "aarch64",
      "noarch",
      "all",
      "arm64",
    ]) {
      assert.strictEqual(isRealArchitecture(arch), true, arch);
    }
  });

  it("rejects what stands in for a package with none", () => {
    for (const arch of [
      "",
      " ",
      "(none)",
      "None",
      "none",
      "NONE",
      undefined,
      null,
    ]) {
      assert.strictEqual(isRealArchitecture(arch), false, `${arch}`);
    }
  });
});

describe("isOsPackagePurlType()", () => {
  it("accepts the package managers an OS scan inventories", () => {
    for (const type of [
      "deb",
      "rpm",
      "apk",
      "alpm",
      "brew",
      "macports",
      "snap",
      "flatpak",
    ]) {
      assert.strictEqual(isOsPackagePurlType(type), true, type);
    }
  });

  it("leaves the other osquery purl types to createOsQueryPurl", () => {
    for (const type of [
      "swid",
      "pypi",
      "npm",
      "ebuild",
      "chocolatey",
      "generic",
      "",
      undefined,
    ]) {
      assert.strictEqual(isOsPackagePurlType(type), false, `${type}`);
    }
  });
});

describe("buildOsPackagePurl() deb", () => {
  it("gives a package the qualifiers the container scan gives it, and no subpath", () => {
    const purl = buildOsPackagePurl(
      {
        type: "deb",
        name: "php8.3-cli",
        version: "8.3.6-0ubuntu0.24.04.13",
        arch: "amd64",
      },
      UBUNTU_2404,
    );
    assert.strictEqual(
      purl,
      "pkg:deb/ubuntu/php8.3-cli@8.3.6-0ubuntu0.24.04.13?arch=amd64&distro=ubuntu-24.04&distro_name=noble",
    );
    assert.ok(!Purl.parse(purl).subpath, purl);
  });

  it("matches the Debian 12 purl of the brief", () => {
    assert.strictEqual(
      buildOsPackagePurl(
        {
          type: "deb",
          name: "php8.2-cli",
          version: "8.2.35-1~deb12u1",
          arch: "arm64",
        },
        DEBIAN_12,
      ),
      "pkg:deb/debian/php8.2-cli@8.2.35-1~deb12u1?arch=arm64&distro=debian-12&distro_name=bookworm",
    );
  });

  it("keeps the version as dpkg reports it and adds the epoch qualifier", () => {
    assert.strictEqual(
      buildOsPackagePurl(
        { type: "deb", name: "php-common", version: "2:93", arch: "all" },
        DEBIAN_12,
      ),
      "pkg:deb/debian/php-common@2:93?arch=all&distro=debian-12&distro_name=bookworm&epoch=2",
    );
    assert.strictEqual(
      buildOsPackagePurl(
        {
          type: "deb",
          name: "bsdutils",
          version: "1:2.39.3-9ubuntu6.6",
          arch: "amd64",
        },
        UBUNTU_2404,
      ),
      "pkg:deb/ubuntu/bsdutils@1:2.39.3-9ubuntu6.6?arch=amd64&distro=ubuntu-24.04&distro_name=noble&epoch=1",
    );
  });

  it("adds no epoch qualifier for a version without an epoch or with epoch 0", () => {
    const purl = buildOsPackagePurl(
      { type: "deb", name: "libc6", version: "2.39-0ubuntu8.9", arch: "amd64" },
      UBUNTU_2404,
    );
    assert.ok(!purl.includes("epoch"));
    const zero = buildOsPackagePurl(
      { type: "deb", name: "old", version: "0:1.0-1", arch: "amd64" },
      UBUNTU_2404,
    );
    assert.ok(!zero.includes("epoch="));
    assert.ok(zero.includes("@0:1.0-1"), zero);
  });

  it("encodes the characters a purl cannot hold", () => {
    assert.strictEqual(
      buildOsPackagePurl(
        { type: "deb", name: "bash", version: "5.2.15-2+b9", arch: "amd64" },
        DEBIAN_12,
      ),
      "pkg:deb/debian/bash@5.2.15-2%2Bb9?arch=amd64&distro=debian-12&distro_name=bookworm",
    );
    assert.strictEqual(
      buildOsPackagePurl(
        {
          type: "deb",
          name: "libstdc++6",
          version: "14.2.0-4ubuntu2~24.04",
          arch: "amd64",
        },
        UBUNTU_2404,
      ),
      "pkg:deb/ubuntu/libstdc%2B%2B6@14.2.0-4ubuntu2~24.04?arch=amd64&distro=ubuntu-24.04&distro_name=noble",
    );
  });

  it("keeps a multiarch pair of one package as two purls", () => {
    const purls = ["amd64", "i386"].map((arch) =>
      buildOsPackagePurl(
        { type: "deb", name: "libc6", version: "2.39-0ubuntu8.9", arch },
        UBUNTU_2404,
      ),
    );
    assert.notStrictEqual(purls[0], purls[1]);
  });
});

describe("buildOsPackagePurl() rpm", () => {
  it("joins the version and the release", () => {
    assert.strictEqual(
      buildOsPackagePurl(
        {
          type: "rpm",
          name: "acl",
          version: "2.4.0",
          release: "1.el9_8",
          arch: "x86_64",
        },
        ALMALINUX_98,
      ),
      "pkg:rpm/almalinux/acl@2.4.0-1.el9_8?arch=x86_64&distro=almalinux-9.8",
    );
  });

  it("puts a non-zero epoch in the version and the qualifier, as the container scan does", () => {
    assert.strictEqual(
      buildOsPackagePurl(
        {
          type: "rpm",
          name: "openssl-libs",
          version: "3.5.8",
          release: "1.el9_8",
          epoch: "1",
          arch: "x86_64",
        },
        ALMALINUX_98,
      ),
      "pkg:rpm/almalinux/openssl-libs@1:3.5.8-1.el9_8?arch=x86_64&distro=almalinux-9.8&epoch=1",
    );
  });

  it("treats an epoch of 0, an empty epoch and rpm's (none) as no epoch", () => {
    for (const epoch of ["0", 0, "", undefined, null, "(none)", "00"]) {
      const purl = buildOsPackagePurl(
        {
          type: "rpm",
          name: "acl",
          version: "2.4.0",
          release: "1.el9_8",
          epoch,
          arch: "x86_64",
        },
        ALMALINUX_98,
      );
      assert.ok(!purl.includes("epoch"), `${JSON.stringify(epoch)}: ${purl}`);
      assert.ok(purl.includes("@2.4.0-1.el9_8?"), purl);
    }
  });

  it("stamps no distro_name where the container scan stamps none", () => {
    const purl = buildOsPackagePurl(
      {
        type: "rpm",
        name: "acl",
        version: "2.4.0",
        release: "1",
        arch: "noarch",
      },
      ALMALINUX_98,
    );
    assert.ok(!purl.includes("distro_name"), purl);
  });

  it("leaves out an architecture rpm does not have", () => {
    // rpm says (none) for it and trivy says None; neither is an architecture.
    for (const arch of ["(none)", "None", "none", "", undefined]) {
      const purl = buildOsPackagePurl(
        {
          type: "rpm",
          name: "gpg-pubkey",
          version: "8483c65d",
          release: "5ccc5b19",
          arch,
        },
        ALMALINUX_98,
      );
      assert.strictEqual(
        purl,
        "pkg:rpm/almalinux/gpg-pubkey@8483c65d-5ccc5b19?distro=almalinux-9.8",
      );
    }
  });

  it("falls back to the bare version when the release is missing", () => {
    assert.strictEqual(
      buildOsPackagePurl(
        { type: "rpm", name: "x", version: "1.0", arch: "x86_64" },
        ALMALINUX_98,
      ),
      "pkg:rpm/almalinux/x@1.0?arch=x86_64&distro=almalinux-9.8",
    );
  });
});

describe("buildOsPackagePurl() apk", () => {
  it("gives Alpine the distro and release series the container scan gives it", () => {
    assert.strictEqual(
      buildOsPackagePurl(
        { type: "apk", name: "php84", version: "8.4.27-r0", arch: "x86_64" },
        ALPINE_324,
      ),
      "pkg:apk/alpine/php84@8.4.27-r0?arch=x86_64&distro=alpine-3.24.3&distro_name=alpine-3.24",
    );
  });

  it("gives Wolfi its own vendor", () => {
    assert.strictEqual(
      buildOsPackagePurl(
        {
          type: "apk",
          name: "wolfi-baselayout",
          version: "20230201-r30",
          arch: "x86_64",
        },
        WOLFI,
      ),
      "pkg:apk/wolfi/wolfi-baselayout@20230201-r30?arch=x86_64&distro=wolfi-20230201",
    );
  });

  it("ignores the release and epoch fields: an apk version is one string", () => {
    assert.strictEqual(
      buildOsPackagePurl(
        {
          type: "apk",
          name: "musl",
          version: "1.2.6-r3",
          release: "r9",
          epoch: "4",
          arch: "x86_64",
        },
        WOLFI,
      ),
      "pkg:apk/wolfi/musl@1.2.6-r3?arch=x86_64&distro=wolfi-20230201",
    );
  });
});

describe("buildOsPackagePurl() brew", () => {
  it("gives a formula the Homebrew type and nothing else", () => {
    assert.strictEqual(
      buildOsPackagePurl({ type: "brew", name: "php", version: "8.5.11_1" }),
      "pkg:brew/php@8.5.11_1",
    );
  });

  it("takes no distro, architecture or subpath", () => {
    assert.strictEqual(
      buildOsPackagePurl(
        { type: "brew", name: "php", version: "8.5.11_1", arch: "arm64" },
        ALMALINUX_98,
      ),
      "pkg:brew/php@8.5.11_1",
    );
  });

  it("encodes a versioned formula name", () => {
    assert.strictEqual(
      buildOsPackagePurl({
        type: "brew",
        name: "php@8.4",
        version: "8.4.26_1",
      }),
      "pkg:brew/php%408.4@8.4.26_1",
    );
  });
});

describe("buildOsPackagePurl() alpm", () => {
  it("names a pacman package as the purl spec's alpm examples do, epoch included", () => {
    assert.strictEqual(
      buildOsPackagePurl(
        { type: "alpm", name: "zlib", version: "1:1.3.2-4", arch: "x86_64" },
        ARCH,
      ),
      "pkg:alpm/arch/zlib@1:1.3.2-4?arch=x86_64",
    );
    assert.strictEqual(
      buildOsPackagePurl(
        {
          type: "alpm",
          name: "filesystem",
          version: "2025.10.12-1",
          arch: "any",
        },
        ARCH,
      ),
      "pkg:alpm/arch/filesystem@2025.10.12-1?arch=any",
    );
  });

  it("carries no distro, distro_name or epoch qualifier, which the alpm type does not define", () => {
    const purl = buildOsPackagePurl(
      { type: "alpm", name: "zlib", version: "1:1.3.2-4", arch: "x86_64" },
      { ...ARCH, distroName: "rolling" },
    );
    assert.ok(!purl.includes("distro"), purl);
    assert.ok(!purl.includes("epoch="), purl);
    assert.deepStrictEqual(Object.keys(Purl.parse(purl).qualifiers || {}), [
      "arch",
    ]);
  });

  it("takes the vendor of a derivative and encodes the characters a purl cannot hold", () => {
    assert.strictEqual(
      buildOsPackagePurl(
        {
          type: "alpm",
          name: "glibc",
          version: "2.44+r50+g1848099f063e-1",
          arch: "x86_64",
        },
        { ...ARCH, namespace: "manjaro", distroId: "manjaro-26.0.1" },
      ),
      "pkg:alpm/manjaro/glibc@2.44%2Br50%2Bg1848099f063e-1?arch=x86_64",
    );
  });

  it("needs a vendor", () => {
    assert.strictEqual(
      buildOsPackagePurl(
        { type: "alpm", name: "zlib", version: "1:1.3.2-4" },
        { namespace: "", distroId: "", distroName: "" },
      ),
      null,
    );
  });
});

describe("buildOsPackagePurl() snap, flatpak and MacPorts", () => {
  it("gives a snap its name and version and nothing else", () => {
    assert.strictEqual(
      buildOsPackagePurl(
        { type: "snap", name: "core22", version: "20250408", arch: "arm64" },
        UBUNTU_2404,
      ),
      "pkg:snap/core22@20250408",
    );
  });

  it("gives a flatpak its application ID and the arch and branch of its ref", () => {
    assert.strictEqual(
      buildOsPackagePurl({
        type: "flatpak",
        name: "org.gnome.Calculator",
        version: "48.1",
        arch: "aarch64",
        branch: "stable",
      }),
      "pkg:flatpak/org.gnome.Calculator@48.1?arch=aarch64&branch=stable",
    );
    assert.strictEqual(
      buildOsPackagePurl({
        type: "flatpak",
        name: "com.github.IsmaelMartinez.teams_for_linux",
        version: "2.1.0",
        arch: "x86_64",
        branch: "stable",
      }),
      "pkg:flatpak/com.github.IsmaelMartinez.teams_for_linux@2.1.0?arch=x86_64&branch=stable",
    );
  });

  it("leaves out the version of a flatpak runtime that AppStream does not describe", () => {
    assert.strictEqual(
      buildOsPackagePurl({
        type: "flatpak",
        name: "org.gnome.Platform",
        version: "",
        arch: "x86_64",
        branch: "48",
      }),
      "pkg:flatpak/org.gnome.Platform?arch=x86_64&branch=48",
    );
  });

  it("joins a MacPorts version to its revision, revision 0 included", () => {
    assert.strictEqual(
      buildOsPackagePurl({
        type: "macports",
        name: "openssl3",
        version: "3.6.0",
        revision: "0",
        arch: "arm64",
      }),
      "pkg:macports/openssl3@3.6.0_0",
    );
    assert.strictEqual(
      buildOsPackagePurl({
        type: "macports",
        name: "py312-requests",
        version: "2.32.3",
        revision: 1,
      }),
      "pkg:macports/py312-requests@2.32.3_1",
    );
  });

  it("builds purls that cdx-purl reads back unchanged, although the types are not in the spec", () => {
    for (const purl of [
      buildOsPackagePurl(
        { type: "alpm", name: "zlib", version: "1:1.3.2-4", arch: "x86_64" },
        ARCH,
      ),
      buildOsPackagePurl({ type: "snap", name: "hello", version: "2.10" }),
      buildOsPackagePurl({
        type: "flatpak",
        name: "org.gnome.Calculator",
        version: "48.1",
        arch: "aarch64",
        branch: "stable",
      }),
      buildOsPackagePurl({
        type: "macports",
        name: "openssl3",
        version: "3.6.0",
        revision: "0",
      }),
    ]) {
      assert.strictEqual(roundTrip(purl), purl);
    }
  });
});

describe("buildOsPackagePurl() refusals", () => {
  it("returns null instead of an invalid purl", () => {
    assert.strictEqual(
      buildOsPackagePurl(
        { type: "deb", name: "x", version: "1", arch: "amd64" },
        { namespace: "", distroId: "", distroName: "" },
      ),
      null,
    );
    assert.strictEqual(
      buildOsPackagePurl({ type: "deb", version: "1" }, UBUNTU_2404),
      null,
    );
    assert.strictEqual(
      buildOsPackagePurl(
        { type: "pypi", name: "x", version: "1" },
        UBUNTU_2404,
      ),
      null,
    );
    assert.strictEqual(buildOsPackagePurl(undefined, UBUNTU_2404), null);
  });

  it("builds without a version", () => {
    assert.strictEqual(
      buildOsPackagePurl({ type: "apk", name: "x", arch: "x86_64" }, WOLFI),
      "pkg:apk/wolfi/x?arch=x86_64&distro=wolfi-20230201",
    );
  });
});

describe("osPackageVersion() and osPackageEpoch()", () => {
  it("builds the version the container scan writes on the component", () => {
    assert.strictEqual(
      osPackageVersion({
        type: "rpm",
        version: "3.5.8",
        release: "1.el9_8",
        epoch: "1",
      }),
      "1:3.5.8-1.el9_8",
    );
    assert.strictEqual(
      osPackageVersion({ type: "rpm", version: "2.4.0", release: "1.el9_8" }),
      "2.4.0-1.el9_8",
    );
    assert.strictEqual(
      osPackageVersion({ type: "deb", version: "1:2.39.3-9ubuntu6.6" }),
      "1:2.39.3-9ubuntu6.6",
    );
    assert.strictEqual(
      osPackageVersion({ type: "apk", version: "8.4.27-r0" }),
      "8.4.27-r0",
    );
    assert.strictEqual(
      osPackageVersion({ type: "brew", version: "8.5.11_1" }),
      "8.5.11_1",
    );
  });

  it("does not put the epoch of a deb version in it twice", () => {
    assert.strictEqual(
      osPackageVersion({ type: "deb", version: "1:2.39", epoch: "1" }),
      "1:2.39",
    );
    assert.strictEqual(
      osPackageVersion({ type: "deb", version: "2.39", epoch: "1" }),
      "1:2.39",
    );
  });

  it("reads the epoch of a deb from its version and of an rpm from its field", () => {
    assert.strictEqual(osPackageEpoch({ type: "deb", version: "2:93" }), "2");
    assert.strictEqual(
      osPackageEpoch({ type: "deb", version: "93" }),
      undefined,
    );
    assert.strictEqual(
      osPackageEpoch({ type: "deb", version: "0:93" }),
      undefined,
    );
    assert.strictEqual(
      osPackageEpoch({ type: "rpm", version: "3", epoch: "12" }),
      "12",
    );
    assert.strictEqual(
      osPackageEpoch({ type: "rpm", version: "3", epoch: "007" }),
      "7",
    );
    assert.strictEqual(
      osPackageEpoch({ type: "rpm", version: "3", epoch: "x1" }),
      undefined,
    );
    assert.strictEqual(
      osPackageEpoch({ type: "apk", version: "1:3", epoch: "2" }),
      undefined,
    );
  });

  it("returns an empty version for a package with none", () => {
    assert.strictEqual(osPackageVersion({ type: "apk" }), "");
    assert.strictEqual(osPackageVersion({ type: "rpm", release: "1" }), "");
  });
});
