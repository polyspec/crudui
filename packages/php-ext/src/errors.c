#include "php_crudui.h"

static void initialize_error(zend_class_entry *ce, zend_object *object, zend_string *code, zend_string *message, zval *detail)
{
    zend_update_property_str(ce, object, ZEND_STRL("message"), message);
    zend_update_property_str(ce, object, ZEND_STRL("errorCode"), code);
    if (ce == crudui_form_error_ce) zend_update_property(ce, object, ZEND_STRL("path"), detail);
    else if (ce == crudui_compose_error_ce) zend_update_property(ce, object, ZEND_STRL("compositionTrace"), detail);
}

void crudui_input_failure(const char *message)
{
    zend_object *error = zend_throw_exception(crudui_input_error_ce, message, 0);
    zend_string *code = zend_string_init("INVALID_FORM_INPUT", sizeof("INVALID_FORM_INPUT") - 1, false);
    zend_string *text = zend_string_init(message, strlen(message), false);
    initialize_error(crudui_input_error_ce, error, code, text, NULL);
    zend_string_release(code);
    zend_string_release(text);
}

PHP_METHOD(CRUDUI_Validator_Validate_FormInputError, __construct)
{
    (void)return_value;
    zend_string *message;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_STR(message)
    ZEND_PARSE_PARAMETERS_END();
    zend_string *code = zend_string_init("INVALID_FORM_INPUT", sizeof("INVALID_FORM_INPUT") - 1, false);
    initialize_error(crudui_input_error_ce, Z_OBJ_P(ZEND_THIS), code, message, NULL);
    zend_string_release(code);
}

void crudui_invalid_value(const char *message, bool form_error)
{
    if (!form_error) { zend_throw_exception(spl_ce_InvalidArgumentException, message, 0); return; }
    zend_object *error = zend_throw_exception(crudui_form_error_ce, message, 0);
    zend_string *code = zend_string_init("INVALID_FORM_INPUT", sizeof("INVALID_FORM_INPUT") - 1, false);
    zend_string *text = zend_string_init(message, strlen(message), false);
    zval path; ZVAL_EMPTY_STRING(&path);
    initialize_error(crudui_form_error_ce, error, code, text, &path);
    zend_string_release(code);
    zend_string_release(text);
}

PHP_METHOD(CRUDUI_FormError, __construct)
{
    (void)return_value;
    zend_string *code, *message, *path = NULL;
    ZEND_PARSE_PARAMETERS_START(2, 3)
        Z_PARAM_STR(code)
        Z_PARAM_STR(message)
        Z_PARAM_OPTIONAL
        Z_PARAM_STR(path)
    ZEND_PARSE_PARAMETERS_END();
    zval detail;
    if (path) ZVAL_STR_COPY(&detail, path); else ZVAL_EMPTY_STRING(&detail);
    initialize_error(crudui_form_error_ce, Z_OBJ_P(ZEND_THIS), code, message, &detail);
    zval_ptr_dtor(&detail);
}

PHP_METHOD(CRUDUI_Validator_Compose_ComposeLoadError, __construct)
{
    (void)return_value;
    zend_string *code, *message;
    zval *trace = NULL, detail;
    ZEND_PARSE_PARAMETERS_START(2, 3)
        Z_PARAM_STR(code)
        Z_PARAM_STR(message)
        Z_PARAM_OPTIONAL
        Z_PARAM_ARRAY(trace)
    ZEND_PARSE_PARAMETERS_END();
    if (trace) ZVAL_COPY(&detail, trace); else array_init(&detail);
    initialize_error(crudui_compose_error_ce, Z_OBJ_P(ZEND_THIS), code, message, &detail);
    zval_ptr_dtor(&detail);
}

static void return_property(zend_class_entry *ce, zend_object *object, const char *name, size_t length, zval *return_value)
{
    zval temporary;
    zval *value = zend_read_property(ce, object, name, length, false, &temporary);
    if (!EG(exception)) ZVAL_COPY(return_value, value);
}

