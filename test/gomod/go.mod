module cdxgen/test

go 1.14

require (
    google.golang.org/grpc v1.32.0
    github.com/aws/aws-sdk-go v1.38.47
    github.com/spf13/viper v1.3.0
    github.com/spf13/cobra v1.0.0
)

// Having both replace sections is invalid in a go.mod file, but it allows the tests to validate both cases
replace google.golang.org/grpc => google.golang.org/grpc v1.21.0

replace (
    github.com/spf13/viper => github.com/spf13/viper v1.0.2
)