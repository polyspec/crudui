#include "php_crudui.h"
#include "zend_smart_str.h"
#include "ext/pcre/php_pcre.h"
#include <math.h>
#include <string.h>

static ps_value *convert(zval *input, bool object_root, unsigned depth, bool form_errors)
{
    ps_value *output = NULL;
    HashTable *members;
    bool object;
    zend_ulong index;
    zend_string *key;
    zval *child;

    if (depth > 512) {
        crudui_invalid_value("Recursive or excessively nested PHP value", form_errors);
        return NULL;
    }
    if (input == NULL) return ps_value_new(object_root ? 6 : 0);
    ZVAL_DEREF(input);
    if (Z_TYPE_P(input) == IS_INDIRECT) input = Z_INDIRECT_P(input);

    if (Z_TYPE_P(input) == IS_ARRAY || (Z_TYPE_P(input) == IS_OBJECT && instanceof_function(Z_OBJCE_P(input), zend_standard_class_def))) {
        members = Z_TYPE_P(input) == IS_ARRAY ? Z_ARRVAL_P(input) : Z_OBJPROP_P(input);
        object = Z_TYPE_P(input) == IS_OBJECT || !zend_array_is_list(members);
        if (object_root && !object && zend_hash_num_elements(members) != 0) {
            if (form_errors) crudui_invalid_value("Expected an object", true);
            else zend_type_error("Expected an object");
            return NULL;
        }
        object = object || object_root;
        output = ps_value_new(object ? 6 : 5);
        ZEND_HASH_FOREACH_KEY_VAL(members, index, key, child) {
            /* PHP foreach excludes inaccessible subclass properties. */
            if (key && ZSTR_LEN(key) && ZSTR_VAL(key)[0] == '\0') continue;
            if (Z_TYPE_P(child) == IS_UNDEF) continue;
            ps_value *value = convert(child, false, depth + 1, form_errors);
            if (!value) { ps_value_free(output); return NULL; }
            zend_string *numeric = NULL;
            if (object && !key) key = numeric = zend_long_to_str((zend_long) index);
            bool ok = ps_value_insert(output, object ? (const uint8_t *) ZSTR_VAL(key) : NULL,
                object ? ZSTR_LEN(key) : 0, value);
            if (numeric) zend_string_release(numeric);
            if (!ok) {
                ps_value_free(output);
                crudui_invalid_value("PHP object keys must contain valid UTF-8", form_errors);
                return NULL;
            }
        } ZEND_HASH_FOREACH_END();
        return output;
    }

    if (object_root) { zend_type_error("Expected an object"); return NULL; }
    output = ps_value_new(0);
    switch (Z_TYPE_P(input)) {
        case IS_NULL: return output;
        case IS_TRUE: case IS_FALSE: ps_value_bool(output, Z_TYPE_P(input) == IS_TRUE); return output;
        case IS_LONG: ps_value_int(output, Z_LVAL_P(input)); return output;
        case IS_DOUBLE:
            if (ps_value_float(output, Z_DVAL_P(input))) return output;
            break;
        case IS_STRING:
            if (ps_value_string(output, (const uint8_t *) Z_STRVAL_P(input), Z_STRLEN_P(input))) return output;
            ps_value_free(output);
            crudui_invalid_value("PHP strings must contain valid UTF-8", form_errors);
            return NULL;
        default: break;
    }
    ps_value_free(output);
    zend_string *message = strpprintf(0, "Unsupported PHP value: %s", zend_zval_type_name(input));
    crudui_invalid_value(ZSTR_VAL(message), form_errors);
    zend_string_release(message);
    return NULL;
}

ps_value *crudui_from_php(zval *input, bool object_root, bool form_errors)
{
    return convert(input, object_root, 0, form_errors);
}

static bool append_child(void *context, const uint8_t *key, size_t length, const ps_value *child)
{
    zval value;
    zval *output = context;
    if (!crudui_to_php(child, &value)) return false;
    if (!key) {
        zend_hash_next_index_insert(Z_ARRVAL_P(output), &value);
    } else {
        zend_string *name = zend_string_init((const char *) key, length, false);
        zend_hash_update(Z_OBJPROP_P(output), name, &value);
        zend_string_release(name);
    }
    return true;
}

