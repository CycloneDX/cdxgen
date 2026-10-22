// Bounded PHP build-version reader for unpackaged PHP binaries and
// libraries. Recovers the version a source-built PHP carries, so a BOM can
// answer "does this image ship a PHP affected by CVE-2026-109618/109619".
//
// The primary marker comes from php-src: SAPI_PHP_VERSION_HEADER is
// "X-Powered-By: PHP/" PHP_VERSION and is compiled into every SAPI binary and
// libphp, e.g. the literal `X-Powered-By: PHP/8.4.26`:
// https://github.com/php/php-src/blob/php-8.4.27/main/SAPI.h#L309
// The same definition is present in 7.4 through 8.5 (main/SAPI.h at each tag).
// If a stripped or unusual build lacks it, the installed php_version.h is read
// from the same prefix. configure.ac generates its PHP_VERSION line:
// https://github.com/php/php-src/blob/php-8.4.27/configure.ac#L83-L90
// and install-headers copies it under $(phpincludedir)/main:
// https://github.com/php/php-src/blob/php-8.4.27/build/Makefile.global#L52
//
// Every file in an image is hostile: only regular files inside the extracted
// root are opened, reads are capped, and a missing/odd file yields no result
// rather than throwing.

import {
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from "node:fs";
import { basename, join, resolve, sep } from "node:path";

// The version grammar the contract accepts: M.m.p, optionally with -dev or an
// alpha/beta/RC number.
const VERSION_BODY = "\\d+\\.\\d+\\.\\d+(?:-dev|(?:alpha|beta|RC)\\d+)?";
const MARKER = Buffer.from("X-Powered-By: PHP/");
const MAX_VERSION_BYTES = 32;
// Overlap is at least the marker length plus 32 bytes, per the contract, so a
// marker split across two reads is seen whole by the second one.
const OVERLAP_BYTES = MARKER.length + 32;
const READ_CHUNK_BYTES = 1024 * 1024;
const MAX_BINARY_BYTES = 256 * 1024 * 1024;
const MAX_HEADER_BYTES = 64 * 1024;

// The trailing lookahead rejects 8.4.26.1 and 8.4.26foo while accepting
// 8.4.26, 8.4.26-dev and 8.6.0RC3 followed by a non-version byte.
const BINARY_VERSION_RE = new RegExp(`^(${VERSION_BODY})(?![0-9A-Za-z.-])`);
const HEADER_VERSION_RE = new RegExp(
  `^#define\\s+PHP_VERSION\\s+"(${VERSION_BODY})"\\s*$`,
  "m",
);

// Installed names come from the per-SAPI Makefile.frag files at the 8.4.27
// tag: bin/php, bin/php-cgi, sbin/php-fpm, bin/phpdbg and libs/libphp.so,
// each with the optional $(program_prefix)/$(program_suffix):
// https://github.com/php/php-src/blob/php-8.4.27/sapi/cli/Makefile.frag#L9
// https://github.com/php/php-src/blob/php-8.4.27/sapi/cgi/Makefile.frag#L9
// https://github.com/php/php-src/blob/php-8.4.27/sapi/fpm/Makefile.frag#L11
// https://github.com/php/php-src/blob/php-8.4.27/sapi/phpdbg/Makefile.frag#L28
// The Apache module is libphp.so (libs/libphp.so in build/Makefile.global).
// FrankenPHP embeds PHP in its own binary.
const PHP_SAPI_BY_NAME = [
  [/^php(\d+(\.\d+)?)?$/, "cli"],
  [/^php-fpm(\d+(\.\d+)?)?$/, "fpm"],
  [/^php-cgi(\d+(\.\d+)?)?$/, "cgi"],
  [/^phpdbg(\d+(\.\d+)?)?$/, "phpdbg"],
  [/^libphp(\d+(\.\d+)?)?\.so$/, "libphp"],
  [/^frankenphp$/, "frankenphp"],
];

/**
 * Classify a file by its basename into a PHP SAPI, or undefined when the name
 * is not one php-src installs.
 *
 * @param {string} fileName basename or path of the candidate
 * @returns {string|undefined} cli, fpm, cgi, phpdbg, libphp or frankenphp
 */
export function classifyPhpSapi(fileName) {
  if (typeof fileName !== "string" || !fileName) {
    return undefined;
  }
  const name = basename(fileName);
  for (const [pattern, sapi] of PHP_SAPI_BY_NAME) {
    if (pattern.test(name)) {
      return sapi;
    }
  }
  return undefined;
}

/**
 * Open a path only when it is a regular file that does not resolve outside
 * rootDir. lstat runs first so a FIFO is rejected without opening it (an
 * open on a FIFO blocks until a writer appears) and a symlink is never
 * followed.
 *
 * @param {string} absPath absolute path
 * @param {string|undefined} rootDir extracted root the path must stay under
 * @returns {{fd: number, size: number}|undefined}
 */
function openRegularFile(absPath, rootDir) {
  let fd;
  try {
    if (typeof absPath !== "string" || !absPath) {
      return undefined;
    }
    const lst = lstatSync(absPath);
    if (!lst.isFile()) {
      return undefined;
    }
    if (rootDir) {
      const root = realpathSync(resolve(rootDir));
      const real = realpathSync(absPath);
      const rootPrefix = root.endsWith(sep) ? root : root + sep;
      if (real !== root && !real.startsWith(rootPrefix)) {
        return undefined;
      }
    }
    fd = openSync(absPath, "r");
    const stats = fstatSync(fd);
    if (!stats.isFile()) {
      closeSync(fd);
      return undefined;
    }
    return { fd, size: stats.size };
  } catch {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // already closed
      }
    }
    return undefined;
  }
}

