/**
 * Look for PHP no package manager owns, in the fixed directories of the host.
 * Components come back only for the files nothing owns: a `file` component for
 * each PHP binary or library with the cdx:php properties, one `platform`
 * component per version with its CPE, and the edges between them.
 *
 * @param {Object} [options] probe options
 * @param {string} [options.rootPath] directory the fixed directories hang off:
 *   `/`, or the system drive on Windows. Tests point it at a built tree.
 * @param {string} [options.platform] `linux`, `darwin` or `win32`
 * @param {Object} [options.env] environment read for ProgramFiles, SystemDrive
 *   and ChocolateyInstall, instead of the process's
 * @param {{dpkgInfoDirectory?: string, apkInstalledFile?: string, rpmDatabaseDirectories?: string[]}} [options.packageDatabases]
 *   where the package databases are, instead of under `rootPath`
 * @param {function(string): (Object[]|undefined)} [options.executeOsQuery] runs
 *   an osquery query; the rpm database is only asked through it
 * @param {Object[]} [options.packageComponents] the packages the OS scan has
 *   inventoried, from which Chocolatey's are known
 * @param {number} [options.maxProbes] most candidate files to look at
 * @returns {{components: Object[], dependencies: Object[]}}
 */
export declare function probeHostPhp(options?: {
    rootPath?: string;
    platform?: string;
    env?: Object;
    packageDatabases?: {
        dpkgInfoDirectory?: string;
        apkInstalledFile?: string;
        rpmDatabaseDirectories?: string[];
    };
}): {
    components: Object[];
    dependencies: Object[];
};
//# sourceMappingURL=phpHostProbe.d.ts.map