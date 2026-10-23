// The one place that decides what purl an operating-system package gets.
//
// A package found by `cdxgen -t docker <image>` and by `obom` run inside that
// image must be the same package, so the OBOM rows, the file-to-package
// resolver and the container scan all name a deb, an rpm or an apk package with
// the vendor and the qualifiers set here and in getDistroInfo(): `arch`,
// `distro`, `distro_name` and, when the package has one, `epoch`. A pacman
// package has the vendor and only the `arch` qualifier the alpm type defines.
// Homebrew, MacPorts and snap packages have no distro, so their purl is the
// name and the version; a flatpak adds the `arch` and `branch` of its ref.
//
// None of these purls has a subpath. A subpath names a path inside a package;
// the dpkg directory or the source rpm of a row is not one.

import { getDistroInfo, isCleanDistroQualifier } from "./osinfo.js";
import { tryBuildPurl } from "./purl.js";

/**
 * The purl types an OS scan builds from what a package manager reports.
 * deb, rpm, apk and alpm belong to a distro; brew, macports, snap and flatpak
 * belong to none. brew, macports, snap and flatpak are not purl-spec types;
 * cdx-purl builds them as it builds `pkg:chocolatey`.
 */
export const OS_PACKAGE_PURL_TYPES = new Set([
  "deb",
  "rpm",
  "apk",
  "alpm",
  "brew",
  "macports",
  "snap",
  "flatpak",
]);

/**
 * Whether a purl type is one of the OS package managers handled here.
 *
 * @param {string|undefined} type Purl type
 * @returns {boolean} true for the types in OS_PACKAGE_PURL_TYPES
 */
export function isOsPackagePurlType(type) {
  return OS_PACKAGE_PURL_TYPES.has(type);
}

/**
 * Whether a value names an architecture. rpm says `(none)` and trivy says
 * `None` for a package that has none, such as an rpm's `gpg-pubkey` key record;
 * neither is an architecture, and neither belongs in a purl.
 *
 * @param {string|undefined|null} arch Architecture as a package manager reports it
 * @returns {boolean} true for a real architecture
 */
export function isRealArchitecture(arch) {
  const value = `${arch ?? ""}`.trim().toLowerCase();
  return value !== "" && value !== "(none)" && value !== "none";
}

function isDigits(text) {
  if (!text) {
    return false;
  }
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 48 || code > 57) {
      return false;
    }
  }
  return true;
}

// An epoch is a non-negative integer, and 0 is the same as none. Anything else
// ("", "(none)", "null") is no epoch.
function normaliseEpoch(value) {
  const text = `${value ?? ""}`.trim();
  if (!isDigits(text)) {
    return undefined;
  }
  const digits = text.replace(/^0+/, "");
  return digits || undefined;
}

// dpkg writes a version as [epoch:]upstream[-revision]. A colon is only ever an
// epoch's separator when what comes before it is all digits.
function debVersionEpoch(version) {
  const colon = version.indexOf(":");
  if (colon <= 0) {
    return undefined;
  }
  const prefix = version.slice(0, colon);
  return isDigits(prefix) ? prefix : undefined;
}

/**
 * The epoch of an OS package, as the `epoch` qualifier carries it.
 *
 * An rpm keeps its epoch in a field of its own. A deb keeps it in its version
 * (`2:93`), so the version is read first. Epoch 0 and no epoch are the same,
 * and apk and Homebrew packages have none.
 *
 * @param {{type: string, version?: string, epoch?: string|number}} pkg Package
 * @returns {string|undefined} The epoch without leading zeros, or undefined
 */
export function osPackageEpoch(pkg) {
  switch (pkg?.type) {
    case "rpm":
      return normaliseEpoch(pkg.epoch);
    case "deb": {
      const fromVersion = debVersionEpoch(`${pkg.version ?? ""}`);
      return fromVersion === undefined
        ? normaliseEpoch(pkg.epoch)
        : normaliseEpoch(fromVersion);
    }
    default:
      return undefined;
  }
}

/**
 * The version an OS package carries on its component and in its purl.
 *
 * - rpm: `[epoch:]version-release`, the form the container scan writes. The
 *   purl spec keeps the epoch out of an rpm version, but the container scan
 *   puts it in the version as well as in the `epoch` qualifier, and an OBOM must
 *   name the package the same way.
 * - deb: the version exactly as dpkg reports it, epoch included.
 * - macports: `version_revision`, the form `port installed` prints.
 * - apk, alpm, brew, snap and flatpak: the version as it is. A pacman version
 *   already holds its epoch and release (`1:1.3.2-4`).
 *
 * @param {{type: string, version?: string, release?: string, epoch?: string|number, revision?: string|number}} pkg Package
 * @returns {string} The version, or an empty string when the package has none
 */
