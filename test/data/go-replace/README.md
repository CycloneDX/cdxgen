# go-replace fixture

A real Go module, and the output Go 1.27.2 gave for it. Every module version
was checked on proxy.golang.org, and `go.sum` is what `go mod tidy` wrote.

`go.mod` holds a module replace (`github.com/mholt/archiver/v3 v3.5.1 =>
github.com/anchore/archiver/v3 v3.5.2`), a directory replace
(`example.com/local => ./local`), and three replaces that change nothing:
`example.com/unused => ./unused`, a replace of every version of
`github.com/kr/pretty`, and a replace of `github.com/pkg/errors v0.8.0`. Its
module paths include upper-case letters (`github.com/BurntSushi/toml`,
`github.com/Azure/go-ansiterm`), and `github.com/moby/term v0.5.0` requires an
older `github.com/Azure/go-ansiterm` than the one selected.

| File                        | Produced by                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `go-list-deps.txt`          | the `go list -deps -f … ./...` command of `createGoBom`, before `go mod vendor`    |
| `go-list-deps-vendor.txt`   | the same command after `go mod vendor`                                             |
| `go-mod-graph.txt`          | `go mod graph`                                                                     |
| `go-version-m.txt`          | `go version -m` of the binary `go build` made                                      |
| `vendor/modules.txt`        | `go mod vendor` (the vendored packages are left out)                               |
| `go-mod-why.txt`            | `go mod why -m -vendor` for every module of `go.sum`, each after a `=== module` line |
| `untidy/`                   | a go.mod naming an older direct require than the one selected, and its `go mod graph`; `go list` refuses it |
| `workspace/`                | a go.work workspace, and `go list -deps` and `go mod graph` run in member `a`      |

In the `go list` output, `<PROJECT>`, `<WORKSPACE>` and `<GOMODCACHE>` stand for
the project directory, the workspace directory and the module cache.
