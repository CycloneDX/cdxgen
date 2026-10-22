export declare const ROOTFS_CERT_LIMITS: Readonly<{
    maxFileBytes: number;
    maxFiles: 20000;
    maxEntries: 500000;
    maxDepth: 12;
}>;
/**
 * Pure-JS inventory of the certificate locations trustinspector's rootfs
 * mode covers, plus Kubernetes TLS secrets and Android pins. Used when the
 * plugin is not available. Produces components through the shared
 * CertificateCollector, so bom-refs, names and deduplication match the other
 * producers; locations are root-relative ("/etc/ssl/certs/x.crt").
 *
 * Every access stays inside the root: symlinks (files or directories) are
 * skipped, only regular files are opened, and the walk is bounded by entry,
 * file, size and depth limits.
 *
 * @param {string} rootDir extracted root filesystem
 * @param {object} [limits] overrides for ROOTFS_CERT_LIMITS (tests)
 * @returns {{components: object[], dependencies: object[], warnings: string[]}}
 */
export declare function collectRootfsCertificates(rootDir: string, limits?: object): {
    components: object[];
    dependencies: object[];
    warnings: string[];
};
//# sourceMappingURL=rootfsCerts.d.ts.map