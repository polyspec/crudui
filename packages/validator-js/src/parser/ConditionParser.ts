/**
 * Condition Expression Parser
 *
 * Parses condition expressions like:
 * - ".field == 'value'"
 * - ".field1 == 'a' && .field2 > 5"
 * - "items.*.is_close == 0"
 * - ".is_display in 2,3"
 */

import {
  Token,
  TokenType,
  TokenPosition,
  ASTNode,
  BinaryNode,
  UnaryNode,
  InNode,
  PathNode,
  LiteralNode,
  GroupNode,
  TernaryNode,
  PathSegment,
} from '../types';
import { ConditionCache, getDefaultCache, CacheStats } from './ConditionCache';

// ============================================================================
// Lexer
// ============================================================================

/**
 * Error context information for detailed error reporting
 */
export interface ParseErrorContext {
  /** The token that caused the error */
  foundToken?: Token;
  /** Expected token types or descriptions */
  expected?: string[];
  /** Partial AST constructed before the error */
  partialAST?: ASTNode | null;
  /** The parsing phase where the error occurred */
  phase?: 'lexer' | 'parser';
  /** Additional context information */
  hint?: string;
}

/**
 * Parse error with detailed position and context information
 */
export class ParseError extends Error {
  public readonly position: TokenPosition;
  public readonly context: ParseErrorContext;
  public readonly expression?: string;

  constructor(
    message: string,
    position: TokenPosition,
    context: ParseErrorContext = {}
  ) {
    const formattedMessage = ParseError.formatMessage(message, position, context);
    super(formattedMessage);
    this.name = 'ParseError';
    this.position = position;
    this.context = context;
  }

  /**
   * Format a human-readable error message
   */
  private static formatMessage(
    message: string,
    position: TokenPosition,
    context: ParseErrorContext
  ): string {
    const parts: string[] = [message];

    // Add position information
    parts.push(`  at line ${position.line}, column ${position.column} (position ${position.start})`);

    // Add found token information
    if (context.foundToken) {
      const tokenDesc = ParseError.describeToken(context.foundToken);
      parts.push(`  Found: ${tokenDesc}`);
    }

    // Add expected tokens
    if (context.expected && context.expected.length > 0) {
      if (context.expected.length === 1) {
        parts.push(`  Expected: ${context.expected[0]}`);
      } else {
        parts.push(`  Expected one of: ${context.expected.join(', ')}`);
      }
    }

    // Add hint if provided
    if (context.hint) {
      parts.push(`  Hint: ${context.hint}`);
    }

    return parts.join('\n');
  }

  /**
   * Create a human-readable description of a token
   */
  static describeToken(token: Token): string {
    switch (token.type) {
      case TokenType.EOF:
        return 'end of expression';
      case TokenType.STRING:
        return `string "${token.literal}"`;
      case TokenType.NUMBER:
        return `number ${token.literal}`;
      case TokenType.BOOLEAN:
        return `boolean ${token.literal}`;
      case TokenType.NULL:
        return 'null';
      case TokenType.IDENTIFIER:
        return `identifier "${token.value}"`;
      case TokenType.DOT:
        return 'dot (.)';
      case TokenType.DOT_DOT:
        return `dots (${'.'.repeat(token.literal as number)})`;
      case TokenType.ASTERISK:
        return 'wildcard (*)';
      case TokenType.LPAREN:
        return 'opening parenthesis (';
      case TokenType.RPAREN:
        return 'closing parenthesis )';
      case TokenType.LBRACKET:
        return 'opening bracket [';
      case TokenType.RBRACKET:
        return 'closing bracket ]';
      case TokenType.COMMA:
        return 'comma (,)';
      case TokenType.QUESTION:
        return 'question mark (?)';
      case TokenType.COLON:
        return 'colon (:)';
      case TokenType.AND:
        return 'AND operator (&&)';
      case TokenType.OR:
        return 'OR operator (||)';
      case TokenType.NOT:
        return 'NOT operator (!)';
      case TokenType.EQ:
        return 'equality operator (==)';
      case TokenType.NE:
        return 'not-equal operator (!=)';
      case TokenType.GT:
        return 'greater-than operator (>)';
      case TokenType.GE:
        return 'greater-or-equal operator (>=)';
      case TokenType.LT:
        return 'less-than operator (<)';
      case TokenType.LE:
        return 'less-or-equal operator (<=)';
      case TokenType.IN:
        return 'IN operator';
      case TokenType.NOT_IN:
        return 'NOT IN operator';
      case TokenType.INVALID:
        return `invalid character "${token.value}"`;
      default:
        return `"${token.value}"`;
    }
  }

