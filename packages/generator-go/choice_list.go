package generator

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

// choicePairs returns the pairs of a choice list in list order, or false when an element has
// another member, lacks value or label, has a value that is not a string or a finite number,
// or repeats the canonical text of an earlier value.
func choicePairs(items any) ([]choicePair, bool) {
	a, _ := items.([]any)
	pairs := make([]choicePair, 0, len(a))
	seen := map[string]bool{}
	for _, item := range a {
		o := object(item)
		if o == nil || o.Len() != 2 || !o.Has("value") || !o.Has("label") {
			return nil, false
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
	pairs, _ := choicePairs(items)
	for _, pair := range pairs {
		if pair.value == text {
			return pair.label, true
		}
	}
	return nil, false
}
