/**
 * Polyspec Validator
 *
 * A TypeScript/JavaScript validation library for polyspec YAML definitions.
 * Works in both browser and Node.js environments.
 *
 * @example
 * ```typescript
 * import { Validator } from '@polyspec/validator';
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
  // Validator options
  ValidatorOptions,
} from './types';

// Parser exports
export {
  Lexer,
  Parser,
  ParseError,
  parseCondition,
  clearConditionCache,
  getConditionCacheStats,
  setConditionCache,
  getConditionCache,
  isConditionExpression,
} from './parser/ConditionParser';

// Cache exports
export {
  ConditionCache,
  getDefaultCache,
  resetDefaultCache,
  type CacheStats,
} from './parser/ConditionCache';

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
  evaluateExpressionValue,
  parsePathString,
  pathToString,
  getParentPath,
  getFieldName,
  isChildPath,
  getRelativePath,
} from './parser/PathResolver';

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
} from './rules/index';

// v2 composition engine (SPEC-V2 §5) — public so the v2 generators can run the
// SAME compose pass (expand $ref/$patch into a single spec) the v2 validator
// runs. One engine, every consumer.
export {
  composeProperties,
  composeSpec,
  resolveRef,
  applyPatch,
  MemoryLoader,
  ComposeLoadError,
} from './v2/compose/index';
export type {
  ComposeOptions,
  Patch,
  FileLoader,
  LoadedDoc,
  ComposeErrorCode,
} from './v2/compose/index';

// Default export
export { validateV2, ValidatorV2 } from './v2/validate/index';
export type { ValidateV2Options } from './v2/validate/index';
export { Validator as default } from './Validator';
