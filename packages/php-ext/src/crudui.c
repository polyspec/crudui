#ifdef HAVE_CONFIG_H
#include "config.h"
#endif

#include "php_crudui.h"
#include "ext/standard/info.h"
#include "../crudui_arginfo.h"

zend_class_entry *crudui_generator_ce;
zend_class_entry *crudui_validator_ce;
zend_class_entry *crudui_form_ce;
zend_class_entry *crudui_form_error_ce;
zend_class_entry *crudui_compose_error_ce;
zend_class_entry *crudui_input_error_ce;
static zend_object_handlers form_handlers;

typedef struct {
    ps_form *form;
    zend_object object;
} form_object;

static form_object *form_from_object(zend_object *object)
{
    return (form_object *) ((char *) object - XtOffsetOf(form_object, object));
}

static ps_form *require_form(zend_object *object)
{
    ps_form *form = form_from_object(object)->form;
    if (!form) zend_throw_error(NULL, "CRUDUI\\Form is not initialized");
    return form;
}

static zend_object *create_form_object(zend_class_entry *ce)
{
    form_object *form = zend_object_alloc(sizeof(form_object), ce);
    form->form = NULL;
    zend_object_std_init(&form->object, ce);
    object_properties_init(&form->object, ce);
    form->object.handlers = &form_handlers;
    return &form->object;
}

static void free_form_object(zend_object *object)
{
    form_object *form = form_from_object(object);
    ps_form_free(form->form);
    zend_object_std_dtor(object);
}

static zend_object *clone_form_object(zend_object *object)
{
    zend_object *clone = create_form_object(object->ce);
    ps_form *form = require_form(object);
    if (form) form_from_object(clone)->form = ps_form_clone(form);
    zend_objects_clone_members(clone, object);
    return clone;
}

static void call_two(zval *first, zval *options, bool form_errors, ps_result (*operation)(const ps_value *, const ps_value *), zval *return_value)
{
    ps_value *input = crudui_from_php(first, true, form_errors);
    if (!input) return;
    ps_value *opts = crudui_from_php(options, true, form_errors);
    if (opts) { crudui_return(operation(input, opts), return_value); ps_value_free(opts); }
    ps_value_free(input);
}

static void call_three(zval *first, zval *second, bool second_is_object, zval *options, bool form_errors, ps_result (*operation)(const ps_value *, const ps_value *, const ps_value *), zval *return_value)
{
    ps_value *input = crudui_from_php(first, true, form_errors);
    if (!input) return;
    ps_value *data = crudui_from_php(second, second_is_object, form_errors);
    if (!data) { ps_value_free(input); return; }
    ps_value *opts = crudui_from_php(options, true, form_errors);
    if (opts) { crudui_return(operation(input, data, opts), return_value); ps_value_free(opts); }
    ps_value_free(data);
    ps_value_free(input);
}

PHP_METHOD(CRUDUI_Generator, compileForm)
{
    zval *spec, *options = NULL;
    ZEND_PARSE_PARAMETERS_START(1, 2)
        Z_PARAM_ARRAY_OR_OBJECT(spec)
        Z_PARAM_OPTIONAL
        Z_PARAM_ARRAY(options)
    ZEND_PARSE_PARAMETERS_END();
    call_two(spec, options, true, ps_compile_form, return_value);
}

PHP_METHOD(CRUDUI_Generator, bindForm)
{
    zval *template, *data = NULL, *options = NULL;
    ZEND_PARSE_PARAMETERS_START(1, 3)
        Z_PARAM_OBJECT_OF_CLASS(template, zend_standard_class_def)
        Z_PARAM_OPTIONAL
        Z_PARAM_ARRAY_OR_OBJECT(data)
        Z_PARAM_ARRAY(options)
    ZEND_PARSE_PARAMETERS_END();
    call_three(template, data, true, options, true, ps_bind_form, return_value);
}

