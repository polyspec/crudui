/**
 * CRUDUI Validator Type Definitions
 */

// ============================================================================
// Spec Types
// ============================================================================

/**
 * Validation rules specification
 */
export interface RulesSpec {
  /** Requires a non-empty value; a string may carry a conditional expression gating the requirement. */
  required?: boolean | string;
  /** Requires the value to be a syntactically valid email address. */
  email?: boolean;
  /** Requires the value to be a syntactically valid URL. */
  url?: boolean;
  /** Minimum allowed string length. */
  minlength?: number;
  /** Maximum allowed string length. */
  maxlength?: number;
  /** Allowed string-length range as `[min, max]` (inclusive). */
  rangelength?: [number, number];
  /** Regular expression the value must match. */
  match?: string;
  /** Alias of `match` - both names resolve to the same rule implementation */
  pattern?: string;
  /** Requires the value to be a valid number (integer or decimal). */
  number?: boolean;
  /** Requires the value to consist only of digit characters (0-9). */
  digits?: boolean;
  /** Minimum allowed numeric value. */
  min?: number;
  /** Maximum allowed numeric value. */
  max?: number;
  /** Allowed numeric range as `[min, max]` (inclusive). */
  range?: [number, number];
  /** Required increment; the value must be a multiple of this step. */
  step?: number;
  /** Path of another field whose value this field must equal. */
  equalTo?: string;
  /** Value (or field path) that this field's value must not equal. */
  notEqual?: string | unknown;
  /** Whitelist of allowed values; the value must be one of these. */
  in?: unknown[];
  /** Requires the value to be a parseable date. */
  date?: boolean;
  /** Requires the value to be an ISO-8601 formatted date. */
  dateISO?: boolean;
  /** Path of a start-date field; this field's date must not be earlier than it. */
  enddate?: string;
  /** Minimum number of selected/array items required. */
  mincount?: number;
  /** Maximum number of selected/array items allowed. */
  maxcount?: number;
  /** Minimum number of repeated sub-form instances required. */
  minformcount?: number;
  /** Maximum number of repeated sub-form instances allowed. */
  maxformcount?: number;
  /** Requires the value to be unique among siblings; a string may scope the uniqueness check. */
  unique?: boolean | string;
  /** Allowed file types as MIME types/extensions for file inputs. */
  accept?: string | string[];
  /** Index signature allowing custom/registered rule names not modeled explicitly. */
  [key: string]: unknown;
}

/**
 * Custom error messages specification
 */