bool crudui_to_php(const ps_value *input, zval *output)
{
    int64_t integer = 0;
    double number = 0;
    const uint8_t *text = NULL;
    size_t length = 0;
    uint8_t kind = ps_value_read(input, &integer, &number, &text, &length);
    switch (kind) {
        case 0: ZVAL_NULL(output); return true;
        case 1: ZVAL_BOOL(output, integer); return true;
        case 2: ZVAL_LONG(output, integer); return true;
        case 3: ZVAL_DOUBLE(output, number); return true;
        case 4: ZVAL_STRINGL(output, (const char *) text, length); return true;
        case 5: array_init(output); break;
        case 6: object_init(output); break;
        default: zend_throw_error(NULL, "Invalid native value type"); return false;
    }
    if (ps_value_visit(input, output, append_child)) return true;
    zval_ptr_dtor(output);
    ZVAL_UNDEF(output);
    return false;
}

void crudui_return(ps_result result, zval *return_value)
{
    /* An error PHP raised during the operation, such as a failed string conversion, is the result. */
    if (EG(exception)) { ps_value_free(result.value); ps_value_free(result.error); return; }
    if (result.error) { crudui_throw(result.error); return; }
    if (!result.value) { zend_throw_error(NULL, "Native operation returned no result"); return; }
    crudui_to_php(result.value, return_value);
    ps_value_free(result.value);
}

/* pcre_handle_exec_error of ext/pcre/php_pcre.c: the preg_last_error() code of one match error. */
static void pattern_match_error(int code)
{
    php_pcre_error_code error;
    switch (code) {
        case PCRE2_ERROR_MATCHLIMIT: error = PHP_PCRE_BACKTRACK_LIMIT_ERROR; break;
        case PCRE2_ERROR_RECURSIONLIMIT: error = PHP_PCRE_RECURSION_LIMIT_ERROR; break;
        case PCRE2_ERROR_BADUTFOFFSET: error = PHP_PCRE_BAD_UTF8_OFFSET_ERROR; break;
#ifdef HAVE_PCRE_JIT_SUPPORT
        case PCRE2_ERROR_JIT_STACKLIMIT: error = PHP_PCRE_JIT_STACKLIMIT_ERROR; break;
#endif
        default:
            error = code <= PCRE2_ERROR_UTF8_ERR1 && code >= PCRE2_ERROR_UTF8_ERR21
                ? PHP_PCRE_BAD_UTF8_ERROR : PHP_PCRE_INTERNAL_ERROR;
            break;
    }
    PCRE_G(error_code) = error;
}

/*
 * preg_match($pattern, $subject) with PHP's PCRE2 API, following php_do_pcre_match and
 * php_pcre_match_impl (PHP 8.4 and 8.5) for a call without subpatterns, flags or offset:
 * the compiled-pattern cache reports compilation failures with PHP's own warning, the match
 * uses PHP's match context and the explicit subject length, and preg_last_error() is set as
 * preg_match sets it. Returns 1 or 0, or -1 where preg_match returns false.
 */
