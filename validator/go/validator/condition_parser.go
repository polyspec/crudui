package validator

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"unicode"
)

// ConditionParser parses and evaluates condition expressions
type ConditionParser struct {
	cache map[string]ASTNode
}

// NewConditionParser creates a new condition parser
func NewConditionParser() *ConditionParser {
	return &ConditionParser{
		cache: make(map[string]ASTNode),
	}
}

// Parse parses a condition expression into an AST
func (cp *ConditionParser) Parse(expression string) (ASTNode, error) {
	// Check cache
	if ast, ok := cp.cache[expression]; ok {
		return ast, nil
	}

	// Tokenize
	lexer := newLexer(expression)
	tokens, err := lexer.tokenize()
	if err != nil {
		return nil, err
	}

	// Parse
	parser := newParser(tokens)
	ast, err := parser.parse()
	if err != nil {
		return nil, err
	}

	// Cache
	cp.cache[expression] = ast

	return ast, nil
}

// Evaluate evaluates a condition expression against form data
func (cp *ConditionParser) Evaluate(expression string, formData map[string]interface{}, currentPath []string) (bool, error) {
	ast, err := cp.Parse(expression)
	if err != nil {
		return false, err
	}

	evaluator := newEvaluator(formData, currentPath)
	result := evaluator.evaluate(ast)

	return isTruthy(result), nil
}

// EvaluateValue evaluates an expression and returns the result value (for ternary expressions)
// Returns the raw value instead of just a boolean
func (cp *ConditionParser) EvaluateValue(expression string, formData map[string]interface{}, currentPath []string) (interface{}, error) {
	ast, err := cp.Parse(expression)
	if err != nil {
		return nil, err
	}

	evaluator := newEvaluator(formData, currentPath)
	return evaluator.evaluate(ast), nil
}

// Lexer tokenizes condition expressions
type lexer struct {
	input    string
	position int
	line     int
	column   int
}

func newLexer(input string) *lexer {
	return &lexer{
		input:    input,
		position: 0,
		line:     1,
		column:   1,
	}
}

func (l *lexer) tokenize() ([]Token, error) {
	var tokens []Token

	for !l.isAtEnd() {
		token, err := l.nextToken()
		if err != nil {
			return nil, err
		}
		if token.Type != TokenWhitespace {
			tokens = append(tokens, token)
		}
	}

	tokens = append(tokens, Token{Type: TokenEOF, Value: "", Position: TokenPosition{Start: l.position, End: l.position}})
	return tokens, nil
}

func (l *lexer) nextToken() (Token, error) {
	start := l.position
	startColumn := l.column

	// Skip whitespace
	if l.matchWhitespace() {
		return Token{Type: TokenWhitespace, Value: l.input[start:l.position]}, nil
	}

	// Multi-character operators (must check before single-character)
	if l.matchString("not in") || l.matchString("not  in") {
		return l.makeToken(TokenNotIn, "not in", start), nil
	}
	if l.matchString("&&") {
		return l.makeToken(TokenAnd, "&&", start), nil
	}
	if l.matchString("||") {
		return l.makeToken(TokenOr, "||", start), nil
	}
	if l.matchString("==") {
		return l.makeToken(TokenEQ, "==", start), nil
	}
	if l.matchString("!=") {
		return l.makeToken(TokenNE, "!=", start), nil
	}
	if l.matchString(">=") {
		return l.makeToken(TokenGE, ">=", start), nil
	}
	if l.matchString("<=") {
		return l.makeToken(TokenLE, "<=", start), nil
	}
	if l.matchString(">") {
		return l.makeToken(TokenGT, ">", start), nil
	}
	if l.matchString("<") {
		return l.makeToken(TokenLT, "<", start), nil
	}
	if l.matchString("!") {
		return l.makeToken(TokenNot, "!", start), nil
	}

	// Multiple dots (.. or ...)
	if l.peek() == '.' && l.peekNext() == '.' {
		dots := ""
		for l.peek() == '.' {
			dots += "."
			l.advance()
		}
		return l.makeToken(TokenDotDot, dots, start), nil
	}

	// Single dot
	if l.matchString(".") {
		return l.makeToken(TokenDot, ".", start), nil
	}

	// Asterisk
	if l.matchString("*") {
		return l.makeToken(TokenAsterisk, "*", start), nil
	}

	// Parentheses, brackets, and comma
	if l.matchString("(") {
		return l.makeToken(TokenLParen, "(", start), nil
	}
	if l.matchString(")") {
		return l.makeToken(TokenRParen, ")", start), nil
	}
	if l.matchString("[") {
		return l.makeToken(TokenLBracket, "[", start), nil
	}
	if l.matchString("]") {
		return l.makeToken(TokenRBracket, "]", start), nil
	}
	if l.matchString(",") {
		return l.makeToken(TokenComma, ",", start), nil
	}
	if l.matchString("?") {
		return l.makeToken(TokenQuestion, "?", start), nil
	}
	if l.matchString(":") {
		return l.makeToken(TokenColon, ":", start), nil
	}

	// String literal
	if l.peek() == '\'' || l.peek() == '"' {
		return l.readString()
	}

	// Keywords and identifiers
	if unicode.IsLetter(rune(l.peek())) || l.peek() == '_' {
		return l.readIdentifier()
	}

	// Numbers (including negative)
	if unicode.IsDigit(rune(l.peek())) || (l.peek() == '-' && unicode.IsDigit(rune(l.peekNext()))) {
		return l.readNumber()
	}

	// Unknown character
	char := l.advance()
	return Token{Type: TokenInvalid, Value: string(char), Position: TokenPosition{Start: start, End: l.position, Line: l.line, Column: startColumn}}, nil
}

