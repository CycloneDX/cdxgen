// Every directive the Go toolchain's modfile parser accepts, in its
// single-line and block forms. `go mod edit -json` reads this file cleanly.
module github.com/cdxgen/gomod-directives

go 1.25.0

toolchain go1.25.1

godebug default=go1.21

godebug (
	panicnil=1
	asynctimerchan=0
)

require github.com/pkg/errors v0.9.1

require (
	github.com/google/uuid v1.6.0
	github.com/uber/prototool v1.10.0
	golang.org/x/net v0.33.0 // pinned (CVE-2024-45338)
	golang.org/x/text v0.21.0 // indirect
	golang.org/x/tools v0.28.0 // indirect; provides the stringer tool
	gopkg.in/yaml.v3 v3.0.1
)

tool golang.org/x/tools/cmd/stringer

tool (
	golang.org/x/tools/cmd/goimports
)

ignore ./node_modules

ignore (
	./third_party/javascript
	static
)

replace github.com/rcrowley/go-metrics => github.com/rcrowley/go-metrics v0.0.0-20201227073835-cf1acfcdf475

exclude github.com/denisenkom/go-mssqldb v0.12.0

exclude (
	github.com/denisenkom/go-mssqldb v0.12.2
	github.com/denisenkom/go-mssqldb v0.12.3
)

replace (
	github.com/mholt/archiver/v3 v3.5.1 => github.com/anchore/archiver/v3 v3.5.2
	github.com/gorilla/mux => ./third_party/mux
	github.com/gorilla/websocket v1.5.0 => ../websocket
)

retract v1.0.1 // Published accidentally.

retract (
	[v1.1.0, v1.1.5] // Built with a broken toolchain.
	v1.2.0
)