PHP_METHOD(CRUDUI_Generator, renderList)
{
    zval *spec, *rows, *options = NULL;
    ZEND_PARSE_PARAMETERS_START(2, 3)
        Z_PARAM_ARRAY_OR_OBJECT(spec)
        Z_PARAM_ARRAY(rows)
        Z_PARAM_OPTIONAL
        Z_PARAM_ARRAY(options)
    ZEND_PARSE_PARAMETERS_END();
    call_three(spec, rows, false, options, true, ps_render_list, return_value);
}

PHP_METHOD(CRUDUI_Validator, validate)
{
    zval *spec, *data, *options = NULL;
    ZEND_PARSE_PARAMETERS_START(2, 3)
        Z_PARAM_ARRAY_OR_OBJECT(spec)
        Z_PARAM_ARRAY_OR_OBJECT(data)
        Z_PARAM_OPTIONAL
        Z_PARAM_ARRAY(options)
    ZEND_PARSE_PARAMETERS_END();
    /* Root data is a request precondition; an empty PHP array is an empty object. */
    if (Z_TYPE_P(data) == IS_ARRAY && zend_hash_num_elements(Z_ARRVAL_P(data)) != 0 &&
        zend_array_is_list(Z_ARRVAL_P(data))) {
        crudui_input_failure("Form data must be an object");
        return;
    }
    call_three(spec, data, true, options, false, ps_validate, return_value);
}

PHP_METHOD(CRUDUI_Validator, validateList)
{
    zval *spec, *options = NULL;
    ZEND_PARSE_PARAMETERS_START(1, 2)
        Z_PARAM_ARRAY_OR_OBJECT(spec)
        Z_PARAM_OPTIONAL
        Z_PARAM_ARRAY(options)
    ZEND_PARSE_PARAMETERS_END();
    call_two(spec, options, false, ps_validate_list, return_value);
}

PHP_METHOD(CRUDUI_Generator, sequenceRowKey)
{
    zend_string *string = NULL;
    zend_long integer;
    ZEND_PARSE_PARAMETERS_START(1, 1) Z_PARAM_STR_OR_LONG(string, integer) ZEND_PARSE_PARAMETERS_END();
    zval sequence;
    if (string) ZVAL_STR_COPY(&sequence, string); else ZVAL_LONG(&sequence, integer);
    ps_value *input = crudui_from_php(&sequence, false, true);
    zval_ptr_dtor(&sequence);
    if (input) { crudui_return(ps_sequence_key(input), return_value); ps_value_free(input); }
}

PHP_METHOD(CRUDUI_Generator, createRowKey)
{
    ZEND_PARSE_PARAMETERS_NONE();
    crudui_return(ps_create_key(), return_value);
}

PHP_METHOD(CRUDUI_Generator, renderForm)
{
    zend_object *object;
    ZEND_PARSE_PARAMETERS_START(1, 1) Z_PARAM_OBJ_OF_CLASS(object, crudui_form_ce) ZEND_PARSE_PARAMETERS_END();
    ps_form *form = require_form(object);
    if (form) crudui_return(ps_form_read(form, 4), return_value);
}

PHP_METHOD(CRUDUI_Form, __construct)
{
    (void)return_value;
    zval *template, *data = NULL, *options = NULL;
    ZEND_PARSE_PARAMETERS_START(1, 3)
        Z_PARAM_OBJECT_OF_CLASS(template, zend_standard_class_def)
        Z_PARAM_OPTIONAL
        Z_PARAM_ARRAY_OR_OBJECT(data)
        Z_PARAM_ARRAY(options)
    ZEND_PARSE_PARAMETERS_END();
    ps_value *compiled = crudui_from_php(template, true, true);
    if (!compiled) return;
    ps_value *values = crudui_from_php(data, true, true);
    if (!values) { ps_value_free(compiled); return; }
    ps_value *opts = crudui_from_php(options, true, true);
    if (opts) {
        ps_form_result result = ps_form_new(compiled, values, opts);
        if (result.error) crudui_throw(result.error);
        else {
            form_object *object = form_from_object(Z_OBJ_P(ZEND_THIS));
            ps_form_free(object->form);
            object->form = result.form;
        }
        ps_value_free(opts);
    }
    ps_value_free(values);
    ps_value_free(compiled);
}

