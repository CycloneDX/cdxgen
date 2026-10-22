export declare const PRE_1_18_VERSION = "unknown-pre-1.18";
/**
 * Read the Go toolchain version from an executable's buildinfo header.
 *
 * @param {string} filePath absolute path to a possible Go binary
 * @returns {string|undefined} `go1.x.y`, `unknown-pre-1.18` for old layouts,
 *   or undefined when the file carries no Go buildinfo
 */
export declare function readGoBuildVersion(filePath: string): string | undefined;
//# sourceMappingURL=goBuildInfo.d.ts.map