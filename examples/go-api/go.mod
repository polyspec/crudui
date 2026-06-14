module github.com/polyspec/polyspec/examples/go-api

go 1.21

require (
	github.com/polyspec/polyspec/packages/validator-go v0.0.0
	gopkg.in/yaml.v3 v3.0.1
)

replace github.com/polyspec/polyspec/packages/validator-go => ../../packages/validator-go
