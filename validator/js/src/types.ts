/**
 * Form-spec Validator Type Definitions
 */

// ============================================================================
// Spec Types
// ============================================================================

/**
 * Root spec structure for form definition
 */
export interface Spec {
  type: 'group';
  name?: string;
  label?: string;
  title?: string;
  description?: string;
  properties: Record<string, FieldSpec>;
  action?: ActionSpec;
}

/**
 * Field specification
 */
export interface FieldSpec {
  type: string;
  label?: string;
  description?: string;
  placeholder?: string;
  default?: unknown;
  readonly?: boolean;
  disabled?: boolean;
  multiple?: boolean | 'only';
  rules?: RulesSpec;
  messages?: MessagesSpec;
  properties?: Record<string, FieldSpec>;
  items?: Record<string, string> | ItemsSourceSpec;
  display_switch?: string;
  display_target?: string;
  [key: string]: unknown;
}

/**
 * Action spec for form submission
 */
export interface ActionSpec {
  method?: string;
  url?: string;
  enctype?: string;
  buttons?: Record<string, ButtonSpec>;
}

/**
 * Button specification
 */
export interface ButtonSpec {
  label?: string;
  class?: string;
  type?: string;
  href?: string;
  onclick?: string;
}

/**
 * Dynamic items source specification
 */
export interface ItemsSourceSpec {
  model?: string;
  method?: string;
  value_field?: string;
  label_field?: string;
  empty_option?: string;
}

/**
 * Validation rules specification
 */
export interface RulesSpec {
  required?: boolean | string;
  email?: boolean;
  url?: boolean;
  minlength?: number;
  maxlength?: number;
  rangelength?: [number, number];
  match?: string;
  number?: boolean;
  digits?: boolean;
  min?: number;
  max?: number;
  range?: [number, number];
  step?: number;
  equalTo?: string;
  notEqual?: string | unknown;
  in?: unknown[];
  date?: boolean;
  dateISO?: boolean;
  enddate?: string;
  mincount?: number;
  maxcount?: number;
  minformcount?: number;
  maxformcount?: number;
  unique?: boolean | string;
  accept?: string | string[];
  [key: string]: unknown;
}

/**
 * Custom error messages specification
 */
export interface MessagesSpec {
  required?: string;
  email?: string;
  url?: string;
  minlength?: string;
  maxlength?: string;
  rangelength?: string;
  match?: string;
  number?: string;
  digits?: string;
  min?: string;
  max?: string;
  range?: string;
  step?: string;
  equalTo?: string;
  notEqual?: string;
  in?: string;
  date?: string;
  dateISO?: string;
  enddate?: string;
  mincount?: string;
  maxcount?: string;
  minformcount?: string;
  maxformcount?: string;
  unique?: string;
  accept?: string;
  [key: string]: string | undefined;
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Single validation error
 */
export interface ValidationError {
  path: string;
  field: string;
  rule: string;
  message: string;
  value?: unknown;
}

/**
 * Validation context passed to rule functions
 */
export interface ValidationContext {
  /** Full path to the current field */
  path: string;
  /** Field name (last segment of path) */
  field: string;
  /** Current field value */
  value: unknown;
  /** All form data */
  allData: Record<string, unknown>;
  /** Field specification */
  spec: FieldSpec;
  /** Parsed path segments */
  pathSegments: string[];
  /** Rule parameter value */
  ruleParam: unknown;
  /** Custom messages */
  messages?: MessagesSpec;
}

/**
 * Rule function signature
 */
export type RuleFn = (context: ValidationContext) => string | null;

/**
 * Rule definition with validation function and default message
 */
export interface RuleDefinition {
  validate: RuleFn;
  defaultMessage: string;
}

// ============================================================================
// Parser Types
// ============================================================================

/**
 * Token types for lexer
 */
export enum TokenType {
  // Literals
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  BOOLEAN = 'BOOLEAN',
  NULL = 'NULL',

  // Identifiers and paths
  IDENTIFIER = 'IDENTIFIER',
  DOT = 'DOT',
  DOT_DOT = 'DOT_DOT',
  ASTERISK = 'ASTERISK',

