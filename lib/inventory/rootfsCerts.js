import {
  closeSync,
  lstatSync,
  openSync,
  readdirSync,
  readSync,
  realpathSync,
} from "node:fs";
import { basename, join, relative, sep } from "node:path";

import {
  androidNetworkSecurityConfigPins,
  CertificateCollector,
  certRecordFromDer,
  classifyCryptoFile,
  kubernetesTlsSecretRecords,
  linkFallbackIssuers,
} from "./certificates.js";

// Bounds mirror trustinspector's rootfs mode (PLAN section 4.1): 16 MiB per
// file, 20,000 files read and 500,000 entries visited per tree, depth 12.
export const ROOTFS_CERT_LIMITS = Object.freeze({
  maxFileBytes: 16 * 1024 * 1024,
  maxFiles: 20000,
  maxEntries: 500000,
  maxDepth: 12,
});

// Coverage table: the same locations and sourceTypes as trustinspector's
// rootfs mode (thirdparty/trustinspector/rootfs.go candidateDirs).
const CA_STORE_DIRS = [
  "etc/ssl/certs",
  "usr/local/share/ca-certificates",
  "usr/share/ca-certificates",
  "etc/pki/tls/certs",
  "etc/pki/ca-trust/source/anchors",
  "etc/pki/ca-trust/extracted",
  "var/lib/ca-certificates",
  "usr/share/pki/ca-trust-source/anchors",
];
const CA_STORE_FILES = ["etc/ssl/cert.pem"];
const CA_BLOCKLIST_DIRS = [
  "etc/pki/ca-trust/source/blocklist",
  "etc/pki/ca-trust/source/blacklist",
  "usr/share/pki/ca-trust-source/blocklist",
  "usr/share/pki/ca-trust-source/blacklist",
];
const SERVER_CONFIG_DIRS = [
  "etc/nginx",
  "etc/apache2",
  "etc/httpd",
  "etc/haproxy",
  "etc/letsencrypt/live",
  "etc/letsencrypt/archive",
  "etc/kubernetes/pki",
  "var/lib/kubelet/pki",
  "etc/docker/certs.d",
  "etc/containerd/certs.d",
  "etc/envoy",
  "etc/traefik",
];
const JAVA_DIRS = [
  "usr/lib/jvm",
  "opt",
  "etc/ssl/certs/java",
  "etc/pki/java",
  "usr/share/elasticsearch",
];
const LANGUAGE_BUNDLE_DIRS = ["usr/lib", "usr/local/lib", "opt"];
// Kubernetes secrets and Android configs are cdxgen-side producers: the
// plugin has no YAML or Android parser.
const SECRET_YAML_DIRS = [
  "etc/kubernetes",
  "var/run/secrets",
  "run/secrets",
  "var/lib/kubelet",
  "srv",
  "app",
  "opt",
  "home",
  "root",
];
const ANDROID_DIRS = ["app", "opt", "srv", "data", "home", "root"];

const CERT_SUFFIXES = [
  ".pem",
  ".crt",
  ".cer",
  ".der",
  ".p7b",
  ".p7c",
  ".p12",
  ".pfx",
  ".jks",
  ".jceks",
  ".truststore",
  ".key",
];

function isJavaKeystoreName(base) {
  if (base === "cacerts" || base === "jssecacerts") {
    return true;
  }
  return [".jks", ".jceks", ".truststore", ".p12", ".pfx"].some((suffix) =>
    base.endsWith(suffix),
  );
}

// Mirrors looksLikeTrustMaterialPath in trustinspector: private-key
// directories are never read.
function looksLikeTrustMaterialPath(rel, sourceType) {
  const lower = rel.toLowerCase();
  if (
    lower.startsWith("etc/ssl/private/") ||
    lower.startsWith("etc/pki/tls/private/")
  ) {
    return false;
  }
  const base = basename(lower);
  if (sourceType === "language-bundle") {
    return base === "cacert.pem";
  }
  if (sourceType === "java-truststore") {
    return isJavaKeystoreName(base);
  }
  if (isJavaKeystoreName(base)) {
    return true;
  }
  return (
    CERT_SUFFIXES.some((suffix) => lower.endsWith(suffix)) ||
    lower.includes("/certs/")
  );
}

