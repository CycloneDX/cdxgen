# Tutorial: Dynamic Process Tracing and Library-Load SBOM Generation

This lesson shows how to generate a Software Bill of Materials (SBOM) by executing and tracing a target binary using process execution tracking and native OS sandboxing with `@cdxgen/safer-exec`. It works on Linux, macOS, and Windows 11; the [Windows section of the tracebom reference](TRACEBOM.md#windows) lists what Windows needs, and Step 5 below walks through a Windows run.

## Goal

By the end of this lesson you should be able to answer:

1. How do I capture libraries loaded dynamically at runtime that static analysis cannot see?
2. How do I associate loaded shared objects or libraries with host operating system packages?
3. How do I generate an SBOM containing dynamically instrumented components?
4. How do I collect HTTP URL endpoints accessed by a process and enumerate them as services?
5. How do I inspect and query these instrumented components in the `cdxi` REPL?

## Step 1: Run a dynamic SBOM scan

Use the dedicated `tracebom` CLI:

```bash
tracebom --cmd "node app.js" -o bom.json
```

If you need to trace inside a specific directory, use `--working-dir`:

```bash
tracebom --cmd "node app.js" -d /path/to/app -o bom.json
```

> **Note:** Dynamic SBOM generation via `cdxgen -t dynamic --trace-cmd` is still available through the library API, but the CLI surface (`--trace-cmd`, `--trace-working-dir`) has moved to the dedicated `tracebom` binary.

## Step 2: Understand the component attributes

The dynamic tracing engine automatically:

- Captures runtime `dlopen`-ed libraries, platform libraries, and dynamic linkers on Linux and macOS, and every DLL the process tree loads on Windows.
- Queries host package managers (`dpkg`, `apk`, `rpm`, `brew`) to resolve the file paths to system package metadata. Windows has no package manager to ask, so a DLL gets a `pkg:generic` purl with its path as the subpath.
- Calculates `SHA-256` hashes of the libraries.
- Tags components with `scope=required`.
- Populates the `evidence` field indicating the component identity was verified via `instrumentation` technique, setting the confidence to `0.8` if version is resolved or `0.5` if unknown.

Example component output in JSON:

```json
{
  "name": "libc6",
  "version": "2.39-0ubuntu8.9",
  "type": "library",
  "scope": "required",
  "purl": "pkg:deb/ubuntu/libc6@2.39-0ubuntu8.9?arch=amd64&distro=ubuntu-24.04&distro_name=noble",
  "hashes": [
    {
      "alg": "SHA-256",
      "content": "8b51d8b9487b35ff37651a2eb3a8a3a0e69882200f68d6fbb6b6b6b6b6b6b6b6"
    }
  ],
  "properties": [
    {
      "name": "cdx:dynamic:filePath",
      "value": "/usr/lib/x86_64-linux-gnu/libc.so.6"
    }
  ],
  "evidence": {
    "identity": [
      {
        "field": "purl",
        "confidence": 0.8,
        "methods": [
          {
            "technique": "instrumentation",
            "confidence": 0.8,
            "value": "pkg:deb/ubuntu/libc6@2.39-0ubuntu8.9?arch=amd64&distro=ubuntu-24.04&distro_name=noble"
          }
        ]
      }
    ]
  }
}
```

## Step 3: Collect HTTP services from URL tracing

When you add `--trace-http-urls`, tracebom enables eBPF-based HTTP URL tracing via `@cdxgen/safer-exec`. It intercepts TLS write calls and captures the plaintext HTTP request URLs before encryption.

```bash
# Trace a server for 30 seconds and collect both libraries and services
tracebom --cmd "node server.js" --trace-http-urls --trace-period 30 -o bom.json
```

For long-running or persistent commands, use `--trace-period` (in seconds). The trace will automatically stop after the specified period, and all collected data is used to generate the BOM.

Collected HTTP URLs are grouped by host and enumerated as CycloneDX `services`:

```json
{
  "services": [
    {
      "name": "dynamic-api.example.com-443",
      "bom-ref": "urn:service:dynamic:dynamic-api.example.com-443",
      "endpoints": [
        "https://api.example.com/v1/users",
        "https://api.example.com/v1/items"
      ],
      "properties": [
        { "name": "cdx:service:httpMethod", "value": "GET" },
        { "name": "cdx:service:httpMethod", "value": "POST" }
      ]
    }
  ]
}
```

## Step 3b: Cryptographic Tracing and CBOM Generation

When `--trace-crypto` is enabled (default), tracebom records cryptography from up to three sources, depending on the platform:

- **Linux:** eBPF uprobes on OpenSSL, GnuTLS, and Go's `crypto/tls` record TLS cipher negotiation and, with `--crypto-probe-mode operations`, digest, encrypt, and sign calls. This needs root or CAP_BPF and CAP_PERFMON.
- **Every platform, with `--proxy-egress`:** the egress proxy reads the unencrypted start of each TLS handshake and records the TLS version, cipher suite, and key-exchange group. It sees the handshake whichever TLS library made it, including runtimes such as Node.js and Go that build TLS in.
- **Windows, from an elevated prompt:** the crypto DLLs the process loads (CNG, Schannel, CryptoAPI, and bundled copies of OpenSSL and others), with their file versions.

This generates **CycloneDX 1.7** compliant `cryptographic-asset` components in the SBOM representing the algorithms and protocols (such as `TLS` with its `cipherSuites`) detected during runtime. Each suite refers to its bulk cipher (for example `aes256-GCM`) by bom-ref, and a post-quantum hybrid group such as `X25519MLKEM768` is recorded as its two halves, `x25519` and `ml-kem-768`. The library that implements the cryptography is not a separate asset: its library component carries `cdx:dynamic:cryptoLibrary`.

```bash
# Trace app.js and capture cryptographic assets into the same BOM output
tracebom --cmd "node app.js" --trace-crypto -o bom.json
```

The cryptographic assets are written into the same output file as the library
components; there is no separate CBOM output flag.

Traced assets use the same 1.7 shape as statically detected ones: an
`assetType`, an `oid`, and an `algorithmProperties` block carrying
`algorithmFamily` and — for elliptic-curve assets — `ellipticCurve`. An
algorithm without a known OID is left out, as it is for static detection. The
field reference is in
[ADVANCED.md](ADVANCED.md#the-shape-of-a-cryptographic-asset-component).

### Additional sandbox controls

tracebom exposes many of `@cdxgen/safer-exec`'s sandbox controls as CLI flags for advanced use cases. The egress proxy, sandbox dry-run, and ecosystem policies added in safer-exec 1.0 have their own walkthrough in [Lesson 34](LESSON34.md).

```bash
# Restrict CPU usage and pass only specific host variables to the sandbox
tracebom --cmd "npm install" --max-cpu 0.5 --allow-envs PATH,NPM_CONFIG_CACHE -o bom.json

# Strict mode + filesystem diffing (useful in CI/CD)
tracebom --cmd "npm install" --strict --diff --write-paths /tmp/cache -o bom.json

# Network allow-lists with port and host restrictions
tracebom --cmd "node server.js" --allow-host registry.npmjs.org --allow-port 443 -o bom.json

# Prevent forking and restrict which executables can run
tracebom --cmd "npm install" --block-fork --allow-exec node,npm --block-exec sh,bash -o bom.json
```

> **Note:** HTTP URL tracing requires Linux kernel >= 5.8 with eBPF support and sufficient capabilities (CAP_BPF, CAP_PERFMON). It gracefully falls back with an empty service list on other platforms.

## Step 4: Inspect the Instrumented components in `cdxi`

Launch the REPL:

```bash
cdxi bom.json
```

To list all dynamically instrumented components along with their paths, technique details, and confidence values, run:

```text
.instrumented
```

This prints a formatted table of all dynamically tracked libraries.

## Step 5: Trace a command on Windows

On Windows 11 the sandbox is a Microsoft eXecution Container, and DLL loads are
recorded by an ETW session that only an elevated prompt can start. Open
**Terminal (Admin)** and trace a command that makes an HTTPS request:

```powershell
tracebom --cmd "curl.exe -s -o NUL https://example.com" --proxy-egress --allow-host example.com -o bom.json
```

The BOM lists every DLL `curl.exe` loaded. The crypto DLLs among them carry
their file version and the library they belong to:

```json
{
  "name": "schannel.dll",
  "version": "6.2.26100.9444",
  "type": "library",
  "purl": "pkg:generic/schannel.dll@6.2.26100.9444#Windows/System32/schannel.dll",
  "properties": [
    {
      "name": "cdx:dynamic:filePath",
      "value": "C:\\Windows\\System32\\schannel.dll"
    },
    { "name": "cdx:dynamic:cryptoLibrary", "value": "Windows Schannel" }
  ]
}
```

Next to them sit the `TLSv1.3` protocol, `aes256-GCM` and `x25519` assets from
the handshake, and an `example.com` service with
`cdx:dynamic:egressDecision=allowed`.

Run the same command from a normal prompt and compare. tracebom warns that
library tracing needs an elevated prompt and the BOM has no library
components, but the TLS assets and the egress service are still there: the
proxy does not need elevation. Two more things to know before you trace your
own commands:

- Node.js and Java load `user32.dll`, which fails inside the container when it
  was started over SSH or from a service. Trace them from a desktop session.
- `--trace-http-urls` and `--crypto-probe-mode operations` use eBPF and do
  nothing on Windows. Use `--proxy-egress` for the network view.
