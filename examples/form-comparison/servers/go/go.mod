module github.com/crudui/crudui/examples/form-comparison/servers/go

go 1.22

require (
    github.com/crudui/crudui/packages/validator-go v0.0.0
    sortjson v0.0.0
)

replace github.com/crudui/crudui/packages/validator-go => ../../../../packages/validator-go
replace sortjson => /workspace/ordered-json/go
