#ifndef PHP_CRUDUI_H
#define PHP_CRUDUI_H

#include "php.h"
#include "Zend/zend_exceptions.h"
#include "ext/spl/spl_exceptions.h"
#include "crudui_engine.h"

extern zend_class_entry *crudui_generator_ce;
extern zend_class_entry *crudui_validator_ce;
extern zend_class_entry *crudui_form_ce;
extern zend_class_entry *crudui_form_error_ce;
extern zend_class_entry *crudui_compose_error_ce;

ps_value *crudui_from_php(zval *input, bool object_root, bool form_errors);
void crudui_invalid_value(const char *message, bool form_error);
bool crudui_to_php(const ps_value *input, zval *output);
void crudui_return(ps_result result, zval *return_value);
void crudui_throw(ps_value *error);

#endif
