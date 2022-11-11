package main

import (
	"github.com/aquasecurity/trivy/pkg/commands"
	"os"
)

var (
	version = "dev"
)

func main() {
	os.Exit(run())
}

func run() int {
	exitStatus := 0
	app := commands.NewApp(version)
	if err := app.Execute(); err != nil {
		exitStatus = 1
	}
	return exitStatus
}