func (l *lexer) readString() (Token, error) {
	start := l.position
	quote := l.advance() // opening quote

	var sb strings.Builder
	for !l.isAtEnd() && l.peek() != quote {
		if l.peek() == '\\' {
			l.advance() // skip backslash
			if !l.isAtEnd() {
				sb.WriteByte(l.advance())
			}
		} else {
			sb.WriteByte(l.advance())
		}
	}

	if l.isAtEnd() {
		return Token{}, fmt.Errorf("unterminated string at position %d", start)
	}

	l.advance() // closing quote
	return Token{
		Type:     TokenString,
		Value:    l.input[start:l.position],
		Literal:  sb.String(),
		Position: TokenPosition{Start: start, End: l.position},
	}, nil
}

func (l *lexer) readIdentifier() (Token, error) {
	start := l.position

	for !l.isAtEnd() && (unicode.IsLetter(rune(l.peek())) || unicode.IsDigit(rune(l.peek())) || l.peek() == '_') {
		l.advance()
	}

	value := l.input[start:l.position]

	// Check for keywords
	switch value {
	case "true":
		return Token{Type: TokenBoolean, Value: value, Literal: true, Position: TokenPosition{Start: start, End: l.position}}, nil
	case "false":
		return Token{Type: TokenBoolean, Value: value, Literal: false, Position: TokenPosition{Start: start, End: l.position}}, nil
	case "null":
		return Token{Type: TokenNull, Value: value, Literal: nil, Position: TokenPosition{Start: start, End: l.position}}, nil
	case "in":
		return Token{Type: TokenIn, Value: value, Position: TokenPosition{Start: start, End: l.position}}, nil
	default:
		return Token{Type: TokenIdentifier, Value: value, Position: TokenPosition{Start: start, End: l.position}}, nil
	}
}

func (l *lexer) readNumber() (Token, error) {
	start := l.position

	// Handle negative sign
	if l.peek() == '-' {
		l.advance()
	}

	// Read integer part
	for !l.isAtEnd() && unicode.IsDigit(rune(l.peek())) {
		l.advance()
	}

	// Read decimal part
	if l.peek() == '.' && unicode.IsDigit(rune(l.peekNext())) {
		l.advance() // consume '.'
		for !l.isAtEnd() && unicode.IsDigit(rune(l.peek())) {
			l.advance()
		}
	}

	value := l.input[start:l.position]
	num, _ := strconv.ParseFloat(value, 64)

	return Token{
		Type:     TokenNumber,
		Value:    value,
		Literal:  num,
		Position: TokenPosition{Start: start, End: l.position},
	}, nil
}

