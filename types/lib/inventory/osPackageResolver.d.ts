/**
 * Reset all OS package resolver caches. Exported for unit tests only.
 */
export declare function _resetOsInfoCache(): void;
/**
 * Resolves a file path to its owning OS package manager package, including a
 * correctly computed purl with distro qualifiers derived from /etc/os-release.
 *
 * @param {string} filePath - Absolute path to the library file
 * @returns {{ name: string, version: string, arch: string, type: string, purl: string } | undefined}
 */
export declare function resolvePackageForFile(filePath: string): {
    name: string;
    version: string;
    arch: string;
    type: string;
    purl: string;
} | undefined;
/**
 * Find the OS package component that provides a given file, by searching the
 * `internal:PkgProvides` property of each package in the OS package list.
 *
 * @param {string} afile Filename or path to look up (matched case-insensitively)
 * @param {Object[]} osPkgsList Array of OS package component objects to search
 * @returns {Object|undefined} The matching OS package component, or undefined if not found
 */
export declare function getOSPackageForFile(afile: string, osPkgsList: Object[]): Object | undefined;
/**
 * Collect all executable files from the given list of binary paths
 *
 * @param basePath Base directory
 * @param binPaths {Array[String]} Paths containing potential binaries
 * @param excludePaths {Array[String]} Container-relative paths that should be excluded from the result set
 * @return {Array[String]} List of executables
 */
export declare function collectExecutables(basePath: any, binPaths: any, excludePaths?: any): any;
/**
 * Collect all shared library files from the given list of paths
 *
 * @param basePath Base directory
 * @param libPaths {Array[String]} Paths containing potential libraries
 * @param ldConf {String} Config file used by ldconfig to locate additional paths
 * @param ldConfDirPattern {String} Config directory that can contain more .conf files for ldconfig
 * @param excludePaths {Array[String]} Container-relative paths that should be excluded from the result set
 *
 * @return {Array[String]} List of executables
 */
export declare function collectSharedLibs(basePath: any, libPaths: any, ldConf: string, ldConfDirPattern: string, excludePaths?: any): any;
//# sourceMappingURL=osPackageResolver.d.ts.map