/**
 * Read at most `maxBytes` of a regular file. The cap applies to the read
 * itself, so a file that grows after the size check cannot exceed it. Files
 * that are not regular (FIFOs, devices, sockets) are never opened.
 */
function readCapped(absolute, maxBytes) {
  const before = lstatSync(absolute);
  if (!before.isFile() || before.size > maxBytes) {
    return undefined;
  }
  const fd = openSync(absolute, "r");
  try {
    const buffer = Buffer.alloc(Math.min(before.size, maxBytes) + 1);
    let total = 0;
    while (total < buffer.length) {
      const n = readSync(fd, buffer, total, buffer.length - total, null);
      if (n === 0) {
        break;
      }
      total += n;
    }
    if (total > maxBytes) {
      return undefined;
    }
    return buffer.subarray(0, total);
  } finally {
    closeSync(fd);
  }
}

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
export function collectRootfsCertificates(rootDir, limits = {}) {
  const bounds = { ...ROOTFS_CERT_LIMITS, ...limits };
  const warnings = [];
  let realRoot;
  try {
    realRoot = realpathSync(rootDir);
  } catch {
    return { components: [], dependencies: [], warnings };
  }
  const collector = new CertificateCollector();
  const records = [];
  const components = [];
  const seenFiles = new Set();
  let filesRead = 0;

  // Resolve a root-relative directory to an absolute path that is proven to
  // stay inside the root; undefined when it does not exist, is not a
  // directory, or any symlink on the way leaves the root.
  const resolveInside = (rel) => {
    const absolute = join(realRoot, rel);
    let real;
    try {
      real = realpathSync(absolute);
    } catch {
      return undefined;
    }
    const inside = relative(realRoot, real);
    if (inside.startsWith("..") || inside.split(sep).includes("..")) {
      return undefined;
    }
    return real;
  };

  const walk = (relBase, visit) => {
    const start = resolveInside(relBase);
    if (!start) {
      return;
    }
    let startStat;
    try {
      startStat = lstatSync(start);
    } catch {
      return;
    }
    if (!startStat.isDirectory()) {
      return;
    }
    let entries = 0;
    const stack = [{ abs: start, rel: relBase, depth: 0 }];
    while (stack.length) {
      const { abs, rel, depth } = stack.pop();
      let dirents;
      try {
        dirents = readdirSync(abs, { withFileTypes: true });
      } catch {
        continue;
      }
      dirents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      for (const dirent of dirents) {
        entries += 1;
        if (entries > bounds.maxEntries) {
          warnings.push(
            `entry limit (${bounds.maxEntries}) reached in /${relBase}`,
          );
          return;
        }
        // Symlinks and special files are skipped outright.
        if (dirent.isSymbolicLink()) {
          continue;
        }
        const childRel = `${rel}/${dirent.name}`;
        if (dirent.isDirectory()) {
          if (depth + 1 >= bounds.maxDepth) {
            warnings.push(
              `depth limit (${bounds.maxDepth}) exceeded in /${relBase}`,
            );
            continue;
          }
          stack.push({
            abs: join(abs, dirent.name),
            rel: childRel,
            depth: depth + 1,
          });
        } else if (dirent.isFile()) {
          if (visit(childRel, join(abs, dirent.name)) === false) {
            return;
          }
        }
      }
    }
  };

  const readRel = (rel, abs) => {
    if (filesRead >= bounds.maxFiles) {
      warnings.push(`file count limit (${bounds.maxFiles}) reached`);
      return undefined;
    }
    filesRead += 1;
    try {
      const bytes = readCapped(abs, bounds.maxFileBytes);
      if (!bytes) {
        warnings.push(
          `file over ${bounds.maxFileBytes} bytes skipped: /${rel}`,
        );
      }
      return bytes;
    } catch {
      return undefined;
    }
  };

  const consumeMaterial = (rel, abs, sourceType) => {
    if (seenFiles.has(rel) || !looksLikeTrustMaterialPath(rel, sourceType)) {
      return;
    }
    const bytes = readRel(rel, abs);
    if (!bytes?.length) {
      return;
    }
    seenFiles.add(rel);
    const location = `/${rel}`;
    const classification = classifyCryptoFile(bytes);
    if (classification.kind === "certificates") {
      const dot = basename(rel).lastIndexOf(".");
      for (const der of classification.ders) {
        const record = certRecordFromDer(der, { location, sourceType });
        if (record) {
          record.fileExtension =
            dot > 0 ? basename(rel).slice(dot + 1) : undefined;
          records.push(record);
        }
      }
    } else if (classification.kind === "private-key") {
      components.push(
        rootfsMaterialComponent("private-key", location, {
          format: classification.format,
          sourceType,
        }),
      );
    } else if (classification.kind === "keystore") {
      components.push(
        rootfsMaterialComponent("keystore", location, {
          format: classification.format,
          sourceType,
        }),
      );
    }
  };

  // Most specific location first, so a file under two candidates takes the
  // sourceType of the narrower one (same rule as the plugin).
  const candidates = [
    ...CA_STORE_DIRS.map((rel) => ({ rel, sourceType: "ca-store" })),
    ...CA_BLOCKLIST_DIRS.map((rel) => ({ rel, sourceType: "ca-blocklist" })),
    ...SERVER_CONFIG_DIRS.map((rel) => ({ rel, sourceType: "server-config" })),
    ...JAVA_DIRS.map((rel) => ({ rel, sourceType: "java-truststore" })),
    ...LANGUAGE_BUNDLE_DIRS.map((rel) => ({
      rel,
      sourceType: "language-bundle",
    })),
  ].sort((a, b) => b.rel.split("/").length - a.rel.split("/").length);
  for (const file of CA_STORE_FILES) {
    const abs = resolveInside(file);
    if (abs && lstatSync(abs).isFile()) {
      consumeMaterial(file, abs, "ca-store");
    }
  }
  for (const { rel, sourceType } of candidates) {
    walk(rel, (childRel, abs) => {
      consumeMaterial(childRel, abs, sourceType);
    });
  }

  const secretFiles = new Set();
  for (const dir of SECRET_YAML_DIRS) {
    walk(dir, (childRel, abs) => {
      if (/\.ya?ml$/i.test(childRel) && !secretFiles.has(childRel)) {
        secretFiles.add(childRel);
        const bytes = readRel(childRel, abs);
        const text = bytes?.toString("utf-8");
        // Cheap pre-filter, as in the source scan.
        if (text?.includes("kubernetes.io/tls")) {
          records.push(
            ...kubernetesTlsSecretRecords(text, { file: `/${childRel}` }),
          );
        }
      }
    });
  }
  const androidFiles = new Set();
  for (const dir of ANDROID_DIRS) {
    walk(dir, (childRel, abs) => {
      if (
        /\/res\/xml\/[^/]+\.xml$/i.test(childRel) &&
        !androidFiles.has(childRel)
      ) {
        androidFiles.add(childRel);
        const text = readRel(childRel, abs)?.toString("utf-8");
        if (text?.includes("<network-security-config")) {
          for (const pin of androidNetworkSecurityConfigPins(text, {
            file: `/${childRel}`,
          })) {
            collector.addPin(pin);
          }
        }
      }
    });
  }

  if (records.length) {
    linkFallbackIssuers(records);
    collector.addRecords(records);
  }
  const built = collector.build();
  return {
    components: [...built.components, ...components],
    dependencies: built.dependencies,
    warnings,
  };
}

// Same shape as the keystore and private-key components the other producers
// emit (managedBom sourceKeystoreComponent / sourcePrivateKeyComponent).
function rootfsMaterialComponent(kind, location, { format, sourceType }) {
  return {
    name: basename(location),
    type: "cryptographic-asset",
    "bom-ref": `crypto/related-crypto-material/${kind}/${encodeURIComponent(location)}`,
    cryptoProperties: {
      assetType: "related-crypto-material",
      relatedCryptoMaterialProperties: {
        type: kind === "keystore" ? "other" : "private-key",
        ...(format ? { format } : {}),
      },
    },
    evidence: { occurrences: [{ location }] },
    properties: [
      { name: "internal:SrcFile", value: location },
      ...(sourceType
        ? [{ name: "cdx:crypto:sourceType", value: sourceType }]
        : []),
      ...(kind === "keystore"
        ? [{ name: "cdx:crypto:keystoreReadable", value: "false" }]
        : []),
    ],
  };
}
