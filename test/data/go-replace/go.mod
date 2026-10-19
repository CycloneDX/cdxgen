module example.com/app

go 1.22

require (
	example.com/local v0.0.0
	github.com/Azure/go-ansiterm v0.0.0-20230124172434-306776ec8161
	github.com/BurntSushi/toml v1.3.2
	github.com/mholt/archiver/v3 v3.5.1
	github.com/moby/term v0.5.0
)

require (
	github.com/andybalholm/brotli v1.0.1 // indirect
	github.com/dsnet/compress v0.0.2-0.20210315054119-f66993602bf5 // indirect
	github.com/golang/snappy v0.0.2 // indirect
	github.com/klauspost/compress v1.11.4 // indirect
	github.com/klauspost/pgzip v1.2.5 // indirect
	github.com/nwaples/rardecode v1.1.0 // indirect
	github.com/pierrec/lz4/v4 v4.1.2 // indirect
	github.com/ulikunitz/xz v0.5.9 // indirect
	github.com/xi2/xz v0.0.0-20171230120015-48954b6210f8 // indirect
	golang.org/x/sys v0.1.0 // indirect
)

replace github.com/mholt/archiver/v3 v3.5.1 => github.com/anchore/archiver/v3 v3.5.2

replace example.com/local => ./local

replace example.com/unused => ./unused

replace github.com/kr/pretty => github.com/kr/pretty v0.3.1

replace github.com/pkg/errors v0.8.0 => github.com/pkg/errors v0.9.1
