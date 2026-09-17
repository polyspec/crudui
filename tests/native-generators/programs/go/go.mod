module github.com/polyspec/crudui/tests/native-generators/programs/go

go 1.21

require (
	github.com/polyspec/crudui/packages/generator-go v0.0.1
	github.com/polyspec/crudui/packages/validator-go v0.0.1
)

replace (
	github.com/polyspec/crudui/packages/generator-go => ../../../../packages/generator-go
	github.com/polyspec/crudui/packages/validator-go => ../../../../packages/validator-go
)
