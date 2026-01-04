package validator

// Spec represents the form specification
type Spec struct {
	Fields []Field          `json:"fields"`
	Rules  map[string]Rule  `json:"rules,omitempty"`
}

// Field represents a form field definition
type Field struct {
	Name         string                 `json:"name"`
	Type         string                 `json:"type"`
	Label        string                 `json:"label,omitempty"`
	Required     interface{}            `json:"required,omitempty"` // bool or string (condition)
	Rules        map[string]interface{} `json:"rules,omitempty"`
	Messages     map[string]string      `json:"messages,omitempty"`
	Fields       []Field                `json:"fields,omitempty"`   // for nested/group fields
	Multiple     bool                   `json:"multiple,omitempty"` // for repeatable groups (array)
	MultipleOnly bool                   `json:"-"`                  // for "only" mode (single object treated like array for wildcards)
}

// Rule represents a custom rule definition
type Rule struct {
	Pattern string `json:"pattern,omitempty"`
	Min     *int   `json:"min,omitempty"`
	Max     *int   `json:"max,omitempty"`
	Message string `json:"message"`
}

// ValidationResult represents the result of validation
type ValidationResult struct {
	IsValid bool              `json:"isValid"`
	Errors  []ValidationError `json:"errors"`
}

// ValidationError represents a single validation error
type ValidationError struct {
	Field   string      `json:"field"`
	Rule    string      `json:"rule"`
	Message string      `json:"message"`
	Value   interface{} `json:"value,omitempty"`
}

// RuleFunc is the signature for custom validation rules
// Returns nil if valid, or pointer to error message if invalid
type RuleFunc func(value interface{}, params []string, allData map[string]interface{}, context *ValidationContext) *string

// ValidationContext provides context for validation
type ValidationContext struct {
	CurrentPath []string               // Current field path
	FormData    map[string]interface{} // All form data
	FieldDef    *Field                 // Current field definition
}

// TokenType represents the type of a lexer token
type TokenType int

const (
	TokenEOF TokenType = iota
	TokenString
	TokenNumber
	TokenBoolean
	TokenNull
	TokenIdentifier
	TokenDot
	TokenDotDot
	TokenAsterisk
	TokenEQ
	TokenNE
	TokenGT
	TokenGE
	TokenLT
	TokenLE
	TokenAnd
	TokenOr
	TokenNot
	TokenIn
	TokenNotIn
	TokenLParen
	TokenRParen
	TokenLBracket
	TokenRBracket
	TokenQuestion
	TokenColon
	TokenComma
	TokenWhitespace
	TokenInvalid
)

// Token represents a lexer token
type Token struct {
	Type     TokenType
	Value    string
	Literal  interface{}
	Position TokenPosition
}

// TokenPosition represents the position of a token
type TokenPosition struct {
	Start  int
	End    int
	Line   int
	Column int
}

// ASTNode is the interface for all AST nodes
type ASTNode interface {
	nodeType() string
	getPosition() *ASTPosition
}

// ASTPosition represents the position of an AST node
type ASTPosition struct {
	Start int
	End   int
}

// BinaryNode represents a binary operation (&&, ||, ==, !=, etc.)
type BinaryNode struct {
	Operator string
	Left     ASTNode
	Right    ASTNode
	Position ASTPosition
}

func (n *BinaryNode) nodeType() string        { return "Binary" }
func (n *BinaryNode) getPosition() *ASTPosition { return &n.Position }

// UnaryNode represents a unary operation (!)
type UnaryNode struct {
	Operator string
	Operand  ASTNode
	Position ASTPosition
}

func (n *UnaryNode) nodeType() string        { return "Unary" }
func (n *UnaryNode) getPosition() *ASTPosition { return &n.Position }

// InNode represents an 'in' or 'not in' operation
type InNode struct {
	Negated  bool
	Value    ASTNode
	List     []ASTNode
	Position ASTPosition
}

func (n *InNode) nodeType() string        { return "In" }
func (n *InNode) getPosition() *ASTPosition { return &n.Position }

// PathNode represents a path reference
type PathNode struct {
	Relative bool
	LevelsUp int
	Segments []PathSegment
	Position ASTPosition
}

func (n *PathNode) nodeType() string        { return "Path" }
func (n *PathNode) getPosition() *ASTPosition { return &n.Position }

// PathSegment represents a segment of a path
type PathSegment struct {
	Type  string // "identifier", "wildcard", "index"
	Value string
}

// LiteralNode represents a literal value
type LiteralNode struct {
	ValueType string // "string", "number", "boolean", "null"
	Value     interface{}
	Position  ASTPosition
}

func (n *LiteralNode) nodeType() string        { return "Literal" }
func (n *LiteralNode) getPosition() *ASTPosition { return &n.Position }

// GroupNode represents a parenthesized expression
type GroupNode struct {
	Expression ASTNode
	Position   ASTPosition
}

func (n *GroupNode) nodeType() string          { return "Group" }
func (n *GroupNode) getPosition() *ASTPosition { return &n.Position }

// TernaryNode represents a ternary expression (condition ? trueValue : falseValue)
type TernaryNode struct {
	Condition  ASTNode
	TrueValue  ASTNode
	FalseValue ASTNode
	Position   ASTPosition
}

func (n *TernaryNode) nodeType() string          { return "Ternary" }
func (n *TernaryNode) getPosition() *ASTPosition { return &n.Position }
