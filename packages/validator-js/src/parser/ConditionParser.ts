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

// ============================================================================
// Lexer
// ============================================================================

/**
 * Parse error with position information
 */
export class ParseError extends Error {
  constructor(
    message: string,
    public position: TokenPosition
  ) {
    super(`${message} at position ${position.start}`);
    this.name = 'ParseError';
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
      throw new ParseError('Unterminated string', this.makePosition(start));
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
 * Parser class for building AST from tokens
 */
export class Parser {
  private tokens: Token[];
  private current: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  /**
   * Parse tokens into AST
   */
  parse(): ASTNode {
    const expression = this.parseTernaryExpression();

    if (!this.isAtEnd()) {
      throw new ParseError(
        `Unexpected token: ${this.peek().value}`,
        this.peek().position
      );
    }

    return expression;
  }

  // ternary_expression = or_expression [ "?" ternary_expression ":" ternary_expression ]
  private parseTernaryExpression(): ASTNode {
    const condition = this.parseOrExpression();

    if (this.match(TokenType.QUESTION)) {
      const trueValue = this.parseTernaryExpression();

      if (!this.match(TokenType.COLON)) {
        throw new ParseError(
          'Expected ":" in ternary expression',
          this.peek().position
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
        throw new ParseError(
          'Expected closing bracket ]',
          this.peek().position
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
      `Expected value in list, got: ${token.value}`,
      token.position
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
        throw new ParseError(
          'Expected closing parenthesis',
          this.peek().position
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

    throw new ParseError(
      `Unexpected token: ${this.peek().value}`,
      this.peek().position
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
      throw new ParseError(
        'Expected identifier after dot prefix',
        this.peek().position
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
        throw new ParseError(
          'Expected identifier, number, or wildcard after dot',
          this.peek().position
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
 * Cache for parsed conditions
 */
const conditionCache = new Map<string, ASTNode>();

/**
 * Parse a condition expression string into an AST
 */
export function parseCondition(expression: string): ASTNode {
  // Check cache
  const cached = conditionCache.get(expression);
  if (cached) {
    return cached;
  }

  // Tokenize and parse
  const lexer = new Lexer(expression);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();

  // Cache result
  conditionCache.set(expression, ast);

  return ast;
}

/**
 * Clear the condition cache
 */
export function clearConditionCache(): void {
  conditionCache.clear();
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
