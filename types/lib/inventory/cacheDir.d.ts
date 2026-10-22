/**
 * Cache directory resolution for the cdxrs fetch metadata cache.
 *
 * JS is the single source of truth for the path. `fetchBatch.js` passes
 * `--cache-dir <path>` to every `cdxrs fetch` invocation; Rust keeps its own
 * resolution only as the fallback for standalone CLI use. Both sides follow
 * the same rules so they agree — verified by a parity test.
 *
 * Resolution order:
 * 1. `CDXGEN_CACHE_DIR` if set and non-empty (documented escape hatch).
 * 2. Platform cache directory with a `cdxgen` component.
 * 3. `null` — cache disabled. A cache that cannot find a home must not fall
 *    back to the current working directory or a temp dir.
 */
/**
 * Resolve the cache directory from explicit inputs, with no reference to the
 * ambient environment or the host platform.
 *
 * Mirrors `HttpCache::resolve_cache_for` in cdxrs. Taking the platform as an
 * argument is what lets every branch be tested on every host; keep it that way
 * rather than reading `isWin`/`isMac` here, or the Windows and Linux branches
 * become untestable on a macOS developer machine.
 *
 * Every environment-derived root must be absolute by the *target* platform's
 * rules, never the host's (`path.isAbsolute` would accept `\cache` on a
 * Windows host): a relative value is ignored, so it cannot point inside the
 * working directory. XDG requires this of `XDG_CACHE_HOME`; the home and
 * `LOCALAPPDATA` roots get the same treatment for the same reason.
 *
 * @param {Object} inputs Resolution inputs.
 * @param {"linux"|"macos"|"windows"} inputs.platform Which convention to apply.
 * @param {string} [inputs.cdxgenCacheDir] `CDXGEN_CACHE_DIR`, an explicit
 *   override taken as given.
 * @param {string} [inputs.xdgCacheHome] `XDG_CACHE_HOME`. Ignored unless
 *   `/`-rooted.
 * @param {string} [inputs.home] Home directory. Ignored unless absolute.
 * @param {string} [inputs.localAppData] `LOCALAPPDATA`. Ignored unless drive-
 *   or UNC-rooted; the home profile is the fallback.
 * @returns {string|null} Absolute path, or null when nothing resolves.
 */
export declare function resolveCacheDirFor({ platform, cdxgenCacheDir, xdgCacheHome, home, localAppData, }: {
    platform: "linux" | "macos" | "windows";
    cdxgenCacheDir?: string;
    xdgCacheHome?: string;
    home?: string;
    localAppData?: string;
}): string | null;
/**
 * Resolve the metadata cache directory from the environment.
 *
 * @returns {string|null} Absolute path, or null when no home directory can be
 *   determined and `CDXGEN_CACHE_DIR` is unset.
 */
export declare function resolveCacheDir(): string | null;
/**
 * The fetch subdirectory inside the cache root. All cdxrs fetch entries live
 * under `<cacheDir>/cdxrs-fetch/<host>/<hash>.json`.
 *
 * @param {string} cacheDir Resolved cache directory.
 * @returns {string} Path to the fetch subdirectory.
 */
export declare function fetchCacheDir(cacheDir: string): string;
//# sourceMappingURL=cacheDir.d.ts.map