package expr

import "sync"

// Public facade for the CRUDUI expression engine: string → tokens → AST → value.
//
// The pipeline is strictly staged (GRAMMAR §0): never split a string to
// evaluate, never eval. Parse caches one AST per expression string. Evaluate
// returns a boolean condition result; EvaluateValue returns a ternary's branch
// value and the boolean condition result for everything else (JS
// evaluateExpressionValue parity — the shared 4-language fixture is generated
// from the JS engine).

var (
	cacheMu  sync.RWMutex
	astCache = map[string]Node{}
)

// Tokenize tokenizes an expression. WHITESPACE excluded; ends with EOF. Returns
// an error only if the lexer hits malformed input (e.g. unterminated string).
func Tokenize(expression string) (tokens []Token, err error) {
	defer func() {
		if r := recover(); r != nil {
			if pe, ok := r.(*ParseError); ok {
				tokens, err = nil, pe
				return
			}
			panic(r)
		}
	}()
	return NewLexer(expression).Tokenize(), nil
}

// Parse parses an expression into its AST (cached). Returns *ParseError on
// malformed input.
func Parse(expression string) (node Node, err error) {
	cacheMu.RLock()
	if cached, ok := astCache[expression]; ok {
		cacheMu.RUnlock()
		return cached, nil
	}
	cacheMu.RUnlock()

	defer func() {
		if r := recover(); r != nil {
			if pe, ok := r.(*ParseError); ok {
				node, err = nil, pe
				return
			}
			panic(r)
		}
	}()

	tokens := NewLexer(expression).Tokenize()
	ast := NewParser(tokens).Parse()

	cacheMu.Lock()
	astCache[expression] = ast
	cacheMu.Unlock()

	return ast, nil
}

// Evaluate evaluates an expression to a truthy boolean (show/display call site).
func Evaluate(expression string, formData map[string]any, currentPath []string) (bool, error) {
	ast, err := Parse(expression)
	if err != nil {
		return false, err
	}
	return NewEvaluator(formData, currentPath).Evaluate(ast), nil
}

// EvaluateValue evaluates an expression to its raw value (class/style/number/null
// call site).
func EvaluateValue(expression string, formData map[string]any, currentPath []string) (any, error) {
	ast, err := Parse(expression)
	if err != nil {
		return nil, err
	}
	return NewEvaluator(formData, currentPath).EvaluateValue(ast), nil
}

// ClearCache clears the parsed-AST cache.
func ClearCache() {
	cacheMu.Lock()
	astCache = map[string]Node{}
	cacheMu.Unlock()
}