export function osPackageVersion(pkg) {
  const version = `${pkg?.version ?? ""}`;
  if (!version) {
    return "";
  }
  switch (pkg.type) {
    case "rpm": {
      const release = `${pkg.release ?? ""}`;
      const evr = release ? `${version}-${release}` : version;
      const epoch = osPackageEpoch(pkg);
      return epoch ? `${epoch}:${evr}` : evr;
    }
    case "deb": {
      if (debVersionEpoch(version) !== undefined) {
        return version;
      }
      const epoch = normaliseEpoch(pkg.epoch);
      return epoch ? `${epoch}:${version}` : version;
    }
    case "macports": {
      // Revision 0 is a real revision: `port installed` prints `@3.6.0_0`.
      const revision = `${pkg.revision ?? ""}`.trim();
      return isDigits(revision) ? `${version}_${revision}` : version;
    }
    default:
      return version;
  }
}

// The package managers whose purl carries no vendor and no distro.
const DISTROLESS_PURL_TYPES = new Set(["brew", "macports", "snap", "flatpak"]);

/**
 * Build the purl of an OS package.
 *
 * deb, rpm and apk purls take their vendor (`ubuntu`, `almalinux`, `alpine`,
 * `wolfi`) and the `distro` and `distro_name` qualifiers from the distro, plus
 * `arch` and `epoch` from the package. alpm purls take the vendor (`arch`,
 * `manjaro`) and `arch` only: that is all the alpm type defines, and an Arch
 * system is rolling, with no release to name. A qualifier with no value is
 * left out. brew, macports and snap purls carry neither vendor nor qualifiers;
 * a flatpak purl carries the `arch` and `branch` of the flatpak ref.
 *
 * @param {Object} pkg The package
 * @param {string} pkg.type One of OS_PACKAGE_PURL_TYPES
 * @param {string} pkg.name Package name; a flatpak's application ID
 * @param {string} [pkg.version] deb: the dpkg version. rpm: the version tag only. apk: version-rN. macports: the version without its revision.
 * @param {string} [pkg.release] rpm release tag
 * @param {string|number} [pkg.epoch] rpm epoch tag
 * @param {string|number} [pkg.revision] MacPorts revision
 * @param {string} [pkg.arch] Package architecture
 * @param {string} [pkg.branch] flatpak branch (`stable`, `48`)
 * @param {{namespace?: string, distroId?: string, distroName?: string}} [distro]
 *   What getDistroInfo() reports; read from the host's os-release when left out
 * @returns {string|null} The purl, or null when the parts do not form a valid one
 */
export function buildOsPackagePurl(pkg, distro) {
  const type = pkg?.type;
  const name = `${pkg?.name ?? ""}`;
  if (!isOsPackagePurlType(type) || !name) {
    return null;
  }
  const version = osPackageVersion(pkg) || null;
  const qualifiers = {};
  if (isRealArchitecture(pkg.arch)) {
    qualifiers.arch = `${pkg.arch}`.trim();
  }
  if (DISTROLESS_PURL_TYPES.has(type)) {
    if (type !== "flatpak") {
      return tryBuildPurl({ type, name, version });
    }
    const branch = `${pkg.branch ?? ""}`.trim();
    if (branch) {
      qualifiers.branch = branch;
    }
    return tryBuildPurl({
      type,
      name,
      version,
      qualifiers: Object.keys(qualifiers).length ? qualifiers : null,
    });
  }
  const { namespace, distroId, distroName } = distro || getDistroInfo();
  if (!namespace) {
    return null;
  }
  if (type === "alpm") {
    return tryBuildPurl({
      type,
      namespace,
      name,
      version,
      qualifiers: Object.keys(qualifiers).length ? qualifiers : null,
    });
  }
  if (isCleanDistroQualifier(distroId)) {
    qualifiers.distro = distroId;
  }
  if (isCleanDistroQualifier(distroName)) {
    qualifiers.distro_name = distroName;
  }
  const epoch = osPackageEpoch(pkg);
  if (epoch) {
    qualifiers.epoch = epoch;
  }
  return tryBuildPurl({
    type,
    namespace,
    name,
    version,
    qualifiers: Object.keys(qualifiers).length ? qualifiers : null,
  });
}