#define FORM_READER(name, member) \
PHP_METHOD(CRUDUI_Form, name) { \
    ZEND_PARSE_PARAMETERS_NONE(); \
    ps_form *form = require_form(Z_OBJ_P(ZEND_THIS)); \
    if (form) crudui_return(ps_form_read(form, member), return_value); \
}
FORM_READER(getTemplate, 0)
FORM_READER(getData, 1)
FORM_READER(getFields, 2)
FORM_READER(getRevision, 3)

static void apply_form(zend_object *object, uint8_t method, size_t count, zval **values, const bool *objects, zval *return_value)
{
    ps_form *form = require_form(object);
    if (!form) return;
    ps_value *arguments = ps_value_new(5);
    for (size_t i = 0; i < count; ++i) {
        ps_value *value = crudui_from_php(values[i], objects[i], true);
        if (!value) { ps_value_free(arguments); return; }
        ps_value_insert(arguments, NULL, 0, value);
    }
    crudui_return(ps_form_apply(form, method, arguments), return_value);
    ps_value_free(arguments);
}

PHP_METHOD(CRUDUI_Form, getValue)
{
    zend_string *path;
    ZEND_PARSE_PARAMETERS_START(1, 1) Z_PARAM_STR(path) ZEND_PARSE_PARAMETERS_END();
    zval value; ZVAL_STR(&value, path);
    apply_form(Z_OBJ_P(ZEND_THIS), 0, 1, (zval *[]){&value}, (bool[]){false}, return_value);
}

PHP_METHOD(CRUDUI_Form, setData)
{
    zval *data;
    ZEND_PARSE_PARAMETERS_START(1, 1) Z_PARAM_ARRAY_OR_OBJECT(data) ZEND_PARSE_PARAMETERS_END();
    apply_form(Z_OBJ_P(ZEND_THIS), 1, 1, (zval *[]){data}, (bool[]){true}, return_value);
}

PHP_METHOD(CRUDUI_Form, setValue)
{
    zend_string *path;
    zval *data, value;
    ZEND_PARSE_PARAMETERS_START(2, 2) Z_PARAM_STR(path) Z_PARAM_ZVAL(data) ZEND_PARSE_PARAMETERS_END();
    ZVAL_STR(&value, path);
    apply_form(Z_OBJ_P(ZEND_THIS), 2, 2, (zval *[]){&value, data}, (bool[]){false, false}, return_value);
}

PHP_METHOD(CRUDUI_Form, addRow)
{
    zend_string *path;
    zval *options = NULL, value;
    ZEND_PARSE_PARAMETERS_START(1, 2) Z_PARAM_STR(path) Z_PARAM_OPTIONAL Z_PARAM_ARRAY(options) ZEND_PARSE_PARAMETERS_END();
    ZVAL_STR(&value, path);
    apply_form(Z_OBJ_P(ZEND_THIS), 3, 2, (zval *[]){&value, options}, (bool[]){false, true}, return_value);
}

PHP_METHOD(CRUDUI_Form, copyRow)
{
    zend_string *path, *key;
    zval *options = NULL, p, k;
    ZEND_PARSE_PARAMETERS_START(2, 3) Z_PARAM_STR(path) Z_PARAM_STR(key) Z_PARAM_OPTIONAL Z_PARAM_ARRAY(options) ZEND_PARSE_PARAMETERS_END();
    ZVAL_STR(&p, path); ZVAL_STR(&k, key);
    apply_form(Z_OBJ_P(ZEND_THIS), 4, 3, (zval *[]){&p, &k, options}, (bool[]){false, false, true}, return_value);
}

