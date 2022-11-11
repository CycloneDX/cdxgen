appname := trivy-cdxgen
sources := main.go

build = CGO_ENABLED=0 GOOS=$(1) GOARCH=$(2) go build -o build/$(appname)-$(1)-$(2)$(3)
sha = cd build && sha256sum $(appname)-$(1)-$(2)$(3) > $(appname)-$(1)-$(2)$(3).sha256

.PHONY: all windows darwin linux clean

all: windows darwin linux

clean: rm -rf build/

##### LINUX BUILDS #####
linux: build/linux_arm build/linux_arm64 build/linux_386 build/linux_amd64

build/linux_386: $(sources)
	$(call build,linux,386,)
	$(call sha,linux,386,)

build/linux_amd64: $(sources)
	$(call build,linux,amd64,)
	$(call sha,linux,amd64,)

build/linux_arm: $(sources)
	$(call build,linux,arm,)
	$(call sha,linux,arm,)

build/linux_arm64: $(sources)
	$(call build,linux,arm64,)
	$(call sha,linux,arm64,)

##### DARWIN (MAC) BUILDS #####
darwin: build/darwin_amd64

build/darwin_amd64: $(sources)
	$(call build,darwin,amd64,)
	$(call sha,darwin,amd64,)

##### WINDOWS BUILDS #####
windows: build/windows_386 build/windows_amd64

build/windows_386: $(sources)
	$(call build,windows,386,.exe)
	$(call sha,windows,386,.exe)

build/windows_amd64: $(sources)
	$(call build,windows,amd64,.exe)
	$(call sha,windows,amd64,.exe)
