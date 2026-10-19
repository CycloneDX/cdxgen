module example.com/app

go 1.22

require github.com/pkg/errors v0.9.1

replace github.com/rcrowley/go-metrics => git.example.com/platform/go/kafka-metrics-converter v0.2.3

exclude (
	github.com/denisenkom/go-mssqldb v0.12.0
	github.com/denisenkom/go-mssqldb v0.12.2
)
