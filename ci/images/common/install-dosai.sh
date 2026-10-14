#! /bin/sh
# Install dosai for the .NET images; the images point DOSAI_CMD at it.
#
# The dosai in cdxgen-plugins-bin is framework-dependent and, from dosai
# 5.0.0, needs a .NET 11 runtime. Images with an older SDK install the
# self-contained -full build, which carries its own runtime. The .NET 11
# images install the framework-dependent .NET tool from NuGet instead, which
# runs on the image's own runtime.
#
# Usage: install-dosai.sh [full|tool]   (default full)
#
# Environment variables honoured:
#   DOSAI_VERSION - dosai release (default 5.0.0-rc.1)
#   DOSAI_SHA256  - sha256 of the -full binary, for a DOSAI_VERSION other
#                   than the default
#   GITHUB_URL    - GitHub mirror (default https://github.com)
#   NUGET_REPO    - NuGet mirror for the tool install
#   DOSAI_PREFIX  - install directory (default /opt/dosai)

set -e

DEFAULT_DOSAI_VERSION="5.0.0-rc.1"
DOSAI_VERSION="${DOSAI_VERSION:-${DEFAULT_DOSAI_VERSION}}"
GITHUB_URL="${GITHUB_URL:-https://github.com}"
DOSAI_PREFIX="${DOSAI_PREFIX:-/opt/dosai}"
mode="${1:-full}"

case "${mode}" in
  tool)
    # Pinned to the exact version; a release candidate needs no --prerelease
    # when it is named
    if [ -n "${NUGET_REPO}" ]; then
      dotnet tool install Dosai --version "${DOSAI_VERSION}" --tool-path "${DOSAI_PREFIX}" \
        --add-source "${NUGET_REPO}/index.json" --ignore-failed-sources
    else
      dotnet tool install Dosai --version "${DOSAI_VERSION}" --tool-path "${DOSAI_PREFIX}"
    fi
    ;;
  full)
    if ls /lib/ld-musl-* > /dev/null 2>&1; then
      libc=musl
    else
      libc=glibc
    fi
    # The hashes are the release asset digests of the default version
    case "${libc}-$(uname -m)" in
      glibc-x86_64)
        asset=Dosai-linux-amd64-full
        default_sha256=82c0cf29a2dd6c536aaa17f1c81ce522bf2fd65111641e0d02853ae7500b08e1
        ;;
      glibc-aarch64)
        asset=Dosai-linux-arm64-full
        default_sha256=00beb99ab697eded214627c74fccf426c8b6028940ca22a0d2f22846dbf67c22
        ;;
      musl-x86_64)
        asset=Dosai-linux-musl-x64-full
        default_sha256=72c063cf683f43b1ddbb0b03fb98c834e2eed4a78e6d174aa524fe22e1f94b18
        ;;
      musl-aarch64)
        asset=Dosai-linux-musl-arm64-full
        default_sha256=c6f19414a0d0e5ef9f1f04e4e6f74ff371bf92432340795e1dfb3867604beab6
        ;;
      *)
        echo "install-dosai: unsupported platform ${libc}-$(uname -m)" >&2
        exit 1
        ;;
    esac
    if [ -z "${DOSAI_SHA256}" ]; then
      if [ "${DOSAI_VERSION}" != "${DEFAULT_DOSAI_VERSION}" ]; then
        echo "install-dosai: set DOSAI_SHA256 for dosai ${DOSAI_VERSION}" >&2
        exit 1
      fi
      DOSAI_SHA256="${default_sha256}"
    fi
    mkdir -p "${DOSAI_PREFIX}"
    curl -fsSL -o "${DOSAI_PREFIX}/dosai" \
      "${GITHUB_URL}/owasp-dep-scan/dosai/releases/download/v${DOSAI_VERSION}/${asset}"
    echo "${DOSAI_SHA256}  ${DOSAI_PREFIX}/dosai" | sha256sum -c -
    chmod 0755 "${DOSAI_PREFIX}/dosai"
    ;;
  *)
    echo "install-dosai: unknown mode ${mode}; use full or tool" >&2
    exit 1
    ;;
esac

"${DOSAI_PREFIX}/dosai" --version