  /**
   * Get a visual representation of the error location in the expression
   */
  getErrorPointer(expression: string): string {
    const lines = expression.split('\n');
    const lineIndex = this.position.line - 1;

    if (lineIndex >= 0 && lineIndex < lines.length) {
      const line = lines[lineIndex];
      const pointer = ' '.repeat(this.position.column - 1) + '^';
      return `${line}\n${pointer}`;
    }

    return expression;
  }

  /**
   * Get the partial AST if available
   */
  getPartialAST(): ASTNode | null {
    return this.context.partialAST ?? null;
  }

  /**
   * Create a JSON-serializable representation of the error
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      position: this.position,
      context: {
        foundToken: this.context.foundToken ? {
          type: this.context.foundToken.type,
          value: this.context.foundToken.value,
        } : undefined,
        expected: this.context.expected,
        phase: this.context.phase,
        hint: this.context.hint,
        hasPartialAST: this.context.partialAST !== undefined,
      },
    };
  }
}

/**
 * Lexer class for tokenizing condition expressions
 */
export class Lexer {
  private input: string;
  private position: number = 0;
  private line: number = 1;
  private column: number = 1;

  constructor(input: string) {
    this.input = input;
  }

  /**
   * Tokenize the input string
   */
  tokenize(): Token[] {
    const tokens: Token[] = [];

    while (!this.isAtEnd()) {
      const token = this.nextToken();
      if (token.type !== TokenType.WHITESPACE) {
        tokens.push(token);
      }
    }

    tokens.push(this.makeToken(TokenType.EOF, '', null));
    return tokens;
  }

  private nextToken(): Token {
    const start = this.position;

    // Whitespace
    if (this.matchWhitespace()) {
      return this.makeToken(
        TokenType.WHITESPACE,
        this.input.slice(start, this.position),
        null
      );
    }

    // Multi-character operators first
    if (this.matchString('not in') || this.matchString('not  in')) {
      return this.makeToken(TokenType.NOT_IN, 'not in', null);
    }
    if (this.matchString('&&')) {
      return this.makeToken(TokenType.AND, '&&', null);
    }
    if (this.matchString('||')) {
      return this.makeToken(TokenType.OR, '||', null);
    }
    if (this.matchString('==')) {
      return this.makeToken(TokenType.EQ, '==', null);
    }
    if (this.matchString('!=')) {
      return this.makeToken(TokenType.NE, '!=', null);
    }
    if (this.matchString('>=')) {
      return this.makeToken(TokenType.GE, '>=', null);
    }
    if (this.matchString('<=')) {
      return this.makeToken(TokenType.LE, '<=', null);
    }
    if (this.matchString('>')) {
      return this.makeToken(TokenType.GT, '>', null);
    }
    if (this.matchString('<')) {
      return this.makeToken(TokenType.LT, '<', null);
    }

    // NOT operator (single !)
    if (this.peek() === '!' && this.peekNext() !== '=') {
      this.advance();
      return this.makeToken(TokenType.NOT, '!', null);
    }

    // Multi-dot (.., ..., etc.)
    if (this.peek() === '.') {
      let dotCount = 0;
      const dotStart = this.position;
      while (this.peek() === '.') {
        dotCount++;
        this.advance();
      }

      if (dotCount > 1) {
        return this.makeToken(
          TokenType.DOT_DOT,
          this.input.slice(dotStart, this.position),
          dotCount
        );
      } else {
        return this.makeToken(TokenType.DOT, '.', null);
      }
    }

    // Asterisk (wildcard)
    if (this.matchString('*')) {
      return this.makeToken(TokenType.ASTERISK, '*', null);
    }

    // Parentheses
    if (this.matchString('(')) {
      return this.makeToken(TokenType.LPAREN, '(', null);
    }
    if (this.matchString(')')) {
      return this.makeToken(TokenType.RPAREN, ')', null);
    }

    // Brackets
    if (this.matchString('[')) {
      return this.makeToken(TokenType.LBRACKET, '[', null);
    }
    if (this.matchString(']')) {
      return this.makeToken(TokenType.RBRACKET, ']', null);
    }

    // Comma
    if (this.matchString(',')) {
      return this.makeToken(TokenType.COMMA, ',', null);
    }

    // Ternary operators
    if (this.matchString('?')) {
      return this.makeToken(TokenType.QUESTION, '?', null);
    }
    if (this.matchString(':')) {
      return this.makeToken(TokenType.COLON, ':', null);
    }

    // String literal
    if (this.peek() === "'" || this.peek() === '"') {
      return this.readString();
    }

    // Number
    if (this.isDigit(this.peek()) || (this.peek() === '-' && this.isDigit(this.peekNext()))) {
      return this.readNumber();
    }

    // Keywords and identifiers
    if (this.isAlpha(this.peek())) {
      return this.readIdentifier();
    }

    // Unknown character
    const char = this.advance();
    return this.makeToken(TokenType.INVALID, char, null);
  }

