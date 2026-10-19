package b

import "github.com/BurntSushi/toml"

func B() string {
	var v map[string]any
	_, _ = toml.Decode("a = 1", &v)
	return "b"
}
