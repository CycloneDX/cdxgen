package main

import (
	"crypto/md5"
	"fmt"
	"os"

	"github.com/BurntSushi/toml"
	"github.com/Masterminds/semver/v3"
	jwt "github.com/dgrijalva/jwt-go"
)

func main() {
	var cfg map[string]any
	if _, err := toml.DecodeFile(os.Args[1], &cfg); err != nil {
		panic(err)
	}
	v := semver.MustParse(fmt.Sprint(cfg["version"]))
	token := jwt.New(jwt.SigningMethodHS256)
	fmt.Println(v, token.Valid, md5.Sum([]byte(os.Args[1])))
}