func (l *lexer) matchWhitespace() bool {
	if !l.isAtEnd() && unicode.IsSpace(rune(l.peek())) {
		for !l.isAtEnd() && unicode.IsSpace(rune(l.peek())) {
			if l.peek() == '\n' {
				l.line++
				l.column = 0
			}
			l.advance()
		}
		return true
	}
	return false
}

func (l *lexer) matchString(s string) bool {
	if strings.HasPrefix(l.input[l.position:], s) {
		// For "not in", handle extra whitespace
		if s == "not in" || s == "not  in" {
			// Match "not" followed by whitespace and "in"
			remaining := l.input[l.position:]
			re := regexp.MustCompile(`^not\s+in\b`)
			match := re.FindString(remaining)
			if match != "" {
				l.position += len(match)
				l.column += len(match)
				return true
			}
			return false
		}
		l.position += len(s)
		l.column += len(s)
		return true
	}
	return false
}

func (l *lexer) makeToken(tokenType TokenType, value string, start int) Token {
	return Token{
		Type:     tokenType,
		Value:    value,
		Position: TokenPosition{Start: start, End: l.position},
	}
}

func (l *lexer) peek() byte {
	if l.isAtEnd() {
		return 0
	}
	return l.input[l.position]
}

func (l *lexer) peekNext() byte {
	if l.position+1 >= len(l.input) {
		return 0
	}
	return l.input[l.position+1]
}

func (l *lexer) advance() byte {
	if l.isAtEnd() {
		return 0
	}
	char := l.input[l.position]
	l.position++
	l.column++
	return char
}

func (l *lexer) isAtEnd() bool {
	return l.position >= len(l.input)
}

// Parser parses tokens into an AST
type parser struct {
	tokens  []Token
	current int
}

func newParser(tokens []Token) *parser {
	return &parser{
		tokens:  tokens,
		current: 0,
	}
}

func (p *parser) parse() (ASTNode, error) {
	expr, err := p.parseTernaryExpression()
	if err != nil {
		return nil, err
	}

	if !p.isAtEnd() {
		return nil, fmt.Errorf("unexpected token: %s", p.peek().Value)
	}

	return expr, nil
}

// parseTernaryExpression parses: or_expression [ "?" ternary_expression ":" ternary_expression ]
func (p *parser) parseTernaryExpression() (ASTNode, error) {
	condition, err := p.parseOrExpression()
	if err != nil {
		return nil, err
	}

	if p.match(TokenQuestion) {
		trueValue, err := p.parseTernaryExpression()
		if err != nil {
			return nil, err
		}

		if !p.match(TokenColon) {
			return nil, fmt.Errorf("expected ':' in ternary expression at position %d", p.peek().Position.Start)
		}

		falseValue, err := p.parseTernaryExpression()
		if err != nil {
			return nil, err
		}

		return &TernaryNode{
			Condition:  condition,
			TrueValue:  trueValue,
			FalseValue: falseValue,
			Position: ASTPosition{
				Start: condition.getPosition().Start,
				End:   falseValue.getPosition().End,
			},
		}, nil
	}

	return condition, nil
}

func (p *parser) parseOrExpression() (ASTNode, error) {
	left, err := p.parseAndExpression()
	if err != nil {
		return nil, err
	}

	for p.match(TokenOr) {
		right, err := p.parseAndExpression()
		if err != nil {
			return nil, err
		}
		left = &BinaryNode{
			Operator: "||",
			Left:     left,
			Right:    right,
			Position: ASTPosition{
				Start: left.getPosition().Start,
				End:   right.getPosition().End,
			},
		}
	}

	return left, nil
}

func (p *parser) parseAndExpression() (ASTNode, error) {
	left, err := p.parseNotExpression()
	if err != nil {
		return nil, err
	}

	for p.match(TokenAnd) {
		right, err := p.parseNotExpression()
		if err != nil {
			return nil, err
		}
		left = &BinaryNode{
			Operator: "&&",
			Left:     left,
			Right:    right,
			Position: ASTPosition{
				Start: left.getPosition().Start,
				End:   right.getPosition().End,
			},
		}
	}

	return left, nil
}