static int preg_match_result(zend_string *pattern, zend_string *subject)
{
    pcre_cache_entry *entry = pcre_get_compiled_regex_cache(pattern);
    if (!entry) return -1;
    php_pcre_pce_incref(entry);
    pcre2_code *code = php_pcre_pce_re(entry);
    /* The cache entry keeps the options PHP passed to pcre2_compile (compile_options). */
    uint32_t compile_options = 0;
    bool utf = pcre2_pattern_info(code, PCRE2_INFO_ARGOPTIONS, &compile_options) == 0
        && (compile_options & PCRE2_UTF);
#ifdef HAVE_PCRE_JIT_SUPPORT
    /* PHP marks an entry PREG_JIT exactly when pcre2_jit_compile left a nonzero JIT size. */
    size_t jit_size = 0;
    bool jit = pcre2_pattern_info(code, PCRE2_INFO_JITSIZE, &jit_size) == 0 && jit_size > 0;
#endif
    const char *text = ZSTR_VAL(subject);
    size_t length = ZSTR_LEN(subject);

    PCRE_G(error_code) = PHP_PCRE_NO_ERROR;
    pcre2_match_data *data = php_pcre_create_match_data(0, code);
    if (!data) {
        PCRE_G(error_code) = PHP_PCRE_INTERNAL_ERROR;
        php_pcre_pce_decref(entry);
        return -1;
    }
    pcre2_match_context *context = php_pcre_mctx();
    /* is_known_valid_utf8() at offset 0. */
    bool known_valid = ZSTR_IS_VALID_UTF8(subject)
        && (length == 0 || (text[0] & 0xc0) != 0x80);
    uint32_t options = utf && !known_valid ? 0 : PCRE2_NO_UTF_CHECK;

    int count;
#ifdef HAVE_PCRE_JIT_SUPPORT
    if (jit && options)
        count = pcre2_jit_match(code, (PCRE2_SPTR) text, length, 0, PCRE2_NO_UTF_CHECK, data, context);
    else
#endif
    count = pcre2_match(code, (PCRE2_SPTR) text, length, 0, options, data, context);

    int matched = 0;
    if (count >= 0) {
        if (UNEXPECTED(count == 0)) php_error_docref(NULL, E_NOTICE, "Matched, but too many substrings");
        matched = 1;
        /* After an empty match PHP retries once at the same offset before it stops. */
        PCRE2_SIZE *offsets = pcre2_get_ovector_pointer(data);
        if (offsets[1] == offsets[0]) {
            count = pcre2_match(code, (PCRE2_SPTR) text, length, offsets[1],
                PCRE2_NO_UTF_CHECK | PCRE2_NOTEMPTY_ATSTART | PCRE2_ANCHORED, data, context);
            if (count < 0 && count != PCRE2_ERROR_NOMATCH) pattern_match_error(count);
        }
    } else if (count != PCRE2_ERROR_NOMATCH) {
        pattern_match_error(count);
    }
    php_pcre_free_match_data(data);

    int result = -1;
    if (PCRE_G(error_code) == PHP_PCRE_NO_ERROR) {
        /* A /u match without error records that the subject is valid UTF-8. */
        if (utf && !ZSTR_IS_INTERNED(subject)) GC_ADD_FLAGS(subject, IS_STR_VALID_UTF8);
        result = matched;
    }
    php_pcre_pce_decref(entry);
    return result;
}

/*
 * The pattern and match rule of the PHP library (CRUDUI\Validator\Rules\Pattern::validate):
 * a parameter that is not a non-empty string passes; the value is converted with (string); a
 * parameter without delimiters is anchored and wrapped as ~...~u; the rule passes when
 * preg_match returns 1, and any Throwable from preg_match fails the rule.
 */
int ps_pattern_rule(const ps_value *value, const ps_value *parameter)
{
    int64_t unused_integer = 0;
    double unused_number = 0;
    const uint8_t *bytes = NULL;
    size_t length = 0;
    if (ps_value_read(parameter, &unused_integer, &unused_number, &bytes, &length) != PS_STRING || !length)
        return 1;
    zval converted;
    if (!value) ZVAL_NULL(&converted);
    else if (!crudui_to_php(value, &converted)) return -1;
    /* $stringValue = (string) $value; a conversion error ends the validation as it does in PHP. */
    zend_string *subject = zval_try_get_string(&converted);
    zval_ptr_dtor(&converted);
    if (!subject) return -1;

    zend_string *declared = zend_string_init((const char *) bytes, length, false);
    bool delimited = false;
    if (memchr("/#~%@", bytes[0], 5)) {
        zend_string *shape = zend_string_init(ZEND_STRL("/^..*.[gimsuxy]*$/s"), false);
        int shaped = preg_match_result(shape, declared);
        zend_string_release(shape);
        if (EG(exception)) { zend_string_release(declared); zend_string_release(subject); return -1; }
        delimited = shaped == 1;
    }
    zend_string *pattern;
    if (delimited) pattern = zend_string_copy(declared);
    else {
        bool anchored_start = bytes[0] == '^';
        bool anchored_end = bytes[length - 1] == '$';
        smart_str built = {0};
        smart_str_appendc(&built, '~');
        if (!anchored_start) smart_str_appendc(&built, '^');
        smart_str_append(&built, declared);
        if (!anchored_end) smart_str_appendc(&built, '$');
        smart_str_appendl(&built, "~u", 2);
        pattern = smart_str_extract(&built);
    }
    zend_string_release(declared);
    int matched = preg_match_result(pattern, subject);
    zend_string_release(pattern);
    zend_string_release(subject);
    /* try { ... } catch (\Throwable) { return false; } */
    if (EG(exception)) { zend_clear_exception(); return 0; }
    return matched == 1 ? 1 : 0;
}
