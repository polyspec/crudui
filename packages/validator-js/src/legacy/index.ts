/**
 * Form-spec Validator
 *
 * A TypeScript/JavaScript validation library for form-spec YAML definitions.
 * Works in both browser and Node.js environments.
 *
 * @example
 * ```typescript
 * import { Validator } from '@legacy/form-validator/legacy';
 *
 * const spec = {
 *   type: 'group',
 *   properties: {
 *     email: {
 *       type: 'email',
 *       rules: { required: true, email: true },
 *       messages: { required: 'Email is required' }
 *     },
 *     password: {
 *       type: 'password',
 *       rules: { required: true, minlength: 8 }
 *     }
 *   }
 * };
 *
 * const validator = new Validator(spec);
 * const result = validator.validate({ email: '', password: '123' });
 *
 * if (!result.valid) {
 *   console.log(result.errors);
 * }
 * ```
 */

// Core Validator
export { Validator, createValidator } from './Validator';

// Types
export type {
  // Spec types
  Spec,
  FieldSpec,
  ActionSpec,
  ButtonSpec,
  ItemsSourceSpec,
  RulesSpec,
  MessagesSpec,
  // Validation types
  ValidationResult,
  ValidationError,
  ValidationContext,
  RuleFn,
  RuleDefinition,
  // Parser types
  TokenType,
  Token,
  TokenPosition,
  // AST types
  ASTNode,
  ASTNodeBase,
  BinaryNode,
  UnaryNode,
  InNode,
  PathNode,
  LiteralNode,
  GroupNode,
  PathSegment,
  // Context types
  PathContext,
  ConditionContext,
  WildcardStrategy,
  CachedCondition,
} from './types';

// Parser exports
export {
  Lexer,
  Parser,
  ParseError,
  parseCondition,
  clearConditionCache,
  isConditionExpression,
} from '../parser/ConditionParser';

// Path resolver exports
export {
  resolvePathSegments,
  getValueByPath,
  setValueByPath,
  extractCurrentIndex,
  resolveWildcardPath,
  hasWildcard,
  replaceWildcardWithIndex,
  evaluateCondition,
  parsePathString,
  pathToString,
  getParentPath,
  getFieldName,
  isChildPath,
  getRelativePath,
} from '../parser/PathResolver';

// Rule registry exports
export {
  getRule,
  registerRule,
  unregisterRule,
  hasRule,
  getRuleNames,
  clearCustomRules,
  // Individual rules
  requiredRule,
  emailRule,
  minlengthRule,
  maxlengthRule,
  minRule,
  maxRule,
  matchRule,
  uniqueRule,
  // Utility functions
  isEmpty,
  isValidEmail,
  getLength,
  toNumber,
  getPattern,
  areAllUnique,
} from '../rules/index';

// Default export
export { Validator as default } from './Validator';
