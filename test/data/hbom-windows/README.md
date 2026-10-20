# Windows HBOM fixtures

Real output captured on a Windows 11 Pro 25H2 (build 26200) ARM64 virtual machine
running in Parallels, with Node.js 24.20 (an x64 build under emulation) and the
default redacted identifier policy. Nothing in these files was edited.

| File | Session | Command |
| --- | --- | --- |
| `vm-parallels-elevated.json` | administrator | `node bin/hbom.js --pretty` |
| `vm-parallels-elevated-privileged.json` | administrator | `node bin/hbom.js --pretty --privileged` |
| `vm-parallels-std-local-privileged.json` | standard user, local (batch) logon | `node bin/hbom.js --pretty --privileged` |
| `vm-parallels-std-network-privileged.json` | standard user, network (SSH) logon | `node bin/hbom.js --pretty --privileged` |
| `osquery-logical-drives.json` | administrator | the `logical_drives` components of `node bin/hbom.js --include-runtime`, extracted by script and otherwise unchanged |

All of them were produced by `@cdxgen/cdx-hbom@0.6.0` through cdxgen at the commit
that added them. The standard-user captures show what a non-administrator gets:
`permission-denied` diagnostics for the elevated-only batch, and, over a network
logon, only the Node baseline plus one `network-logon` diagnostic.

Privacy: they hold no host name, user name, MAC address or raw serial number.
Identifiers are `redacted:<last 4>`. The one GUID besides the random BOM serial
number is the ESRT class of the "System Firmware" update resource, which names a
firmware resource type and not a unit. `test/data/hbom-windows` is covered by a
test that rejects raw MAC addresses and unredacted identifier properties.

Regenerate these with the commands above on a Windows host instead of editing them.
Values the VM cannot produce (a `Warning` or `Unhealthy` disk, for example) are
derived inside the tests that need them and are commented as not captured.
