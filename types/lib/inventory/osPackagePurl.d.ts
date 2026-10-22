/**
 * The purl types an OS scan builds from what a package manager reports.
 * deb, rpm and apk belong to a distro; brew belongs to none.
 */
export declare const OS_PACKAGE_PURL_TYPES: Set<string>;
/**
 * Whether a purl type is one of the OS package managers handled here.
 *
 * @param {string|undefined} type Purl type
 * @returns {boolean} true for deb, rpm, apk and brew
 */
export declare function isOsPackagePurlType(type: string | undefined): boolean;
/**
 * Whether a value names an architecture. rpm says `(none)` and trivy says
 * `None` for a package that has none, such as an rpm's `gpg-pubkey` key record;
 * neither is an architecture, and neither belongs in a purl.
 *
 * @param {string|undefined|null} arch Architecture as a package manager reports it
 * @returns {boolean} true for a real architecture
 */
export declare function isRealArchitecture(arch: string | undefined | null): boolean;
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
export declare function osPackageEpoch(pkg: {
    type: string;
    version?: string;
    epoch?: string | number;
}): string | undefined;
/**
 * The version an OS package carries on its component and in its purl.
 *
 * - rpm: `[epoch:]version-release`, the form the container scan writes. The
 *   purl spec keeps the epoch out of an rpm version, but the container scan
 *   puts it in the version as well as in the `epoch` qualifier, and an OBOM must
 *   name the package the same way.
 * - deb: the version exactly as dpkg reports it, epoch included.
 * - apk and brew: the version as it is.
 *
 * @param {{type: string, version?: string, release?: string, epoch?: string|number}} pkg Package
 * @returns {string} The version, or an empty string when the package has none
 */
export declare function osPackageVersion(pkg: {
    type: string;
    version?: string;
    release?: string;
    epoch?: string | number;
}): string;
/**
 * Build the purl of an OS package.
 *
 * deb, rpm and apk purls take their vendor (`ubuntu`, `almalinux`, `alpine`,
 * `wolfi`) and the `distro` and `distro_name` qualifiers from the distro, plus
 * `arch` and `epoch` from the package. A qualifier with no value is left out.
 * brew purls carry neither vendor nor qualifiers.
 *
 * @param {Object} pkg The package
 * @param {string} pkg.type `deb`, `rpm`, `apk` or `brew`
 * @param {string} pkg.name Package name
 * @param {string} [pkg.version] deb: the dpkg version. rpm: the version tag only. apk: version-rN.
 * @param {string} [pkg.release] rpm release tag
 * @param {string|number} [pkg.epoch] rpm epoch tag
 * @param {string} [pkg.arch] Package architecture
 * @param {{namespace?: string, distroId?: string, distroName?: string}} [distro]
 *   What getDistroInfo() reports; read from the host's os-release when left out
 * @returns {string|null} The purl, or null when the parts do not form a valid one
 */
export declare function buildOsPackagePurl(pkg: {
    type: string;
    name: string;
    version?: string;
    release?: string;
    epoch?: string | number;
    arch?: string;
}, distro?: {
    namespace?: string;
    distroId?: string;
    distroName?: string;
}): string | null;
//# sourceMappingURL=osPackagePurl.d.ts.map