  private readString(): Token {
    const quote = this.advance();
    const start = this.position;
    let value = '';

    while (!this.isAtEnd() && this.peek() !== quote) {
      if (this.peek() === '\\') {
        this.advance();
        if (!this.isAtEnd()) {
          const escaped = this.advance();
          switch (escaped) {
            case 'n':
              value += '\n';
              break;
            case 't':
              value += '\t';
              break;
            case 'r':
              value += '\r';
              break;
            case '\\':
              value += '\\';
              break;
            case "'":
              value += "'";
              break;
            case '"':
              value += '"';
              break;
            default:
              value += escaped;
          }
        }
      } else {
        value += this.advance();
      }
    }

    if (this.isAtEnd()) {
      throw new ParseError(
        'Unterminated string literal',
        this.makePosition(start),
        {
          phase: 'lexer',
          expected: [`closing ${quote} quote`],
          hint: `String starting at position ${start - 1} was not closed. Add a ${quote} at the end.`,
        }
      );
    }

    this.advance(); // closing quote
    return this.makeToken(TokenType.STRING, quote + value + quote, value);
  }

  private readNumber(): Token {
    const start = this.position;

    if (this.peek() === '-') {
      this.advance();
    }

    while (this.isDigit(this.peek())) {
      this.advance();
    }

    if (this.peek() === '.' && this.isDigit(this.peekNext())) {
      this.advance(); // consume '.'
      while (this.isDigit(this.peek())) {
        this.advance();
      }
    }

    // Scientific notation
    if (this.peek() === 'e' || this.peek() === 'E') {
      this.advance();
      if (this.peek() === '+' || this.peek() === '-') {
        this.advance();
      }
      while (this.isDigit(this.peek())) {
        this.advance();
      }
    }

    const value = this.input.slice(start, this.position);
    return this.makeToken(TokenType.NUMBER, value, parseFloat(value));
  }

  private readIdentifier(): Token {
    const start = this.position;

    while (this.isAlphaNumeric(this.peek())) {
      this.advance();
    }

    const value = this.input.slice(start, this.position);

    // Check keywords
    if (value === 'true') {
      return this.makeToken(TokenType.BOOLEAN, value, true);
    }
    if (value === 'false') {
      return this.makeToken(TokenType.BOOLEAN, value, false);
    }
    if (value === 'null') {
      return this.makeToken(TokenType.NULL, value, null);
    }
    if (value === 'in') {
      return this.makeToken(TokenType.IN, value, null);
    }
    if (value === 'not') {
      // Check for "not in"
      const savedPosition = this.position;
      this.matchWhitespace();
      if (this.matchString('in')) {
        return this.makeToken(TokenType.NOT_IN, 'not in', null);
      }
      this.position = savedPosition;
    }

    return this.makeToken(TokenType.IDENTIFIER, value, value);
  }

  private matchWhitespace(): boolean {
    let matched = false;
    while (!this.isAtEnd() && /\s/.test(this.peek())) {
      this.advance();
      matched = true;
    }
    return matched;
  }

  private matchString(str: string): boolean {
    if (this.input.slice(this.position, this.position + str.length) === str) {
      this.position += str.length;
      this.column += str.length;
      return true;
    }
    return false;
  }

