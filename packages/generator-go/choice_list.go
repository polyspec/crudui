package generator

import (
	"fmt"
	"slices"
)

// choiceListExpected is the expected-value text of a choice list declaration failure.
const choiceListExpected = "value and label pairs with distinct string or number values"

// choicePair is one choice of a choice list: the canonical text of its value and its label.
type choicePair struct {
	value string
	label any
}

// isChoiceList reports whether items is a choice list: an array with an object element that
// has a value member.
func isChoiceList(items any) bool {
	a, ok := items.([]any)
	if !ok {
		return false
	}
	for _, item := range a {
		if has(item, "value") {
			return true
		}
	}
	return false
}

// appearanceMembers are the members a choice of a choice or multichoice field may declare
// besides value and label (docs/spec/schema.md, Choice appearance).
var appearanceMembers = []string{"class", "style", "attributes"}

// choicePairs returns the pairs of a choice list in list order, or false when an element has
// another member (an appearance member is accepted with appearance), lacks value or label, has a
// value that is not a string or a finite number, or repeats the canonical text of an earlier value.
func choicePairs(items any, appearance bool) ([]choicePair, bool) {
	a, _ := items.([]any)
	pairs := make([]choicePair, 0, len(a))
	seen := map[string]bool{}
	for _, item := range a {
		o := object(item)
		if o == nil || !o.Has("value") || !o.Has("label") {
			return nil, false
		}
		for _, key := range o.Keys() {
			if key != "value" && key != "label" && !(appearance && slices.Contains(appearanceMembers, key)) {
				return nil, false
			}
		}
		value := read(o, "value")
		var text string
		if s, ok := value.(string); ok {
			text = s
		} else if _, isBool := value.(bool); isBool {
			return nil, false
		} else if n, ok := asNumber(value); ok {
			text = numberString(n)
		} else {
			return nil, false
		}
		if seen[text] {
			return nil, false
		}
		seen[text] = true
		pairs = append(pairs, choicePair{text, read(o, "label")})
	}
	return pairs, true
}

// choiceLabel returns the label of the pair whose value has the given canonical text.
func choiceLabel(items any, text string) (any, bool) {
	pairs, _ := choicePairs(items, false)
	for _, pair := range pairs {
		if pair.value == text {
			return pair.label, true
		}
	}
	return nil, false
}

// checkChoiceAppearance rejects the appearance of a valid choice list whose class or style is not
// a string or whose attributes break the declared attribute rules, choice by choice in list order.
func checkChoiceAppearance(items any, path string) error {
	for index, item := range list(items) {
		choice := object(item)
		for _, member := range []string{"class", "style"} {
			if _, ok := read(choice, member).(string); choice.Has(member) && !ok {
				return fmt.Errorf("Invalid items.%d.%s at %s: expected a string", index, member, path)
			}
		}
		if choice.Has("attributes") {
			if e := checkDeclaredAttributes(read(choice, "attributes"), fmt.Sprintf("items.%d.attributes", index), path); e != nil {
				return e
			}
		}
	}
	return nil
}

// choiceAppearance adds the appearance a checked choice declares to its option model: the label
// class (className), the normalized label style (style) and the input attributes (attributes),
// each only when declared.
func choiceAppearance(option *Object, choice *Object) {
	if class, _ := read(choice, "class").(string); class != "" {
		option.Set("className", class)
	}
	if style, _ := read(choice, "style").(string); styleString(style) != "" {
		option.Set("style", styleString(style))
	}
	if attributes := object(read(choice, "attributes")); attributes != nil && attributes.Len() > 0 {
		option.Set("attributes", copyValue(attributes))
	}
}
