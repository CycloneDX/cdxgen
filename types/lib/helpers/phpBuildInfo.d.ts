/**
 * The most PHP-named files one scan opens in search of a build version.
 *
 * @type {number}
 */
export declare const MAX_PHP_PROBES: number;
/**
 * Read the version a text starts with, in the grammar the build-version reader
 * accepts: `8.4.27`, `8.5.0-dev`, `8.6.0RC3`. What follows the version must not
 * continue it, so `8.4.26.1` and `8.4.26foo` parse to nothing. A distro
 * revision such as Ubuntu's `8.1.2-1ubuntu2.14` is not an upstream version
 * either, and parses to nothing rather than to a guess.
 *
 * @param {string} text text that begins with the version
 * @returns {string|undefined} the version, or undefined when the text does not
 *   begin with one
 */
export declare function parsePhpVersion(text: string): string | undefined;
/**
 * Read the version a PHP reports about itself, as `php -v` prints it. An
 * upstream version parses as parsePhpVersion does. A version with a distro
 * revision, such as Ubuntu's `8.1.2-1ubuntu2.14`, is kept whole and marked: it
 * is what that PHP reports, but the distro backports fixes without changing the
 * upstream part, so it must not be matched against upstream advisories.
 *
 * @param {string} text text that begins with the version
 * @returns {{version: string, distroRevision: boolean}|undefined} the version,
 *   or undefined when the text does not begin with one
 */
export declare function parsePhpReportedVersion(text: string): {
    version: string;
    distroRevision: boolean;
} | undefined;
/**
 * The package manager whose store a path lies in. Homebrew (`Cellar/<formula>/
 * <version>/`), Nix (`nix/store/`) and Guix (`gnu/store/`) own everything under
 * their stores, whatever links lead there, and a PHP they own is identified by
 * their package, never as an unpackaged build.
 *
 * @param {string} filePath absolute or root-relative path, either separator
 * @returns {string|undefined} `homebrew`, `nix` or `guix`, or undefined
 */
export declare function packageStoreOf(filePath: string): string | undefined;
/**
 * Classify a file by its basename into a PHP SAPI, or undefined when the name
 * is not one php-src installs.
 *
 * @param {string} fileName basename or path of the candidate
 * @returns {string|undefined} cli, fpm, cgi, phpdbg, libphp or frankenphp
 */
export declare function classifyPhpSapi(fileName: string): string | undefined;
/**
 * Read the PHP build version of a binary or shared library.
 *
 * @param {string} absPath absolute path
 * @param {string|undefined} rootDir extracted root, when the file came from one
 * @returns {{version: string, source: string}|undefined} source is `binary`
 *   or `php_version.h`
 */
export declare function readPhpBuildVersion(absPath: string, rootDir: string | undefined): {
    version: string;
    source: string;
} | undefined;
/**
 * The CPE that lets a downstream scanner match a PHP version. NVD puts a
 * pre-release suffix in the update field, e.g.
 * cpe:2.3:a:php:php:8.5.0:rc1:*:*:*:*:*:* (NVD CPE dictionary).
 *
 * @param {string} version PHP version in the build-version grammar
 * @returns {string} CPE 2.3 string
 */
export declare function phpCpe(version: string): string;
/**
 * A PHP runtime is one `platform` component per distinct version. Its identity
 * is `pkg:generic/php`: it is only used where no package manager owns PHP, or
 * where a PATH probe cannot tell which one does.
 *
 * @param {string} version PHP version in the build-version grammar, or as a
 *   distro build reports it
 * @param {Object} [options] options
 * @param {boolean} [options.withCpe=true] false for a version with a distro
 *   revision, which no upstream CPE describes
 * @returns {Object} component with `purl`, `bom-ref` and, unless left out, `cpe`
 */
export declare function createPhpRuntimeComponent(version: string, { withCpe }?: {
    withCpe?: boolean;
}): Object;
/**
 * The bom-ref of the runtime component for a version.
 *
 * @param {string} version PHP version in the build-version grammar
 * @returns {string} bom-ref, which is the runtime's purl
 */
export declare function phpRuntimeRef(version: string): string;
/**
 * The properties a PHP file component carries once its build version is known.
 * They belong on unpackaged `file` components only: a package-owned PHP is
 * identified by its package, and distro builds carry backported fixes under
 * old version numbers, so the PHP-RCE audit rules that match these properties
 * would raise false positives there.
 *
 * @param {{version: string, source: string}} build result of readPhpBuildVersion
 * @param {string} sapi result of classifyPhpSapi
 * @returns {{name: string, value: string}[]} properties to append
 */
export declare function phpBuildProperties(build: {
    version: string;
    source: string;
}, sapi: string): {
    name: string;
    value: string;
}[];
/**
 * Start collecting the runtime components and edges of one scan.
 *
 * @returns {{runtimeComponents: Object[], dependencies: Object[], runtimeRefs: Set<string>}}
 */
export declare function createPhpRuntimeInventory(): {
    runtimeComponents: Object[];
    dependencies: Object[];
    runtimeRefs: Set<string>;
};
/**
 * Tag a PHP file component with its build facts and link it to the runtime
 * component of its version, creating that component on first use. Mutates the
 * component in place, as the Go collector does.
 *
 * @param {{runtimeComponents: Object[], dependencies: Object[], runtimeRefs: Set<string>}} inventory
 *   accumulator from createPhpRuntimeInventory
 * @param {Object} component file component, with a `properties` array
 * @param {{version: string, source: string}} build result of readPhpBuildVersion
 * @param {string} sapi result of classifyPhpSapi
 */
export declare function attachPhpBuild(inventory: {
    runtimeComponents: Object[];
    dependencies: Object[];
    runtimeRefs: Set<string>;
}, component: Object, build: {
    version: string;
    source: string;
}, sapi: string): void;
//# sourceMappingURL=phpBuildInfo.d.ts.map