  private peek(): string {
    return this.input[this.position] || '\0';
  }

  private peekNext(): string {
    return this.input[this.position + 1] || '\0';
  }

  private advance(): string {
    const char = this.input[this.position] || '\0';
    this.position++;
    if (char === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return char;
  }

  private isAtEnd(): boolean {
    return this.position >= this.input.length;
  }

  private isDigit(c: string): boolean {
    return c >= '0' && c <= '9';
  }

  private isAlpha(c: string): boolean {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
  }

  private isAlphaNumeric(c: string): boolean {
    return this.isAlpha(c) || this.isDigit(c);
  }

  private makePosition(start: number): TokenPosition {
    return {
      start,
      end: this.position,
      line: this.line,
      column: this.column,
    };
  }

  private makeToken(type: TokenType, value: string, literal: unknown): Token {
    return {
      type,
      value,
      literal,
      position: {
        start: this.position - value.length,
        end: this.position,
        line: this.line,
        column: this.column - value.length,
      },
    };
  }
}

// ============================================================================
// Parser
// ============================================================================

/**
 * Parse result containing AST and optional partial AST on error
 */
export interface ParseResult {
  /** The successfully parsed AST (null if parsing failed) */
  ast: ASTNode | null;
  /** Whether parsing was successful */
  success: boolean;
  /** Error if parsing failed */
  error?: ParseError;
  /** Partial AST constructed before the error occurred */
  partialAST?: ASTNode | null;
}

/**
 * Parser class for building AST from tokens
 */
export class Parser {
  private tokens: Token[];
  private current: number = 0;
  private partialAST: ASTNode | null = null;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  /**
   * Parse tokens into AST
   */
  parse(): ASTNode {
    const expression = this.parseTernaryExpression();
    this.partialAST = expression;

    if (!this.isAtEnd()) {
      const token = this.peek();
      throw new ParseError(
        'Unexpected token after expression',
        token.position,
        {
          foundToken: token,
          expected: ['end of expression'],
          phase: 'parser',
          partialAST: this.partialAST,
          hint: 'The expression appears complete, but there are additional tokens. Check for missing operators or extra characters.',
        }
      );
    }

    return expression;
  }

  /**
   * Try to parse and return a result object instead of throwing
   */
  tryParse(): ParseResult {
    try {
      const ast = this.parse();
      return {
        ast,
        success: true,
      };
    } catch (error) {
      if (error instanceof ParseError) {
        return {
          ast: null,
          success: false,
          error,
          partialAST: error.getPartialAST(),
        };
      }
      throw error;
    }
  }

  // ternary_expression = or_expression [ "?" ternary_expression ":" ternary_expression ]
  private parseTernaryExpression(): ASTNode {
    const condition = this.parseOrExpression();
    this.partialAST = condition;

    if (this.match(TokenType.QUESTION)) {
      const trueValue = this.parseTernaryExpression();

      if (!this.match(TokenType.COLON)) {
        const token = this.peek();
        throw new ParseError(
          'Missing colon in ternary expression',
          token.position,
          {
            foundToken: token,
            expected: ['colon (:)'],
            phase: 'parser',
            partialAST: condition,
            hint: 'Ternary expressions require the format: condition ? trueValue : falseValue',
          }
        );
      }

      const falseValue = this.parseTernaryExpression();

      return {
        type: 'Ternary',
        condition,
        trueValue,
        falseValue,
        position: {
          start: condition.position.start,
          end: falseValue.position.end,
        },
      } as TernaryNode;
    }

    return condition;
  }

  // or_expression = and_expression { "||" and_expression }
  private parseOrExpression(): ASTNode {
    let left = this.parseAndExpression();

    while (this.match(TokenType.OR)) {
      const right = this.parseAndExpression();
      left = {
        type: 'Binary',
        operator: '||',
        left,
        right,
        position: {
          start: left.position.start,
          end: right.position.end,
        },
      } as BinaryNode;
    }

    return left;
  }

  // and_expression = not_expression { "&&" not_expression }
  private parseAndExpression(): ASTNode {
    let left = this.parseNotExpression();

    while (this.match(TokenType.AND)) {
      const right = this.parseNotExpression();
      left = {
        type: 'Binary',
        operator: '&&',
        left,
        right,
        position: {
          start: left.position.start,
          end: right.position.end,
        },
      } as BinaryNode;
    }

    return left;
  }