PHP_METHOD(CRUDUI_FormError, getErrorCode)
{
    ZEND_PARSE_PARAMETERS_NONE();
    return_property(crudui_form_error_ce, Z_OBJ_P(ZEND_THIS), ZEND_STRL("errorCode"), return_value);
}

PHP_METHOD(CRUDUI_FormError, getPath)
{
    ZEND_PARSE_PARAMETERS_NONE();
    return_property(crudui_form_error_ce, Z_OBJ_P(ZEND_THIS), ZEND_STRL("path"), return_value);
}

PHP_METHOD(CRUDUI_Validator_Validate_FormInputError, getErrorCode)
{
    ZEND_PARSE_PARAMETERS_NONE();
    return_property(crudui_input_error_ce, Z_OBJ_P(ZEND_THIS), ZEND_STRL("errorCode"), return_value);
}

PHP_METHOD(CRUDUI_Validator_Compose_ComposeLoadError, getErrorCode)
{
    ZEND_PARSE_PARAMETERS_NONE();
    return_property(crudui_compose_error_ce, Z_OBJ_P(ZEND_THIS), ZEND_STRL("errorCode"), return_value);
}

PHP_METHOD(CRUDUI_Validator_Compose_ComposeLoadError, getCompositionTrace)
{
    ZEND_PARSE_PARAMETERS_NONE();
    return_property(crudui_compose_error_ce, Z_OBJ_P(ZEND_THIS), ZEND_STRL("compositionTrace"), return_value);
}

PHP_METHOD(CRUDUI_Validator_Compose_ComposeLoadError, __get)
{
    zend_string *name;
    ZEND_PARSE_PARAMETERS_START(1, 1) Z_PARAM_STR(name) ZEND_PARSE_PARAMETERS_END();
    if (zend_string_equals_literal(name, "code")) {
        return_property(crudui_compose_error_ce, Z_OBJ_P(ZEND_THIS), ZEND_STRL("errorCode"), return_value);
    } else {
        zend_throw_exception_ex(spl_ce_OutOfRangeException, 0, "Undefined property: CRUDUI\\Validator\\Compose\\ComposeLoadError::$%s", ZSTR_VAL(name));
    }
}

PHP_METHOD(CRUDUI_Validator_Compose_ComposeLoadError, __isset)
{
    zend_string *name;
    ZEND_PARSE_PARAMETERS_START(1, 1) Z_PARAM_STR(name) ZEND_PARSE_PARAMETERS_END();
    RETURN_BOOL(zend_string_equals_literal(name, "code"));
}

void crudui_throw(ps_value *error)
{
    zval value;
    if (!crudui_to_php(error, &value)) { ps_value_free(error); return; }
    ps_value_free(error);
    HashTable *members = Z_OBJPROP(value);
    zval *kind = zend_hash_str_find(members, ZEND_STRL("kind"));
    zval *code = zend_hash_str_find(members, ZEND_STRL("code"));
    zval *message = zend_hash_str_find(members, ZEND_STRL("message"));
    bool composition = zend_string_equals_literal(Z_STR_P(kind), "compose");
    if (zend_string_equals_literal(Z_STR_P(kind), "internal")) {
        zend_throw_error(NULL, "%s", Z_STRVAL_P(message));
    } else if (zend_string_equals_literal(Z_STR_P(kind), "input")) {
        crudui_input_failure(Z_STRVAL_P(message));
    } else {
        zend_class_entry *ce = composition ? crudui_compose_error_ce : crudui_form_error_ce;
        zend_object *object = zend_throw_exception(ce, Z_STRVAL_P(message), 0);
        zval *detail = zend_hash_str_find(members, composition ? "trace" : "at", composition ? 5 : 2);
        initialize_error(ce, object, Z_STR_P(code), Z_STR_P(message), detail);
    }
    zval_ptr_dtor(&value);
}