func (p *parser) parseNotExpression() (ASTNode, error) {
	if p.match(TokenNot) {
		startPos := p.previous().Position.Start
		operand, err := p.parseNotExpression()
		if err != nil {
			return nil, err
		}
		return &UnaryNode{
			Operator: "!",
			Operand:  operand,
			Position: ASTPosition{
				Start: startPos,
				End:   operand.getPosition().End,
			},
		}, nil
	}

	return p.parseComparison()
}

func (p *parser) parseComparison() (ASTNode, error) {
	left, err := p.parsePrimary()
	if err != nil {
		return nil, err
	}

	// IN operator
	if p.match(TokenIn, TokenNotIn) {
		negated := p.previous().Type == TokenNotIn
		list, err := p.parseValueList()
		if err != nil {
			return nil, err
		}
		endPos := left.getPosition().End
		if len(list) > 0 {
			endPos = list[len(list)-1].getPosition().End
		}
		return &InNode{
			Negated:  negated,
			Value:    left,
			List:     list,
			Position: ASTPosition{Start: left.getPosition().Start, End: endPos},
		}, nil
	}

	// Comparison operators
	if p.match(TokenEQ, TokenNE, TokenGT, TokenGE, TokenLT, TokenLE) {
		operator := p.operatorFromToken(p.previous().Type)
		// Use parseComparisonValue to handle unquoted identifiers as strings
		right, err := p.parseComparisonValue()
		if err != nil {
			return nil, err
		}
		return &BinaryNode{
			Operator: operator,
			Left:     left,
			Right:    right,
			Position: ASTPosition{
				Start: left.getPosition().Start,
				End:   right.getPosition().End,
			},
		}, nil
	}

	return left, nil
}

// parseComparisonValue parses the right side of a comparison operator
// Unquoted identifiers without trailing dots are treated as string literals
func (p *parser) parseComparisonValue() (ASTNode, error) {
	// Check if this is a standalone identifier (not a path reference)
	if p.check(TokenIdentifier) {
		// Look ahead to see if there's a dot after the identifier
		currentPos := p.current
		p.advance() // consume the identifier

		if !p.check(TokenDot) {
			// No dot after identifier - treat as string literal
			token := p.previous()
			return &LiteralNode{
				ValueType: "string",
				Value:     token.Value,
				Position:  ASTPosition{Start: token.Position.Start, End: token.Position.End},
			}, nil
		}

		// Has a dot - this is a path reference, backtrack
		p.current = currentPos
	}

	// Otherwise, use the normal primary parsing
	return p.parsePrimary()
}

func (p *parser) parseValueList() ([]ASTNode, error) {
	var values []ASTNode

	// Check for bracket-enclosed list syntax: [US, CA, UK]
	hasBrackets := p.match(TokenLBracket)

	for {
		value, err := p.parseValue()
		if err != nil {
			return nil, err
		}
		values = append(values, value)

		if !p.match(TokenComma) {
			break
		}
	}

	// Consume closing bracket if we had an opening one
	if hasBrackets {
		if !p.match(TokenRBracket) {
			return nil, fmt.Errorf("expected closing bracket ] at position %d", p.peek().Position.Start)
		}
	}

	return values, nil
}

func (p *parser) parseValue() (ASTNode, error) {
	if p.match(TokenString, TokenNumber, TokenBoolean, TokenNull) {
		return p.parseLiteral(p.previous()), nil
	}

	// Unquoted identifier treated as string
	if p.match(TokenIdentifier) {
		token := p.previous()
		return &LiteralNode{
			ValueType: "string",
			Value:     token.Value,
			Position:  ASTPosition{Start: token.Position.Start, End: token.Position.End},
		}, nil
	}

	return nil, fmt.Errorf("expected value at position %d", p.peek().Position.Start)
}

func (p *parser) parsePrimary() (ASTNode, error) {
	// Grouped expression
	if p.match(TokenLParen) {
		expr, err := p.parseOrExpression()
		if err != nil {
			return nil, err
		}
		if !p.match(TokenRParen) {
			return nil, fmt.Errorf("expected ')' at position %d", p.peek().Position.Start)
		}
		return &GroupNode{
			Expression: expr,
			Position:   *expr.getPosition(),
		}, nil
	}

	// Path (relative or absolute)
	if p.check(TokenDot) || p.check(TokenDotDot) || p.check(TokenIdentifier) {
		return p.parsePath()
	}

	// Literal
	if p.match(TokenString, TokenNumber, TokenBoolean, TokenNull) {
		return p.parseLiteral(p.previous()), nil
	}

	return nil, fmt.Errorf("expected expression at position %d", p.peek().Position.Start)
}

