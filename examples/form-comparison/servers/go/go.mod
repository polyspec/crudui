module github.com/polyspec/polyspec/examples/form-comparison/servers/go

go 1.22

require (
    github.com/polyspec/polyspec/packages/validator-go v0.0.0
    sortjson v0.0.0
)

replace github.com/polyspec/polyspec/packages/validator-go => ../../../../packages/validator-go
replace sortjson => /workspace/ordered-json/go
