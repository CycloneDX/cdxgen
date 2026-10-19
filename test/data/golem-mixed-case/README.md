# golem-mixed-case fixture

A real Go module whose dependencies have upper-case letters in their module
paths (`github.com/BurntSushi/toml`, `github.com/Masterminds/semver/v3`) and a
`+incompatible` version (`github.com/dgrijalva/jwt-go`). `go.sum` is what
`go mod tidy` (Go 1.27.2) wrote.

`golem-report.json` is the output of golem 2.5.1:

    golem analyze --format json --dir . --callgraph none --dataflow none

with the project directory, the module cache and GOROOT replaced by
`<PROJECT>`, `<GOMODCACHE>` and `<GOROOT>`.