func (p *parser) parsePath() (ASTNode, error) {
	startPos := p.peek().Position.Start
	relative := false
	levelsUp := 0

	// Handle relative path prefix
	if p.match(TokenDotDot) {
		relative = true
		dots := p.previous().Value
		levelsUp = len(dots) - 1 // .. = 1, ... = 2, etc.
	} else if p.match(TokenDot) {
		relative = true
		levelsUp = 0
	}

	// Parse path segments
	var segments []PathSegment

	// First segment (required for relative paths)
	if relative {
		segment, err := p.parsePathSegment()
		if err != nil {
			return nil, err
		}
		segments = append(segments, segment)
	} else {
		// For absolute paths, first identifier is required
		if !p.check(TokenIdentifier) {
			return nil, fmt.Errorf("expected identifier at position %d", p.peek().Position.Start)
		}
		segment, err := p.parsePathSegment()
		if err != nil {
			return nil, err
		}
		segments = append(segments, segment)
	}

	// Additional segments
	for p.match(TokenDot) {
		segment, err := p.parsePathSegment()
		if err != nil {
			return nil, err
		}
		segments = append(segments, segment)
	}

	return &PathNode{
		Relative: relative,
		LevelsUp: levelsUp,
		Segments: segments,
		Position: ASTPosition{Start: startPos, End: p.previous().Position.End},
	}, nil
}

func (p *parser) parsePathSegment() (PathSegment, error) {
	if p.match(TokenAsterisk) {
		return PathSegment{Type: "wildcard"}, nil
	}

	if p.match(TokenNumber) {
		return PathSegment{Type: "index", Value: p.previous().Value}, nil
	}

	if p.match(TokenIdentifier) {
		return PathSegment{Type: "identifier", Value: p.previous().Value}, nil
	}

	return PathSegment{}, fmt.Errorf("expected path segment at position %d", p.peek().Position.Start)
}

func (p *parser) parseLiteral(token Token) ASTNode {
	var valueType string
	switch token.Type {
	case TokenString:
		valueType = "string"
	case TokenNumber:
		valueType = "number"
	case TokenBoolean:
		valueType = "boolean"
	case TokenNull:
		valueType = "null"
	}

	return &LiteralNode{
		ValueType: valueType,
		Value:     token.Literal,
		Position:  ASTPosition{Start: token.Position.Start, End: token.Position.End},
	}
}

func (p *parser) operatorFromToken(t TokenType) string {
	switch t {
	case TokenEQ:
		return "=="
	case TokenNE:
		return "!="
	case TokenGT:
		return ">"
	case TokenGE:
		return ">="
	case TokenLT:
		return "<"
	case TokenLE:
		return "<="
	default:
		return ""
	}
}

func (p *parser) match(types ...TokenType) bool {
	for _, t := range types {
		if p.check(t) {
			p.advance()
			return true
		}
	}
	return false
}

func (p *parser) check(t TokenType) bool {
	if p.isAtEnd() {
		return false
	}
	return p.peek().Type == t
}

func (p *parser) advance() Token {
	if !p.isAtEnd() {
		p.current++
	}
	return p.previous()
}

func (p *parser) peek() Token {
	return p.tokens[p.current]
}

func (p *parser) previous() Token {
	return p.tokens[p.current-1]
}

func (p *parser) isAtEnd() bool {
	return p.peek().Type == TokenEOF
}

// Evaluator evaluates an AST against form data
type evaluator struct {
	formData    map[string]interface{}
	currentPath []string
}

func newEvaluator(formData map[string]interface{}, currentPath []string) *evaluator {
	return &evaluator{
		formData:    formData,
		currentPath: currentPath,
	}
}

func (e *evaluator) evaluate(node ASTNode) interface{} {
	switch n := node.(type) {
	case *BinaryNode:
		return e.evaluateBinary(n)
	case *UnaryNode:
		return e.evaluateUnary(n)
	case *InNode:
		return e.evaluateIn(n)
	case *TernaryNode:
		return e.evaluateTernary(n)
	case *PathNode:
		return e.evaluatePath(n)
	case *LiteralNode:
		return n.Value
	case *GroupNode:
		return e.evaluate(n.Expression)
	default:
		return nil
	}
}