  // not_expression = "!" not_expression | comparison
  private parseNotExpression(): ASTNode {
    if (this.match(TokenType.NOT)) {
      const startPos = this.previous().position.start;
      const operand = this.parseNotExpression();
      return {
        type: 'Unary',
        operator: '!',
        operand,
        position: {
          start: startPos,
          end: operand.position.end,
        },
      } as UnaryNode;
    }

    return this.parseComparison();
  }

  // comparison = primary [ comparison_op value | in_op value_list ]
  private parseComparison(): ASTNode {
    const left = this.parsePrimary();

    // Check for IN operator
    if (this.match(TokenType.IN, TokenType.NOT_IN)) {
      const negated = this.previous().type === TokenType.NOT_IN;
      const list = this.parseValueList();
      const lastItem = list[list.length - 1];
      return {
        type: 'In',
        negated,
        value: left,
        list,
        position: {
          start: left.position.start,
          end: lastItem ? lastItem.position.end : left.position.end,
        },
      } as InNode;
    }

    // Check for comparison operators
    if (
      this.match(
        TokenType.EQ,
        TokenType.NE,
        TokenType.GT,
        TokenType.GE,
        TokenType.LT,
        TokenType.LE
      )
    ) {
      const operator = this.previous().value as BinaryNode['operator'];
      // Parse right side: allows unquoted identifiers as string literals
      const right = this.parseComparisonValue();
      return {
        type: 'Binary',
        operator,
        left,
        right,
        position: {
          start: left.position.start,
          end: right.position.end,
        },
      } as BinaryNode;
    }

    return left;
  }

  // value_list = "[" value { "," value } "]" | value { "," value }
  private parseValueList(): ASTNode[] {
    const values: ASTNode[] = [];

    // Check for bracket-enclosed list syntax: [US, CA, UK]
    const hasBrackets = this.match(TokenType.LBRACKET);

    // Parse first value (can be unquoted identifier treated as string)
    values.push(this.parseValueListItem());

    while (this.match(TokenType.COMMA)) {
      values.push(this.parseValueListItem());
    }

    // Consume closing bracket if we had an opening one
    if (hasBrackets) {
      if (!this.match(TokenType.RBRACKET)) {
        const token = this.peek();
        throw new ParseError(
          'Missing closing bracket in value list',
          token.position,
          {
            foundToken: token,
            expected: ['closing bracket (])'],
            phase: 'parser',
            hint: `List started with '[' but was not closed. Found ${values.length} value(s) so far.`,
          }
        );
      }
    }

    return values;
  }

  private parseValueListItem(): ASTNode {
    const token = this.peek();

    // For "in" operator, unquoted identifiers are treated as strings
    if (this.match(TokenType.IDENTIFIER)) {
      const prev = this.previous();
      return {
        type: 'Literal',
        valueType: 'string',
        value: prev.value,
        position: prev.position,
      } as LiteralNode;
    }

    // Numbers
    if (this.match(TokenType.NUMBER)) {
      const prev = this.previous();
      return {
        type: 'Literal',
        valueType: 'number',
        value: prev.literal as number,
        position: prev.position,
      } as LiteralNode;
    }

    // Strings
    if (this.match(TokenType.STRING)) {
      const prev = this.previous();
      return {
        type: 'Literal',
        valueType: 'string',
        value: prev.literal as string,
        position: prev.position,
      } as LiteralNode;
    }

    throw new ParseError(
      'Invalid value in list',
      token.position,
      {
        foundToken: token,
        expected: ['identifier', 'number', 'string'],
        phase: 'parser',
        hint: 'Values in an "in" list must be identifiers, numbers, or quoted strings.',
      }
    );
  }

  /**
   * Parse a comparison value (right side of ==, !=, etc.)
   * Unquoted identifiers without dots are treated as string literals.
   * This handles cases like: .country == US, .status != draft
   */
  private parseComparisonValue(): ASTNode {
    // Check if this is a standalone identifier (not a path reference)
    // A path reference would be: .field, ..field, or identifier.field
    if (this.check(TokenType.IDENTIFIER)) {
      // Look ahead to see if there's a dot after the identifier
      const currentPos = this.current;
      this.advance(); // consume the identifier

      if (!this.check(TokenType.DOT)) {
        // No dot after identifier - treat as string literal
        const prev = this.previous();
        return {
          type: 'Literal',
          valueType: 'string',
          value: prev.value,
          position: prev.position,
        } as LiteralNode;
      }

      // Has a dot - this is a path reference, backtrack
      this.current = currentPos;
    }

    // Otherwise, use the normal primary parsing
    return this.parsePrimary();
  }

