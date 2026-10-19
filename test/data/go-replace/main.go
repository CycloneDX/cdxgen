package main

import (
	"fmt"

	"example.com/local"
	ansiterm "github.com/Azure/go-ansiterm"
	"github.com/BurntSushi/toml"
	"github.com/mholt/archiver/v3"
	"github.com/moby/term"
)

func main() {
	var v map[string]any
	_, _ = toml.Decode("a = 1", &v)
	_ = archiver.NewTar()
	_ = ansiterm.CreateParser("Ground", nil)
	fmt.Println(local.Hello(), term.IsTerminal(0), v)
}