  // Comparison operators
  EQ = 'EQ',
  NE = 'NE',
  GT = 'GT',
  GE = 'GE',
  LT = 'LT',
  LE = 'LE',

  // Logical operators
  AND = 'AND',
  OR = 'OR',
  NOT = 'NOT',

  // Inclusion operators
  IN = 'IN',
  NOT_IN = 'NOT_IN',

  // Delimiters
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',
  LBRACKET = 'LBRACKET',
  RBRACKET = 'RBRACKET',
  COMMA = 'COMMA',

  // Ternary operators
  QUESTION = 'QUESTION',
  COLON = 'COLON',

  // Special
  EOF = 'EOF',
  WHITESPACE = 'WHITESPACE',
  INVALID = 'INVALID',
}

/**
 * Token position information
 */
export interface TokenPosition {
  start: number;
  end: number;
  line: number;
  column: number;
}

/**
 * Token structure
 */
export interface Token {
  type: TokenType;
  value: string;
  literal: unknown;
  position: TokenPosition;
}

// ============================================================================
// AST Node Types
// ============================================================================

/**
 * Base AST node interface
 */
export interface ASTNodeBase {
  type: string;
  position: {
    start: number;
    end: number;
  };
}

/**
 * Binary operation node (&&, ||, ==, !=, etc.)
 */
export interface BinaryNode extends ASTNodeBase {
  type: 'Binary';
  operator: '&&' | '||' | '==' | '!=' | '>' | '>=' | '<' | '<=';
  left: ASTNode;
  right: ASTNode;
}

/**
 * Unary operation node (!)
 */
export interface UnaryNode extends ASTNodeBase {
  type: 'Unary';
  operator: '!';
  operand: ASTNode;
}

/**
 * IN operation node
 */
export interface InNode extends ASTNodeBase {
  type: 'In';
  negated: boolean;
  value: ASTNode;
  list: ASTNode[];
}

/**
 * Path segment types
 */
export type PathSegment =
  | { type: 'identifier'; value: string }
  | { type: 'wildcard' }
  | { type: 'index'; value: number };

/**
 * Path reference node
 */
export interface PathNode extends ASTNodeBase {
  type: 'Path';
  relative: boolean;
  levelsUp: number;
  segments: PathSegment[];
}

/**
 * Literal value node
 */
export interface LiteralNode extends ASTNodeBase {
  type: 'Literal';
  valueType: 'string' | 'number' | 'boolean' | 'null';
  value: string | number | boolean | null;
}

/**
 * Grouped expression node (parentheses)
 */
export interface GroupNode extends ASTNodeBase {
  type: 'Group';
  expression: ASTNode;
}

/**
 * Ternary conditional expression node (condition ? trueValue : falseValue)
 */
export interface TernaryNode extends ASTNodeBase {
  type: 'Ternary';
  condition: ASTNode;
  trueValue: ASTNode;
  falseValue: ASTNode;
}

/**
 * Union of all AST node types
 */
export type ASTNode =
  | BinaryNode
  | UnaryNode
  | InNode
  | PathNode
  | LiteralNode
  | GroupNode
  | TernaryNode;

// ============================================================================
// Path Resolution Types
// ============================================================================

/**
 * Context for path resolution
 */
export interface PathContext {
  /** Current field's absolute path segments */
  currentPath: string[];
  /** Complete form data */
  formData: Record<string, unknown>;
}

/**
 * Wildcard evaluation strategy
 */
export type WildcardStrategy = 'ANY' | 'ALL' | 'NONE' | 'CURRENT';

// ============================================================================
// Condition Evaluation Types
// ============================================================================

/**
 * Condition evaluation context
 */
export interface ConditionContext extends PathContext {
  /** Wildcard evaluation strategy */
  wildcardStrategy?: WildcardStrategy;
}

/**
 * Parsed condition cache entry
 */
export interface CachedCondition {
  expression: string;
  ast: ASTNode;
}