  // primary = path | literal | "(" expression ")"
  private parsePrimary(): ASTNode {
    // Grouped expression
    if (this.match(TokenType.LPAREN)) {
      const startPos = this.previous().position.start;
      const expression = this.parseOrExpression();

      if (!this.match(TokenType.RPAREN)) {
        const token = this.peek();
        throw new ParseError(
          'Missing closing parenthesis',
          token.position,
          {
            foundToken: token,
            expected: ['closing parenthesis )'],
            phase: 'parser',
            partialAST: expression,
            hint: 'Opening parenthesis was found but not closed. Check for matching parentheses.',
          }
        );
      }

      return {
        type: 'Group',
        expression,
        position: {
          start: startPos,
          end: this.previous().position.end,
        },
      } as GroupNode;
    }

    // Path (starts with dot or identifier)
    if (
      this.check(TokenType.DOT) ||
      this.check(TokenType.DOT_DOT) ||
      this.check(TokenType.IDENTIFIER)
    ) {
      return this.parsePath();
    }

    // Literals
    if (this.match(TokenType.STRING)) {
      const prev = this.previous();
      return {
        type: 'Literal',
        valueType: 'string',
        value: prev.literal as string,
        position: prev.position,
      } as LiteralNode;
    }

    if (this.match(TokenType.NUMBER)) {
      const prev = this.previous();
      return {
        type: 'Literal',
        valueType: 'number',
        value: prev.literal as number,
        position: prev.position,
      } as LiteralNode;
    }

    if (this.match(TokenType.BOOLEAN)) {
      const prev = this.previous();
      return {
        type: 'Literal',
        valueType: 'boolean',
        value: prev.literal as boolean,
        position: prev.position,
      } as LiteralNode;
    }

    if (this.match(TokenType.NULL)) {
      const prev = this.previous();
      return {
        type: 'Literal',
        valueType: 'null',
        value: null,
        position: prev.position,
      } as LiteralNode;
    }

    const token = this.peek();
    throw new ParseError(
      'Unexpected token in expression',
      token.position,
      {
        foundToken: token,
        expected: ['path (.field)', 'literal (string, number, boolean, null)', 'grouped expression (...)'],
        phase: 'parser',
        partialAST: this.partialAST,
        hint: 'Expected a value, field reference, or grouped expression.',
      }
    );
  }