// evaluateTernary evaluates a ternary expression and returns the value
func (e *evaluator) evaluateTernary(node *TernaryNode) interface{} {
	condition := e.evaluate(node.Condition)
	if isTruthy(condition) {
		return e.evaluate(node.TrueValue)
	}
	return e.evaluate(node.FalseValue)
}

func (e *evaluator) evaluateBinary(node *BinaryNode) interface{} {
	left := e.evaluate(node.Left)

	// Short-circuit evaluation
	if node.Operator == "&&" {
		if !isTruthy(left) {
			return false
		}
		return isTruthy(e.evaluate(node.Right))
	}

	if node.Operator == "||" {
		if isTruthy(left) {
			return true
		}
		return isTruthy(e.evaluate(node.Right))
	}

	right := e.evaluate(node.Right)

	switch node.Operator {
	case "==":
		return isEqual(left, right)
	case "!=":
		return !isEqual(left, right)
	case ">":
		return compare(left, right) > 0
	case ">=":
		return compare(left, right) >= 0
	case "<":
		return compare(left, right) < 0
	case "<=":
		return compare(left, right) <= 0
	default:
		return nil
	}
}

func (e *evaluator) evaluateUnary(node *UnaryNode) interface{} {
	value := e.evaluate(node.Operand)

	switch node.Operator {
	case "!":
		return !isTruthy(value)
	default:
		return nil
	}
}

func (e *evaluator) evaluateIn(node *InNode) bool {
	value := e.evaluate(node.Value)
	for _, item := range node.List {
		listValue := e.evaluate(item)
		if isEqual(value, listValue) {
			return !node.Negated
		}
	}
	return node.Negated
}

func (e *evaluator) evaluatePath(node *PathNode) interface{} {
	path := e.resolvePath(node)
	return e.getValueByPath(path)
}

func (e *evaluator) resolvePath(node *PathNode) []string {
	if !node.Relative {
		// Absolute path: use segments directly
		var path []string
		for _, seg := range node.Segments {
			if seg.Type == "wildcard" {
				path = append(path, "*")
			} else {
				path = append(path, seg.Value)
			}
		}
		return path
	}

	// Relative path calculation (like file system paths)
	// currentPath includes the field name being validated
	//
	// For '.field' (levelsUp=0): sibling - same parent (go up 1 from field)
	// For '..field' (levelsUp=1): parent's sibling (go up 2 from field)
	// For '...field' (levelsUp=2): grandparent's sibling (go up 3 from field)
	//
	// Example: currentPath = ["common", "yoil", "day"]
	// - .is_allday (levelsUp=0): basePath = ["common", "yoil"], result = ["common", "yoil", "is_allday"]
	// - ..is_sale (levelsUp=1): basePath = ["common"], result = ["common", "is_sale"]
	// - ...something (levelsUp=2): basePath = [], result = ["something"]
	baseLen := len(e.currentPath) - 1 - node.LevelsUp
	if baseLen < 0 {
		baseLen = 0
	}
	basePath := e.currentPath[:baseLen]

	var segmentPath []string
	for _, seg := range node.Segments {
		if seg.Type == "wildcard" {
			segmentPath = append(segmentPath, "*")
		} else {
			segmentPath = append(segmentPath, seg.Value)
		}
	}

	result := make([]string, len(basePath)+len(segmentPath))
	copy(result, basePath)
	copy(result[len(basePath):], segmentPath)
	return result
}

func (e *evaluator) getValueByPath(path []string) interface{} {
	// Handle wildcard
	wildcardIndex := -1
	for i, seg := range path {
		if seg == "*" {
			wildcardIndex = i
			break
		}
	}

	if wildcardIndex != -1 {
		return e.getValueWithWildcard(path, wildcardIndex)
	}

	// Normal path traversal
	var current interface{} = e.formData
	for _, segment := range path {
		if current == nil {
			return nil
		}

		switch v := current.(type) {
		case map[string]interface{}:
			current = v[segment]
		case []interface{}:
			idx, err := strconv.Atoi(segment)
			if err != nil || idx < 0 || idx >= len(v) {
				return nil
			}
			current = v[idx]
		default:
			return nil
		}
	}

	return current
}

