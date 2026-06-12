module github.com/yejune/form-spec/examples/go-api

go 1.21

require (
	github.com/yejune/form-spec/packages/validator-go v0.0.0
	gopkg.in/yaml.v3 v3.0.1
)

replace github.com/yejune/form-spec/packages/validator-go => ../../packages/validator-go