  // path = relative_path | absolute_path
  private parsePath(): PathNode {
    const startPos = this.peek().position.start;
    let relative = false;
    let levelsUp = 0;
    const segments: PathSegment[] = [];

    // Check for relative path prefix
    if (this.match(TokenType.DOT_DOT)) {
      relative = true;
      levelsUp = (this.previous().literal as number) - 1;
    } else if (this.match(TokenType.DOT)) {
      relative = true;
      levelsUp = 0;
    }

    // Parse path segments
    if (this.match(TokenType.IDENTIFIER)) {
      segments.push({
        type: 'identifier',
        value: this.previous().value,
      });
    } else if (relative) {
      const token = this.peek();
      throw new ParseError(
        'Missing field name after dot prefix',
        token.position,
        {
          foundToken: token,
          expected: ['identifier (field name)'],
          phase: 'parser',
          hint: 'A dot prefix must be followed by a field name, e.g., ".fieldName" or "..parentField".',
        }
      );
    }

    // Parse remaining segments
    while (this.match(TokenType.DOT)) {
      if (this.match(TokenType.ASTERISK)) {
        segments.push({ type: 'wildcard' });
      } else if (this.match(TokenType.NUMBER)) {
        segments.push({
          type: 'index',
          value: this.previous().literal as number,
        });
      } else if (this.match(TokenType.IDENTIFIER)) {
        segments.push({
          type: 'identifier',
          value: this.previous().value,
        });
      } else {
        const token = this.peek();
        throw new ParseError(
          'Invalid path segment after dot',
          token.position,
          {
            foundToken: token,
            expected: ['identifier (field name)', 'number (array index)', 'wildcard (*)'],
            phase: 'parser',
            hint: `Path segments after '.' must be a field name, array index, or wildcard. Got: ${ParseError.describeToken(token)}`,
          }
        );
      }
    }

    const endPos = this.previous().position.end;

    return {
      type: 'Path',
      relative,
      levelsUp,
      segments,
      position: {
        start: startPos,
        end: endPos,
      },
    };
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private peek(): Token {
    return this.tokens[this.current]!;
  }

  private previous(): Token {
    return this.tokens[this.current - 1]!;
  }
}

// ============================================================================
// ConditionParser (Main API)
// ============================================================================

/**
 * Default cache instance for parsed conditions
 */
let conditionCache: ConditionCache = getDefaultCache();

/**
 * Parse a condition expression string into an AST
 * @param expression The condition expression to parse
 * @param cache Optional custom cache instance (uses default if not provided)
 * @throws {ParseError} If the expression is invalid
 */
export function parseCondition(expression: string, cache?: ConditionCache): ASTNode {
  const activeCache = cache || conditionCache;

  // Check cache
  const cached = activeCache.get(expression);
  if (cached) {
    return cached;
  }

  // Tokenize and parse
  const lexer = new Lexer(expression);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();

  // Cache result
  activeCache.set(expression, ast);

  return ast;
}

/**
 * Extended parse result with expression context
 */
export interface TryParseResult extends ParseResult {
  /** The original expression that was parsed */
  expression: string;
  /** Error pointer showing where the error occurred (if error) */
  errorPointer?: string;
}

/**
 * Try to parse a condition expression without throwing
 * Returns a result object with success/failure info and partial AST on error
 * @param expression The condition expression to parse
 * @param cache Optional custom cache instance (uses default if not provided)
 */
export function tryParseCondition(expression: string, cache?: ConditionCache): TryParseResult {
  const activeCache = cache || conditionCache;

  // Check cache
  const cached = activeCache.get(expression);
  if (cached) {
    return {
      ast: cached,
      success: true,
      expression,
    };
  }

  try {
    // Tokenize and parse
    const lexer = new Lexer(expression);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const result = parser.tryParse();

    if (result.success && result.ast) {
      // Cache successful result
      activeCache.set(expression, result.ast);
    }

    return {
      ...result,
      expression,
      errorPointer: result.error ? result.error.getErrorPointer(expression) : undefined,
    };
  } catch (error) {
    if (error instanceof ParseError) {
      return {
        ast: null,
        success: false,
        error,
        partialAST: error.getPartialAST(),
        expression,
        errorPointer: error.getErrorPointer(expression),
      };
    }
    throw error;
  }
}

/**
 * Clear the condition cache
 * @param cache Optional custom cache instance (uses default if not provided)
 */
export function clearConditionCache(cache?: ConditionCache): void {
  const activeCache = cache || conditionCache;
  activeCache.clear();
}

/**
 * Get cache statistics
 * @param cache Optional custom cache instance (uses default if not provided)
 * @returns Cache statistics including hits, misses, and hit rate
 */
export function getConditionCacheStats(cache?: ConditionCache): CacheStats {
  const activeCache = cache || conditionCache;
  return activeCache.getStats();
}

/**
 * Set the default condition cache instance
 * @param cache The cache instance to use as default
 */
export function setConditionCache(cache: ConditionCache): void {
  conditionCache = cache;
}

/**
 * Get the default condition cache instance
 * @returns The default ConditionCache instance
 */
export function getConditionCache(): ConditionCache {
  return conditionCache;
}

/**
 * Check if a rule value is a condition expression (string that looks like a condition)
 */
export function isConditionExpression(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  // Condition expressions start with '.', '..', an identifier followed by '.', or contain operators
  const trimmed = value.trim();
  if (
    trimmed.startsWith('.') ||
    /^[a-zA-Z_][a-zA-Z0-9_]*\./.test(trimmed) ||
    /\s+(==|!=|>|>=|<|<=|&&|\|\||in|not\s+in)\s+/.test(trimmed) ||
    /\?.*:/.test(trimmed)  // Ternary expressions
  ) {
    return true;
  }

  return false;
}
