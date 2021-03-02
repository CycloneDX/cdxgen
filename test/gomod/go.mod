module cdxgen/test

go 1.14

require (
    google.golang.org/grpc v1.32.0
    github.com/spf13/cobra v1.0.0
)

replace (
    google.golang.org/grpc => google.golang.org/grpc v1.21.0
)