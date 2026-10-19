package main

import (
	ansiterm "github.com/Azure/go-ansiterm"
	"github.com/moby/term"
)

func main() {
	_ = ansiterm.CreateParser("Ground", nil)
	println(term.IsTerminal(0))
}
