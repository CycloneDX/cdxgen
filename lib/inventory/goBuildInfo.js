// Bounded Go buildinfo reader for executable file components: recovers the
// toolchain version a binary was built with, so a BOM can answer "which Go
// programs predate the CVE-2026-111943 distrust list". Only the header and
// the inline version string are read; pointer-based (pre-1.18) layouts are
// reported as such and never followed.
//
// Layout: go/src/debug/buildinfo/buildinfo.go at tag go1.27.2. The 14-byte
// magic `\xff Go buildinf:` is 16-byte aligned; the next two bytes are the
// pointer size and flags. When flags&2 is set the version string follows as a
// uvarint length plus bytes. The magic can appear anywhere in the file's
// initial segment, so the search scans aligned offsets up to a cap.

import { closeSync, fstatSync, openSync, readSync } from "node:fs";

const BUILD_INFO_MAGIC = Buffer.from([
  0xff, 0x20, 0x47, 0x6f, 0x20, 0x62, 0x75, 0x69, 0x6c, 0x64, 0x69, 0x6e, 0x66,
  0x3a,
]);
const MAX_SEARCH_BYTES = 64 * 1024 * 1024;
const READ_CHUNK_BYTES = 64 * 1024;
const MAX_VERSION_BYTES = 128;
export const PRE_1_18_VERSION = "unknown-pre-1.18";

function readUvarint(buffer, offset) {
  let value = 0;
  let shift = 0;
  for (let i = 0; i < 10 && offset + i < buffer.length; i++) {
    const byte = buffer[offset + i];
    value += (byte & 0x7f) * 2 ** shift;
    if (!(byte & 0x80)) {
      return { value, next: offset + i + 1 };
    }
    shift += 7;
  }
  return undefined;
}

function parseHeaderAt(buffer, offset, limit) {
  if (offset + 32 > limit) {
    return undefined;
  }
  for (let i = 0; i < BUILD_INFO_MAGIC.length; i++) {
    if (buffer[offset + i] !== BUILD_INFO_MAGIC[i]) {
      return undefined;
    }
  }
  const pointerSize = buffer[offset + 14];
  const flags = buffer[offset + 15];
  if (pointerSize !== 4 && pointerSize !== 8) {
    return undefined;
  }
  if (!(flags & 0x02)) {
    // Version lives behind pointers (pre-1.18 layout): not followed.
    return PRE_1_18_VERSION;
  }
  // The inline strings start 16 bytes past the magic header (magic 14 +
  // pointerSize 1 + flags 1, then a reserved 16-byte slot), as a uvarint
  // length followed by the bytes.
  const varint = readUvarint(buffer, offset + 32);
  if (
    !varint ||
    varint.value === 0 ||
    varint.value > MAX_VERSION_BYTES ||
    varint.next + varint.value > limit
  ) {
    return undefined;
  }
  const version = buffer.toString(
    "latin1",
    varint.next,
    varint.next + varint.value,
  );
  if (!/^go[0-9]/.test(version)) {
    return undefined;
  }
  return version;
}

/**
 * Read the Go toolchain version from an executable's buildinfo header.
 *
 * @param {string} filePath absolute path to a possible Go binary
 * @returns {string|undefined} `go1.x.y`, `unknown-pre-1.18` for old layouts,
 *   or undefined when the file carries no Go buildinfo
 */
export function readGoBuildVersion(filePath) {
  if (typeof filePath !== "string" || !filePath) {
    return undefined;
  }
  let fd;
  try {
    fd = openSync(filePath, "r");
    const size = fstatSync(fd).size;
    if (size < 32) {
      return undefined;
    }
    const searchLimit = Math.min(size, MAX_SEARCH_BYTES);
    // Each chunk reads past the 64 KiB grid by a fixed overlap so a header
    // straddling the grid end is completed here rather than skipped; the
    // scan then resumes at the first aligned offset it could not finish, so
    // every aligned file offset is examined exactly once.
    const OVERLAP_BYTES = 256;
    const chunk = Buffer.alloc(READ_CHUNK_BYTES + OVERLAP_BYTES);
    let position = 0;
    while (position < searchLimit) {
      const want = Math.min(
        READ_CHUNK_BYTES + OVERLAP_BYTES,
        searchLimit - position,
      );
      const read = readSync(fd, chunk, 0, want, position);
      if (read < 32) {
        return undefined;
      }
      // The magic is 16-byte aligned in the file; chunk-relative offsets
      // stay on the file grid.
      let offset = (16 - (position % 16)) % 16;
      for (; offset + 32 <= read; offset += 16) {
        const version = parseHeaderAt(chunk, offset, read);
        if (version) {
          return version;
        }
      }
      const advance = offset - ((16 - (position % 16)) % 16);
      if (advance <= 0) {
        return undefined;
      }
      position += advance;
    }
    return undefined;
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // already closed
      }
    }
  }
}
