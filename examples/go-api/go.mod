module github.com/example/form-generator/examples/go-api

go 1.21

require (
	github.com/example/form-generator/validator v0.0.0
	gopkg.in/yaml.v3 v3.0.1
)

replace github.com/example/form-generator/validator => ../../validator/go
