module github.com/example/root-project

go 1.21

require (
	github.com/gorilla/mux v1.8.0
	github.com/example/root-project/submodule v0.0.0
)

replace github.com/example/root-project/submodule => ./submodule