function matchVersionAt(buffer, start, readLength) {
  if (start >= readLength) {
    return undefined;
  }
  // One byte past the maximum lets the lookahead see a too-long version
  // instead of treating the end of the slice as a boundary.
  const end = Math.min(readLength, start + MAX_VERSION_BYTES + 1);
  const text = buffer.toString("latin1", start, end);
  const match = BINARY_VERSION_RE.exec(text);
  if (!match || match[1].length > MAX_VERSION_BYTES) {
    return undefined;
  }
  return match[1];
}

/**
 * Scan a bounded prefix of a binary for the compiled-in marker. Files larger
 * than the cap are skipped entirely: the contract treats them as hostile and
 * emits no property.
 *
 * @param {number} fd open file descriptor
 * @param {number} size file size from fstat
 * @returns {string|undefined}
 */
function scanBinaryVersion(fd, size) {
  if (size <= 0 || size > MAX_BINARY_BYTES) {
    return undefined;
  }
  const bufferSize = Math.min(size, READ_CHUNK_BYTES) + OVERLAP_BYTES;
  const buffer = Buffer.allocUnsafe(bufferSize);
  for (let position = 0; position < size; position += READ_CHUNK_BYTES) {
    const want = Math.min(bufferSize, size - position);
    const read = readSync(fd, buffer, 0, want, position);
    if (read <= 0) {
      return undefined;
    }
    // Only matches starting inside this window are new; the overlap exists so
    // a version split at the window edge is readable.
    const searchLimit = Math.min(READ_CHUNK_BYTES, read);
    let offset = buffer.indexOf(MARKER);
    while (offset !== -1 && offset < searchLimit) {
      const version = matchVersionAt(buffer, offset + MARKER.length, read);
      if (version) {
        return version;
      }
      offset = buffer.indexOf(MARKER, offset + 1);
    }
    if (read < bufferSize) {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Derive the install prefix from a path installed under bin, sbin or lib:
 * /usr/local/bin/php -> /usr/local, /usr/lib/apache2/modules/libphp.so -> /usr.
 *
 * @param {string} absPath absolute path
 * @returns {string|undefined}
 */
function installPrefix(absPath) {
  const parts = resolve(absPath).split(sep);
  for (let i = parts.length - 2; i >= 0; i--) {
    if (parts[i] === "bin" || parts[i] === "sbin" || parts[i] === "lib") {
      return parts.slice(0, i).join(sep) || sep;
    }
  }
  return undefined;
}

/**
 * Read PHP_VERSION from <prefix>/include/php/main/php_version.h. Only called
 * for files installed under bin, sbin or lib, and only when the binary marker
 * was absent.
 *
 * @param {string} absPath path of the PHP binary/library
 * @param {string|undefined} rootDir extracted root
 * @returns {string|undefined}
 */
function readHeaderVersion(absPath, rootDir) {
  const prefix = installPrefix(absPath);
  if (!prefix) {
    return undefined;
  }
  const headerPath = join(prefix, "include", "php", "main", "php_version.h");
  const opened = openRegularFile(headerPath, rootDir);
  if (!opened) {
    return undefined;
  }
  try {
    const length = Math.min(opened.size, MAX_HEADER_BYTES);
    if (length <= 0) {
      return undefined;
    }
    const buffer = Buffer.allocUnsafe(length);
    const read = readSync(opened.fd, buffer, 0, length, 0);
    if (read <= 0) {
      return undefined;
    }
    const match = HEADER_VERSION_RE.exec(buffer.toString("latin1", 0, read));
    return match ? match[1] : undefined;
  } catch {
    return undefined;
  } finally {
    try {
      closeSync(opened.fd);
    } catch {
      // already closed
    }
  }
}

/**
 * Read the PHP build version of a binary or shared library.
 *
 * @param {string} absPath absolute path
 * @param {string|undefined} rootDir extracted root, when the file came from one
 * @returns {{version: string, source: string}|undefined} source is `binary`
 *   or `php_version.h`
 */
export function readPhpBuildVersion(absPath, rootDir) {
  const opened = openRegularFile(absPath, rootDir);
  if (!opened) {
    return undefined;
  }
  try {
    const fromBinary = scanBinaryVersion(opened.fd, opened.size);
    if (fromBinary) {
      return { version: fromBinary, source: "binary" };
    }
  } finally {
    try {
      closeSync(opened.fd);
    } catch {
      // already closed
    }
  }
  const fromHeader = readHeaderVersion(absPath, rootDir);
  return fromHeader
    ? { version: fromHeader, source: "php_version.h" }
    : undefined;
}
