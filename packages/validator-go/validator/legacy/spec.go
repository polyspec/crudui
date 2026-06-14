package legacy

import "strings"

// ParsedSpec is the result of parsing a canonical crudui JSON document.
// IsGroup reports whether the document root was a group spec with properties;
// non-group specs are wrapped into a single field named "value".
type ParsedSpec struct {
	Spec    Spec
	IsGroup bool
}

// ParseSpec parses a canonical crudui JSON document
// (type/properties/rules format) into a validator Spec.
// Property and rule declaration order is preserved.
func ParseSpec(data []byte) (ParsedSpec, error) {
	decoded, err := DecodeOrderedJSON(data)
	if err != nil {
		return ParsedSpec{}, err
	}

	om, ok := decoded.(*OrderedMap)
	if !ok {
		return ParsedSpec{Spec: Spec{}}, nil
	}

	props, hasProps := om.Get("properties")
	propsOM, propsIsMap := props.(*OrderedMap)
	if om.GetString("type") == "group" && hasProps && propsIsMap {
		return ParsedSpec{
			Spec:    Spec{Fields: convertOrderedProperties(propsOM)},
			IsGroup: true,
		}, nil
	}

	// Wrap simple field spec in a group with a 'value' property
	return ParsedSpec{
		Spec:    Spec{Fields: []Field{convertOrderedField("value", om)}},
		IsGroup: false,
	}, nil
}

// convertOrderedProperties converts a properties object to fields in
// declaration order.
func convertOrderedProperties(props *OrderedMap) []Field {
	fields := make([]Field, 0, props.Len())
	for _, name := range props.Keys() {
		raw, _ := props.Get(name)
		if fieldOM, ok := raw.(*OrderedMap); ok {
			fields = append(fields, convertOrderedField(name, fieldOM))
		}
	}
	return fields
}

// convertOrderedField converts a single field spec object to a Field.
//
// A "[]"-suffix property key (e.g. "items[]") is legacy Limepie shorthand for
// a multiple field: the suffix is stripped from the field name (so it binds to
// the "items" data key) and Multiple is forced on. Without this the raw
// "items[]" key never matches the data and validation is silently skipped
// (PHP Validator.php and client dist.validate.js parity).
func convertOrderedField(name string, om *OrderedMap) Field {
	arraySuffix := strings.HasSuffix(name, "[]")
	if arraySuffix {
		name = strings.TrimSuffix(name, "[]")
	}

	field := Field{Name: name}
	if arraySuffix {
		field.Multiple = true
	}

	field.Type = om.GetString("type")
	field.Label = om.GetString("label")

	if raw, ok := om.Get("rules"); ok {
		if rulesOM, ok := raw.(*OrderedMap); ok {
			field.Rules = make(map[string]interface{}, rulesOM.Len())
			field.RuleOrder = make([]string, 0, rulesOM.Len())
			for _, ruleName := range rulesOM.Keys() {
				ruleVal, _ := rulesOM.Get(ruleName)
				field.Rules[ruleName] = ToPlain(ruleVal)
				field.RuleOrder = append(field.RuleOrder, ruleName)
			}
		}
	}

	if raw, ok := om.Get("messages"); ok {
		if msgOM, ok := raw.(*OrderedMap); ok {
			field.Messages = make(map[string]string, msgOM.Len())
			for _, msgKey := range msgOM.Keys() {
				if s := msgOM.GetString(msgKey); s != "" {
					field.Messages[msgKey] = s
				}
			}
		}
	}

	if raw, ok := om.Get("properties"); ok {
		if propsOM, ok := raw.(*OrderedMap); ok {
			field.Fields = convertOrderedProperties(propsOM)
		}
	}

	if raw, ok := om.Get("multiple"); ok {
		switch mv := raw.(type) {
		case bool:
			// A "[]"-suffix key already forced Multiple on; an explicit
			// multiple key can only widen it, never turn it off.
			field.Multiple = field.Multiple || mv
		case string:
			if mv == "only" {
				field.MultipleOnly = true
			}
		}
	}

	if raw, ok := om.Get("display_switch"); ok {
		field.DisplaySwitch = ToPlain(raw)
	}

	if dt := om.GetString("display_target"); dt != "" {
		field.DisplayTarget = dt
	}

	return field
}