export interface MessagesSpec {
  /** Error message shown when the `required` rule fails. */
  required?: string;
  /** Error message shown when the `email` rule fails. */
  email?: string;
  /** Error message shown when the `url` rule fails. */
  url?: string;
  /** Error message shown when the `minlength` rule fails. */
  minlength?: string;
  /** Error message shown when the `maxlength` rule fails. */
  maxlength?: string;
  /** Error message shown when the `rangelength` rule fails. */
  rangelength?: string;
  /** Error message shown when the `match` rule fails. */
  match?: string;
  /** Alias of `match` message */
  pattern?: string;
  /** Error message shown when the `number` rule fails. */
  number?: string;
  /** Error message shown when the `digits` rule fails. */
  digits?: string;
  /** Error message shown when the `min` rule fails. */
  min?: string;
  /** Error message shown when the `max` rule fails. */
  max?: string;
  /** Error message shown when the `range` rule fails. */
  range?: string;
  /** Error message shown when the `step` rule fails. */
  step?: string;
  /** Error message shown when the `equalTo` rule fails. */
  equalTo?: string;
  /** Error message shown when the `notEqual` rule fails. */
  notEqual?: string;
  /** Error message shown when the `in` rule fails. */
  in?: string;
  /** Error message shown when the `date` rule fails. */
  date?: string;
  /** Error message shown when the `dateISO` rule fails. */
  dateISO?: string;
  /** Error message shown when the `enddate` rule fails. */
  enddate?: string;
  /** Error message shown when the `mincount` rule fails. */
  mincount?: string;
  /** Error message shown when the `maxcount` rule fails. */
  maxcount?: string;
  /** Error message shown when the `minformcount` rule fails. */
  minformcount?: string;
  /** Error message shown when the `maxformcount` rule fails. */
  maxformcount?: string;
  /** Error message shown when the `unique` rule fails. */
  unique?: string;
  /** Error message shown when the `accept` rule fails. */
  accept?: string;
  /** Index signature mapping any rule name to its custom error message. */
  [key: string]: string | undefined;
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Validation result
 */
export interface ValidationResult {
  /** True when every field passed validation; false if any error was collected. */
  valid: boolean;
  /** List of all validation errors found; empty when `valid` is true. */
  errors: ValidationError[];
}

/**
 * Single validation error
 */
export interface ValidationError {
  /** Full dotted path to the field that failed (e.g., `items.0.name`). */
  path: string;
  /** Name of the failing field (last segment of `path`). */
  field: string;
  /** Name of the rule that produced this error (e.g., `required`, `email`). */
  rule: string;
  /** Human-readable error message for display. */
  message: string;
  /** The field value that failed validation, if available. */
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
  spec: {
    /** Widget type for the value being validated. */
    type: string;
  };
  /** Parsed path segments */
  pathSegments: string[];
  /** Rule parameter value */
  ruleParam: unknown;
  /** Custom messages */
  messages?: MessagesSpec;
  /** Name under which the rule was invoked (e.g., 'pattern' vs 'match') */
  ruleName?: string;
}

/**
 * Rule function signature
 */
export type RuleFn = (context: ValidationContext) => string | null;

/**
 * Rule definition with validation function and default message
 */
export interface RuleDefinition {
  /** Validation function; returns an error message string on failure or null on success. */
  validate: RuleFn;
  /** Fallback message used when the spec provides no custom message for this rule. */
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
  /** Zero-based index of the token's first character in the source string. */
  start: number;
  /** Zero-based index just past the token's last character in the source string. */
  end: number;
  /** One-based line number where the token starts. */
  line: number;
  /** One-based column number where the token starts. */
  column: number;
}

/**
 * Token structure
 */
export interface Token {
  /** Lexical category of the token. */
  type: TokenType;
  /** Raw source text of the token. */
  value: string;
  /** Parsed literal value for value tokens (string/number/boolean/null); otherwise unused. */
  literal: unknown;
  /** Location of the token within the source string. */
  position: TokenPosition;
}

// ============================================================================
// AST Node Types
// ============================================================================

/**
 * Base AST node interface
 */
export interface ASTNodeBase {
  /** Discriminant identifying the node kind (e.g., `Binary`, `Path`, `Literal`). */
  type: string;
  /** Source span covered by this node. */
  position: {
    /** Zero-based start index of the node in the source string. */
    start: number;
    /** Zero-based end index (exclusive) of the node in the source string. */
    end: number;
  };
}

/**
 * Binary operation node (&&, ||, ==, !=, etc.)
 */
export interface BinaryNode extends ASTNodeBase {
  /** Node discriminant; always `'Binary'`. */
  type: 'Binary';
  /** Binary operator joining the two operands. */
  operator: '&&' | '||' | '==' | '!=' | '>' | '>=' | '<' | '<=';
  /** Left-hand operand expression. */
  left: ASTNode;
  /** Right-hand operand expression. */
  right: ASTNode;
}

/**
 * Unary operation node (!)
 */
export interface UnaryNode extends ASTNodeBase {
  /** Node discriminant; always `'Unary'`. */
  type: 'Unary';
  /** Unary operator; logical negation (`!`). */
  operator: '!';
  /** Expression the operator is applied to. */
  operand: ASTNode;
}

/**
 * IN operation node
 */
export interface InNode extends ASTNodeBase {
  /** Node discriminant; always `'In'`. */
  type: 'In';
  /** True for `not in`; inverts the membership test. */
  negated: boolean;
  /** Expression tested for membership in the list. */
  value: ASTNode;
  /** Candidate expressions the value is checked against. */
  list: ASTNode[];
}

/**
 * Path segment types
 */
export type PathSegment =
  | {
      /** Segment kind: a named field/property. */
      type: 'identifier';
      /** Field/property name for this segment. */
      value: string;
    }
  | {
      /** Segment kind: a wildcard matching any array index. */
      type: 'wildcard';
    }
  | {
      /** Segment kind: a fixed array index. */
      type: 'index';
      /** Zero-based array index for this segment. */
      value: number;
    };

/**
 * Path reference node
 */
export interface PathNode extends ASTNodeBase {
  /** Node discriminant; always `'Path'`. */
  type: 'Path';
  /** True when the path is relative to the current field rather than absolute. */
  relative: boolean;
  /** Number of parent levels (`..`) to ascend before resolving the segments. */
  levelsUp: number;
  /** Ordered segments describing how to navigate the data tree. */
  segments: PathSegment[];
}

/**
 * Literal value node
 */
export interface LiteralNode extends ASTNodeBase {
  /** Node discriminant; always `'Literal'`. */
  type: 'Literal';
  /** Primitive kind of the literal value. */
  valueType: 'string' | 'number' | 'boolean' | 'null';
  /** The literal's concrete value. */
  value: string | number | boolean | null;
}

/**
 * Grouped expression node (parentheses)
 */
export interface GroupNode extends ASTNodeBase {
  /** Node discriminant; always `'Group'`. */
  type: 'Group';
  /** The parenthesized inner expression. */
  expression: ASTNode;
}

/**
 * Ternary conditional expression node (condition ? trueValue : falseValue)
 */
export interface TernaryNode extends ASTNodeBase {
  /** Node discriminant; always `'Ternary'`. */
  type: 'Ternary';
  /** Condition expression evaluated to choose a branch. */
  condition: ASTNode;
  /** Expression returned when the condition is truthy. */
  trueValue: ASTNode;
  /** Expression returned when the condition is falsy. */
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
  /**
   * True when the condition being evaluated is attached to a group node
   * (e.g., display_switch on a group). Affects relative path resolution:
   * both "." and ".." resolve to the group's siblings.
   */
  groupNode?: boolean;
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
  /** Original condition source string used as the cache key. */
  expression: string;
  /** Parsed AST for the expression, reused to avoid re-parsing. */
  ast: ASTNode;
}

// ============================================================================
// Validator Options
// ============================================================================

/** Virtual files available to `$ref` resolution, indexed by reference key. */
export type FileSet = Record<string, Record<string, unknown>>;
