/** CRUDUI validation, composition, expression and rule APIs. */
export { validate, Validator, default } from './validate/index';
export type { ValidateOptions } from './validate/index';
export * from './schema';
export * from './types';
export * from './compose/index';
export * from './validate-list/index';
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

