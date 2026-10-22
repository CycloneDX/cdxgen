/** The database, or the packages it lists, past these is unreadable rather than read in part. */
export declare const MAX_APK_DATABASE_BYTES: number;
export declare const MAX_APK_PACKAGES = 100000;
/** Where apk keeps the installed database, relative to the root, in the order they are tried. */
export declare const APK_INSTALLED_DB_PATHS: string[];
/**
 * Read the packages of the apk installed database.
 *
 * @param {Object} [options] Read options
 * @param {string} [options.rootPath="/"] Directory the database paths hang off;
 *   tests point it at a built tree
 * @param {string} [options.databaseFile] Read this file instead of looking
 *   under `rootPath`
 * @param {Set<string>} [options.wantedFiles] Absolute paths whose owner is
 *   wanted. A package comes back with the ones it owns in `files`; the other
 *   files of a package are only counted, so a large database stays small.
 * @param {number} [options.maxBytes] Largest database to read, 64 MiB by default
 * @param {number} [options.maxPackages] Most packages to accept, 100000 by default
 * @param {string} [options.platform] `linux` by default for the process; an apk
 *   database exists on Linux only
 * @returns {{state: string, path?: string, packages: Object[], malformed: number}}
 *   `state` is `ok`, `absent` (no database, or not Linux), `unreadable` (a
 *   database that could not be read in full) or `skipped` (a dry run).
 *   `malformed` counts the records left out for having no name or version.
 *   Each package has `name`, `version` and `fileCount`, `files`, and, when the
 *   record has them, `arch`, `origin`, `maintainer`, `license`, `url` and
 *   `description`.
 */
export declare function readApkInstalledDb(options?: {
    rootPath?: string;
    databaseFile?: string;
    wantedFiles?: Set<string>;
    maxBytes?: number;
    maxPackages?: number;
    platform?: string;
}): {
    state: string;
    path?: string;
    packages: Object[];
    malformed: number;
};
//# sourceMappingURL=apkInstalledDb.d.ts.map