func (e *evaluator) getValueWithWildcard(path []string, wildcardIndex int) interface{} {
	arrayPath := path[:wildcardIndex]
	remainingPath := path[wildcardIndex+1:]

	// Try to find the current array index from currentPath
	// The arrayPath should match a prefix of currentPath
	if len(e.currentPath) > len(arrayPath) && e.pathPrefixEquals(arrayPath, e.currentPath) {
		// Check if there's a numeric index at the wildcard position
		idxStr := e.currentPath[len(arrayPath)]
		if _, err := strconv.Atoi(idxStr); err == nil {
			// Same array context: use current index
			resolvedPath := append(append([]string{}, arrayPath...), idxStr)
			resolvedPath = append(resolvedPath, remainingPath...)
			return e.getValueByPath(resolvedPath)
		}
	}

	// Different array or no matching context: get from array (ANY strategy)
	arrayData := e.getValueByPath(arrayPath)

	// Handle object data (e.g., from multiple: "only" pattern)
	if obj, ok := arrayData.(map[string]interface{}); ok {
		// For objects, skip the wildcard and access remaining path directly
		if len(remainingPath) > 0 {
			return getNestedValue(obj, remainingPath)
		}
		return obj
	}

	arr, ok := arrayData.([]interface{})
	if !ok {
		return nil
	}

	// Return first non-nil value
	for i := range arr {
		resolvedPath := append(append([]string{}, arrayPath...), strconv.Itoa(i))
		resolvedPath = append(resolvedPath, remainingPath...)
		value := e.getValueByPath(resolvedPath)
		if value != nil {
			return value
		}
	}

	return nil
}

// pathPrefixEquals checks if prefix matches the beginning of path
func (e *evaluator) pathPrefixEquals(prefix, path []string) bool {
	if len(prefix) > len(path) {
		return false
	}
	for i := range prefix {
		if prefix[i] != path[i] {
			return false
		}
	}
	return true
}

func (e *evaluator) pathEquals(path1, path2 []string) bool {
	if len(path1) != len(path2) {
		return false
	}
	for i := range path1 {
		if path1[i] != path2[i] {
			return false
		}
	}
	return true
}

// Helper functions for evaluation

func isTruthy(value interface{}) bool {
	if value == nil {
		return false
	}

	switch v := value.(type) {
	case bool:
		return v
	case int, int8, int16, int32, int64:
		return v != 0
	case uint, uint8, uint16, uint32, uint64:
		return v != 0
	case float32:
		return v != 0
	case float64:
		return v != 0
	case string:
		return v != "" && v != "0" && strings.ToLower(v) != "false"
	case []interface{}:
		return len(v) > 0
	default:
		return true
	}
}

func isEqual(a, b interface{}) bool {
	// Handle nil
	if a == nil || b == nil {
		return a == nil && b == nil
	}

	// Try numeric comparison
	numA, okA := toFloat64(a)
	numB, okB := toFloat64(b)
	if okA && okB {
		return numA == numB
	}

	// Try boolean comparison
	if boolA, ok := a.(bool); ok {
		return boolA == toBoolean(b)
	}
	if boolB, ok := b.(bool); ok {
		return toBoolean(a) == boolB
	}

	// String comparison
	return toString(a) == toString(b)
}

func compare(a, b interface{}) int {
	numA, okA := toFloat64(a)
	numB, okB := toFloat64(b)

	if okA && okB {
		if numA < numB {
			return -1
		} else if numA > numB {
			return 1
		}
		return 0
	}

	// String comparison
	strA := toString(a)
	strB := toString(b)
	return strings.Compare(strA, strB)
}

func toBoolean(value interface{}) bool {
	switch v := value.(type) {
	case bool:
		return v
	case string:
		lower := strings.ToLower(v)
		return lower == "true" || lower == "1" || lower == "yes"
	case int, int8, int16, int32, int64:
		return v != 0
	case uint, uint8, uint16, uint32, uint64:
		return v != 0
	case float32:
		return v != 0
	case float64:
		return v != 0
	default:
		return false
	}
}