PHP_METHOD(CRUDUI_Form, removeRow)
{
    zend_string *path, *key;
    zval p, k;
    ZEND_PARSE_PARAMETERS_START(2, 2) Z_PARAM_STR(path) Z_PARAM_STR(key) ZEND_PARSE_PARAMETERS_END();
    ZVAL_STR(&p, path); ZVAL_STR(&k, key);
    apply_form(Z_OBJ_P(ZEND_THIS), 5, 2, (zval *[]){&p, &k}, (bool[]){false, false}, return_value);
}

PHP_METHOD(CRUDUI_Form, moveRow)
{
    zend_string *path, *key;
    zend_long index;
    zval p, k, i;
    ZEND_PARSE_PARAMETERS_START(3, 3) Z_PARAM_STR(path) Z_PARAM_STR(key) Z_PARAM_LONG(index) ZEND_PARSE_PARAMETERS_END();
    ZVAL_STR(&p, path); ZVAL_STR(&k, key); ZVAL_LONG(&i, index);
    apply_form(Z_OBJ_P(ZEND_THIS), 6, 3, (zval *[]){&p, &k, &i}, (bool[]){false, false, false}, return_value);
}

PHP_METHOD(CRUDUI_Form, rekeyRow)
{
    zend_string *path, *old_key, *new_key;
    zval p, o, n;
    ZEND_PARSE_PARAMETERS_START(3, 3) Z_PARAM_STR(path) Z_PARAM_STR(old_key) Z_PARAM_STR(new_key) ZEND_PARSE_PARAMETERS_END();
    ZVAL_STR(&p, path); ZVAL_STR(&o, old_key); ZVAL_STR(&n, new_key);
    apply_form(Z_OBJ_P(ZEND_THIS), 7, 3, (zval *[]){&p, &o, &n}, (bool[]){false, false, false}, return_value);
}

PHP_MINIT_FUNCTION(crudui)
{
    (void)type;
    (void)module_number;
    crudui_form_error_ce = register_class_CRUDUI_FormError(spl_ce_RuntimeException);
    crudui_compose_error_ce = register_class_CRUDUI_Validator_Compose_ComposeLoadError(spl_ce_RuntimeException);
    crudui_input_error_ce = register_class_CRUDUI_Validator_Validate_FormInputError(spl_ce_RuntimeException);
    crudui_generator_ce = register_class_CRUDUI_Generator();
    crudui_validator_ce = register_class_CRUDUI_Validator();
    crudui_form_ce = register_class_CRUDUI_Form();
    crudui_form_ce->create_object = create_form_object;
    crudui_form_ce->ce_flags |= ZEND_ACC_NOT_SERIALIZABLE;
    memcpy(&form_handlers, zend_get_std_object_handlers(), sizeof(form_handlers));
    form_handlers.offset = XtOffsetOf(form_object, object);
    form_handlers.free_obj = free_form_object;
    form_handlers.clone_obj = clone_form_object;
    return SUCCESS;
}

PHP_MINFO_FUNCTION(crudui)
{
    (void)zend_module;
    php_info_print_table_start();
    php_info_print_table_row(2, "CRUDUI", "enabled");
    php_info_print_table_row(2, "Version", "0.0.1");
    php_info_print_table_row(2, "Generation and validation", "native");
    php_info_print_table_end();
}

static const zend_module_dep crudui_deps[] = {
    ZEND_MOD_REQUIRED("SPL")
    ZEND_MOD_END
};

zend_module_entry crudui_module_entry = {
    STANDARD_MODULE_HEADER_EX, NULL, crudui_deps,
    "crudui", NULL, PHP_MINIT(crudui), NULL, NULL, NULL, PHP_MINFO(crudui), "0.0.1", STANDARD_MODULE_PROPERTIES
};

#ifdef COMPILE_DL_CRUDUI
#ifdef ZTS
ZEND_TSRMLS_CACHE_DEFINE()
#endif
ZEND_GET_MODULE(crudui)
#endif
