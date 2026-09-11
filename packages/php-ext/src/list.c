#include "engine_internal.h"

#include <ctype.h>
#include <float.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>

typedef struct {
    uint32_t limbs[64];
    size_t length;
} list_bigint;

typedef struct {
    const ps_value *spec;
    const ps_value *columns;
    const ps_value *rows;
    const ps_value *options;
    const char *language;
    const char *layout;
    const ps_value *data;
    ps_html_buffer output;
    char **preloads;
    size_t preload_count;
    size_t preload_capacity;
} list_context;

typedef struct {
    const char *key;
    const ps_value *column;
    const char *field;
    const char *type;
    const ps_value *format;
    ps_value *design;
    bool sortable;
} list_column;

static const ps_value *member(const ps_value *object, const char *key)
{
    return object && object->kind == PS_OBJECT ? ps_get(object, key) : NULL;
}

static const char *string_member(const ps_value *object, const char *key)
{
    const ps_value *value = member(object, key);
    return value && value->kind == PS_STRING ? ps_string(value) : "";
}

static bool bool_member(const ps_value *object, const char *key)
{
    const ps_value *value = member(object, key);
    return value && value->kind == PS_BOOL && value->data.boolean;
}

static char *copy_bytes(const char *value, size_t length)
{
    char *copy = calloc(length + 1, 1);
    if (!copy) return NULL;
    if (length) memcpy(copy, value, length);
    copy[length] = '\0';
    return copy;
}

static bool append_escaped_value(ps_html_buffer *out, const ps_value *value, bool raw)
{
    if (value && value->kind == PS_STRING)
        return ps_html_escaped(out, value->data.string.bytes, value->data.string.length, raw);
    char *scalar = ps_scalar_string(value);
    if (!scalar) return false;
    bool ok = ps_html_escaped(out, scalar, strlen(scalar), raw);
    free(scalar);
    return ok;
}

static bool write_element_start(ps_html_buffer *out, const char *tag, ps_value *attrs)
{
    bool ok = ps_html_start_element(out, tag, attrs, false, false);
    ps_value_free(attrs);
    return ok;
}

static bool write_element_end(ps_html_buffer *out, const char *tag)
{
    return ps_html_end_element(out, tag);
}

static const ps_value *format_options(const ps_value *column)
{
    const ps_value *format = member(column, "format");
    return format && format->kind == PS_OBJECT ? format : NULL;
}

static const char *format_type(const ps_value *column)
{
    const ps_value *format = member(column, "format");
    if (format && format->kind == PS_STRING && format->data.string.length) return ps_string(format);
    if (format && format->kind == PS_OBJECT) {
        const char *type = string_member(format, "type");
        if (*type) return type;
    }
    return "text";
}

static bool is_string(const ps_value *value, const char *text)
{
    return value && value->kind == PS_STRING && ps_is_string(value, text);
}

static bool list_truthy(const ps_value *value)
{
    if (is_string(value, "0") || is_string(value, "false")) return false;
    return ps_truthy(value);
}

static const ps_value *column_value(const ps_value *row, const char *field)
{
    if (!field || !*field) return NULL;
    return ps_path(row, field[0] == '.' ? field + 1 : field);
}

static bool visible_column(const ps_value *column, const ps_value *data, ps_value **design)
{
    *design = ps_design(member(column, "design"), data, "");
    return *design && bool_member(*design, "show");
}

static bool sortable_column(const ps_value *column, const ps_value *data)
{
    const ps_value *sortable = member(column, "sortable");
    if (!sortable || sortable->kind == PS_NULL) return false;
    if (sortable->kind == PS_STRING) {
        bool parsed = false;
        bool result = ps_expression_truth(ps_string(sortable), data, NULL, 0, &parsed);
        return parsed && result;
    }
    return ps_truthy(sortable);
}

static bool collect_columns(list_context *context, list_column **result, size_t *count)
{
    *result = NULL;
    *count = 0;
    for (size_t i = 0; i < ps_size(context->columns); ++i) {
        const ps_value *column = ps_at(context->columns, i);
        if (!column || column->kind != PS_OBJECT) continue;
        ps_value *design = NULL;
        if (!visible_column(column, context->data, &design)) {
            if (!design) goto fail;
            ps_value_free(design);
            continue;
        }
        list_column *resized = realloc(*result, (*count + 1) * sizeof(**result));
        if (!resized) { ps_value_free(design); goto fail; }
        *result = resized;
        const char *field = string_member(column, "field");
        (*result)[(*count)++] = (list_column){
            ps_key_at(context->columns, i), column, field, format_type(column),
            format_options(column), design, sortable_column(column, context->data)
        };
    }
    return true;
fail:
    for (size_t i = 0; i < *count; ++i) ps_value_free((*result)[i].design);
    free(*result);
    *result = NULL;
    *count = 0;
    return false;
}

static void free_columns(list_column *columns, size_t count)
{
    for (size_t i = 0; i < count; ++i) ps_value_free(columns[i].design);
    free(columns);
}

static char *translated(const ps_value *value, const char *language)
{
    return ps_translate(value, language);
}

static bool append_class_style(ps_value *attrs, const char *base, const ps_value *design)
{
    const ps_value *main = member(design, "main");
    char *class_name = ps_join_classes(base, string_member(main, "class"), "");
    bool ok = class_name && ps_html_attr_string(attrs, "class", class_name);
    const char *style = string_member(main, "style");
    if (ok && *style) ok = ps_html_attr_string(attrs, "style", style);
    free(class_name);
    return ok;
}

static bool append_interpolated(ps_html_buffer *out, const ps_value *template,
                                const ps_value *row, const ps_value *field)
{
    if (!template || template->kind != PS_STRING) return true;
    const char *value = template->data.string.bytes;
    size_t length = template->data.string.length;
    for (size_t i = 0; i < length;) {
        if (value[i] == '.' && i + 1 < length &&
            (isalpha((unsigned char)value[i + 1]) || value[i + 1] == '_')) {
            size_t end = i + 2;
            while (end < length && (isalnum((unsigned char)value[end]) ||
                   value[end] == '_' || value[end] == '.')) end++;
            char *path = copy_bytes(value + i + 1, end - i - 1);
            if (!path) return false;
            const ps_value *replacement = !strcmp(path, "field") ? field : ps_path(row, path);
            if (!replacement) replacement = field;
            free(path);
            char *scalar = ps_scalar_string(replacement);
            if (!scalar || !ps_html_text(out, scalar)) { free(scalar); return false; }
            free(scalar);
            i = end;
        } else {
            if (!ps_html_character(out, value[i++])) return false;
        }
    }
    return true;
}

static bool interpolated_value(const ps_value *template, const ps_value *row,
                               const ps_value *field, ps_value **result)
{
    ps_html_buffer out = {0};
    if (!append_interpolated(&out, template, row, field)) { free(out.data); return false; }
    *result = ps_html_value(&out);
    return *result != NULL;
}

static bool utf8_space(const unsigned char *value, size_t length, size_t *width)
{
    if (!length) return false;
    if (value[0] >= 0x09 && value[0] <= 0x0d) { *width = 1; return true; }
    if (value[0] == 0x20) { *width = 1; return true; }
    static const unsigned char two[][2] = {{0xc2,0xa0},{0xe1,0x9a}};
    if (length >= 2 && value[0] == two[0][0] && value[1] == two[0][1]) { *width = 2; return true; }
    if (length >= 3) {
        unsigned code = ((value[0] & 0x0f) << 12) | ((value[1] & 0x3f) << 6) | (value[2] & 0x3f);
        if (code == 0x1680 || (code >= 0x2000 && code <= 0x200a) ||
            code == 0x2028 || code == 0x2029 || code == 0x202f || code == 0x205f ||
            code == 0x3000 || code == 0xfeff) { *width = 3; return true; }
    }
    return false;
}

static bool numeric_text(const ps_value *value, char **result)
{
    if (!value) { *result = copy_bytes("", 0); return *result != NULL; }
    if (value->kind == PS_STRING) {
        size_t start = 0, end = value->data.string.length, width;
        const unsigned char *bytes = (const unsigned char *)value->data.string.bytes;
        while (start < end && utf8_space(bytes + start, end - start, &width)) start += width;
        while (end > start) {
            size_t candidate = end - 1;
            while (candidate > start && (bytes[candidate] & 0xc0) == 0x80) candidate--;
            if (!utf8_space(bytes + candidate, end - candidate, &width) || candidate + width != end) break;
            end = candidate;
        }
        *result = copy_bytes(value->data.string.bytes + start, end - start);
        return *result != NULL;
    }
    *result = ps_scalar_string(value);
    return *result != NULL;
}

static void normalize_exponent(char *value)
{
    char *exponent = strchr(value, 'e');
    if (!exponent) exponent = strchr(value, 'E');
    if (!exponent) return;
    *exponent = 'e';
    char *digits = exponent + 1;
    if (*digits == '+' || *digits == '-') digits++;
    while (digits[0] == '0' && isdigit((unsigned char)digits[1]))
        memmove(digits, digits + 1, strlen(digits));
}

static char *shortest_number(double number)
{
    char candidate[128] = {0};
    for (int precision = 1; precision <= DBL_DECIMAL_DIG; ++precision) {
        snprintf(candidate, sizeof(candidate), "%.*g", precision, number);
        char *end = NULL;
        if (strtod(candidate, &end) == number && end && !*end) break;
    }
    normalize_exponent(candidate);
    return copy_bytes(candidate, strlen(candidate));
}

static void bigint_normalize(list_bigint *value)
{
    while (value->length && !value->limbs[value->length - 1]) value->length--;
}

static void bigint_from_u64(list_bigint *value, uint64_t input)
{
    memset(value, 0, sizeof(*value));
    if (!input) return;
    value->limbs[0] = (uint32_t)input;
    value->limbs[1] = (uint32_t)(input >> 32);
    value->length = value->limbs[1] ? 2 : 1;
}

static bool bigint_multiply(list_bigint *value, uint32_t factor)
{
    uint64_t carry = 0;
    for (size_t i = 0; i < value->length; ++i) {
        uint64_t product = (uint64_t)value->limbs[i] * factor + carry;
        value->limbs[i] = (uint32_t)product;
        carry = product >> 32;
    }
    if (carry) {
        if (value->length == sizeof(value->limbs) / sizeof(value->limbs[0])) return false;
        value->limbs[value->length++] = (uint32_t)carry;
    }
    return true;
}

static bool bigint_add(list_bigint *value, uint32_t addend)
{
    if (!value->length) {
        if (!addend) return true;
        value->limbs[0] = addend;
        value->length = 1;
        return true;
    }
    uint64_t sum = (uint64_t)value->limbs[0] + addend;
    value->limbs[0] = (uint32_t)sum;
    uint32_t carry = (uint32_t)(sum >> 32);
    size_t i = 1;
    while (carry && i < value->length) {
        carry = ++value->limbs[i] == 0;
        i++;
    }
    if (!carry) return true;
    if (value->length == sizeof(value->limbs) / sizeof(value->limbs[0])) return false;
    value->limbs[value->length++] = 1;
    return true;
}

static bool bigint_shift_left(list_bigint *value, unsigned bits)
{
    if (!value->length || !bits) return true;
    size_t words = bits / 32;
    unsigned remainder = bits % 32;
    size_t extra = words + (remainder ? 1 : 0);
    if (value->length + extra > sizeof(value->limbs) / sizeof(value->limbs[0])) return false;
    if (words) {
        memmove(value->limbs + words, value->limbs, value->length * sizeof(value->limbs[0]));
        memset(value->limbs, 0, words * sizeof(value->limbs[0]));
        value->length += words;
    }
    if (remainder) {
        uint32_t carry = 0;
        for (size_t i = words; i < value->length; ++i) {
            uint32_t next = value->limbs[i] >> (32 - remainder);
            value->limbs[i] = (value->limbs[i] << remainder) | carry;
            carry = next;
        }
        if (carry) value->limbs[value->length++] = carry;
    }
    return true;
}

static bool bigint_bit(const list_bigint *value, unsigned bit)
{
    size_t word = bit / 32;
    return word < value->length && (value->limbs[word] & (UINT32_C(1) << (bit % 32)));
}

static unsigned bigint_bit_length(const list_bigint *value)
{
    if (!value->length) return 0;
    uint32_t high = value->limbs[value->length - 1];
    unsigned bits = (unsigned)((value->length - 1) * 32);
    while (high) { bits++; high >>= 1; }
    return bits;
}

static bool bigint_any_lower_bits(const list_bigint *value, unsigned count)
{
    size_t words = count / 32;
    unsigned remainder = count % 32;
    for (size_t i = 0; i < words && i < value->length; ++i)
        if (value->limbs[i]) return true;
    if (remainder && words < value->length &&
        (value->limbs[words] & ((UINT32_C(1) << remainder) - 1))) return true;
    return false;
}

static void bigint_shift_right(list_bigint *value, unsigned bits)
{
    size_t words = bits / 32;
    unsigned remainder = bits % 32;
    if (words >= value->length) { value->length = 0; return; }
    if (words) {
        memmove(value->limbs, value->limbs + words,
                (value->length - words) * sizeof(value->limbs[0]));
        value->length -= words;
    }
    if (remainder) {
        uint32_t carry = 0;
        for (size_t i = value->length; i-- > 0;) {
            uint32_t next = value->limbs[i] << (32 - remainder);
            value->limbs[i] = (value->limbs[i] >> remainder) | carry;
            carry = next;
        }
    }
    bigint_normalize(value);
}

static bool bigint_increment(list_bigint *value)
{
    size_t i = 0;
    while (i < value->length && ++value->limbs[i] == 0) i++;
    if (i < value->length) return true;
    if (!value->length) { value->limbs[0] = 1; value->length = 1; return true; }
    if (value->length == sizeof(value->limbs) / sizeof(value->limbs[0])) return false;
    value->limbs[value->length++] = 1;
    return true;
}

static uint32_t bigint_divide(list_bigint *value, uint32_t divisor)
{
    uint64_t remainder = 0;
    for (size_t i = value->length; i-- > 0;) {
        uint64_t current = (remainder << 32) | value->limbs[i];
        value->limbs[i] = (uint32_t)(current / divisor);
        remainder = current % divisor;
    }
    bigint_normalize(value);
    return (uint32_t)remainder;
}

static char *bigint_decimal(const list_bigint *value)
{
    if (!value->length) return copy_bytes("0", 1);
    list_bigint work = *value;
    uint32_t chunks[64];
    size_t count = 0;
    while (work.length) chunks[count++] = bigint_divide(&work, UINT32_C(1000000000));
    size_t capacity = count * 9 + 1;
    char *result = malloc(capacity);
    if (!result) return NULL;
    size_t length = (size_t)snprintf(result, capacity, "%u", chunks[count - 1]);
    while (--count) length += (size_t)snprintf(result + length, capacity - length,
                                                "%09u", chunks[count - 1]);
    return result;
}

static bool parse_radix_number(const char *source, unsigned radix, double *number)
{
    list_bigint integer;
    bigint_from_u64(&integer, 0);
    for (size_t i = 2; source[i]; ++i) {
        unsigned digit = source[i] >= '0' && source[i] <= '9'
            ? (unsigned)(source[i] - '0')
            : source[i] >= 'a' && source[i] <= 'f' ? (unsigned)(source[i] - 'a' + 10)
            : source[i] >= 'A' && source[i] <= 'F' ? (unsigned)(source[i] - 'A' + 10)
            : radix;
        if (digit >= radix || !bigint_multiply(&integer, radix) ||
            !bigint_add(&integer, digit)) return false;
    }
    unsigned bits = bigint_bit_length(&integer);
    if (!bits) { *number = 0; return true; }
    if (bits > 1024) { *number = INFINITY; return false; }
    unsigned shift = bits > 53 ? bits - 53 : 0;
    bool half = shift && bigint_bit(&integer, shift - 1);
    bool lower = shift > 1 && bigint_any_lower_bits(&integer, shift - 1);
    bigint_shift_right(&integer, shift);
    bool odd = bigint_bit(&integer, 0);
    if (half && (lower || odd) && !bigint_increment(&integer)) return false;
    if (bigint_bit_length(&integer) > 53) { bigint_shift_right(&integer, 1); shift++; }
    uint64_t significand = integer.length ? integer.limbs[0] : 0;
    if (integer.length > 1)
        significand |= (uint64_t)integer.limbs[1] * UINT64_C(0x100000000);
    *number = ldexp((double)significand, (int)shift);
    return isfinite(*number);
}

static bool parse_number(const ps_value *value, double *number)
{
    if (value && value->kind == PS_INT) { *number = (double)value->data.integer; return true; }
    if (value && value->kind == PS_FLOAT) { *number = value->data.number; return true; }
    char *source = NULL;
    if (!numeric_text(value, &source)) return false;
    if (!*source) { free(source); *number = 0; return true; }
    bool radix_number = source[0] == '0' && (source[1] == 'x' || source[1] == 'X' ||
        source[1] == 'o' || source[1] == 'O' || source[1] == 'b' || source[1] == 'B');
    if (radix_number) {
        unsigned radix = source[1] == 'x' || source[1] == 'X' ? 16
            : source[1] == 'o' || source[1] == 'O' ? 8 : 2;
        bool ok = source[2] && parse_radix_number(source, radix, number);
        free(source);
        return ok;
    }
    char *end = NULL;
    *number = strtod(source, &end);
    bool ok = end && *end == '\0' && isfinite(*number);
    free(source);
    return ok;
}

static char *fixed_number(double number, int decimals)
{
    if (fabs(number) >= 1e21) return shortest_number(number);
    bool negative = number < 0;
    double absolute = fabs(number);
    uint64_t bits;
    memcpy(&bits, &absolute, sizeof(bits));
    unsigned encoded_exponent = (unsigned)((bits >> 52) & UINT64_C(0x7ff));
    uint64_t significand = bits & UINT64_C(0x000fffffffffffff);
    int exponent;
    if (encoded_exponent) {
        significand |= UINT64_C(0x0010000000000000);
        exponent = (int)encoded_exponent - 1023 - 52;
    } else exponent = -1074;
    list_bigint integer;
    bigint_from_u64(&integer, significand);
    for (int i = 0; i < decimals; ++i)
        if (!bigint_multiply(&integer, 5)) return NULL;
    int binary_shift = exponent + decimals;
    if (binary_shift >= 0) {
        if (!bigint_shift_left(&integer, (unsigned)binary_shift)) return NULL;
    } else {
        unsigned shift = (unsigned)-binary_shift;
        bool round_up = shift && bigint_bit(&integer, shift - 1);
        bigint_shift_right(&integer, shift);
        if (round_up && !bigint_increment(&integer)) return NULL;
    }
    char *digits = bigint_decimal(&integer);
    if (!digits) return NULL;
    size_t length = strlen(digits);
    size_t integer_length = length > (size_t)decimals ? length - (size_t)decimals : 1;
    size_t zeros = length < (size_t)decimals ? (size_t)decimals - length : 0;
    size_t total = (negative ? 1 : 0) + integer_length +
        (decimals ? 1 + (size_t)decimals : 0);
    char *result = malloc(total + 1);
    if (!result) { free(digits); return NULL; }
    char *cursor = result;
    if (negative) *cursor++ = '-';
    if (!decimals) { memcpy(cursor, digits, length); cursor += length; }
    else if (length <= (size_t)decimals) {
        *cursor++ = '0'; *cursor++ = '.';
        memset(cursor, '0', zeros); cursor += zeros;
        memcpy(cursor, digits, length); cursor += length;
    } else {
        memcpy(cursor, digits, integer_length); cursor += integer_length;
        *cursor++ = '.';
        memcpy(cursor, digits + integer_length, (size_t)decimals); cursor += decimals;
    }
    *cursor = '\0';
    free(digits);
    return result;
}

static bool append_grouped(ps_html_buffer *out, const char *number)
{
    const char *dot = strchr(number, '.');
    const char *end = dot ? dot : number + strlen(number);
    const char *start = *number == '-' ? number + 1 : number;
    if (start != number && !ps_html_character(out, '-')) return false;
    for (const char *cursor = start; cursor < end; ++cursor) {
        if (cursor > start && (size_t)(end - cursor) % 3 == 0 &&
            !ps_html_character(out, ',')) return false;
        if (!ps_html_character(out, *cursor)) return false;
    }
    return !dot || ps_html_text(out, dot);
}

static bool append_number(ps_html_buffer *out, const ps_value *value,
                          const ps_value *options, const char *language)
{
    double number;
    if (!parse_number(value, &number)) return append_escaped_value(out, value, false);
    char *body = NULL;
    const ps_value *decimals = member(options, "decimals");
    if (decimals && (decimals->kind == PS_INT || decimals->kind == PS_FLOAT)) {
        double raw = decimals->kind == PS_INT ? (double)decimals->data.integer : decimals->data.number;
        double truncated = trunc(raw);
        if (truncated < 0 || truncated > 100) return false;
        body = fixed_number(number, (int)truncated);
    } else body = shortest_number(number);
    char *prefix = translated(member(options, "prefix"), language);
    char *suffix = translated(member(options, "suffix"), language);
    bool ok = body && prefix && suffix && ps_html_escaped(out, prefix, strlen(prefix), false);
    if (ok) ok = list_truthy(member(options, "thousands"))
        ? append_grouped(out, body) : ps_html_text(out, body);
    if (ok) ok = ps_html_escaped(out, suffix, strlen(suffix), false);
    free(body); free(prefix); free(suffix);
    return ok;
}

static bool append_truncated(ps_html_buffer *out, const ps_value *value,
                             const ps_value *options)
{
    char *text = ps_scalar_string(value);
    if (!text) return false;
    const ps_value *limit_value = member(options, "truncate");
    double limit = 0;
    bool limited = limit_value && parse_number(limit_value, &limit) && isfinite(limit) && limit > 0;
    size_t length = strlen(text), bytes = length;
    if (limited) {
        size_t units = 0, cursor = 0;
        while (cursor < length && units < (size_t)limit) {
            unsigned char c = (unsigned char)text[cursor];
            size_t width = c < 0x80 ? 1 : (c & 0xe0) == 0xc0 ? 2 : (c & 0xf0) == 0xe0 ? 3 : 4;
            unsigned code = c < 0x80 ? c : c & (width == 2 ? 0x1f : width == 3 ? 0x0f : 0x07);
            for (size_t i = 1; i < width; ++i) code = (code << 6) | ((unsigned char)text[cursor + i] & 0x3f);
            size_t code_units = code > 0xffff ? 2 : 1;
            if (units + code_units > (size_t)limit) break;
            cursor += width;
            units += code_units;
        }
        size_t total_units = 0;
        for (size_t cursor = 0; cursor < length;) {
            unsigned char c = (unsigned char)text[cursor];
            size_t width = c < 0x80 ? 1 : (c & 0xe0) == 0xc0 ? 2 : (c & 0xf0) == 0xe0 ? 3 : 4;
            total_units += width == 4 ? 2 : 1;
            cursor += width;
        }
        if (total_units > limit) bytes = cursor;
    }
    bool ok = ps_html_escaped(out, text, bytes, false);
    if (ok && bytes < length) ok = ps_html_text(out, "…");
    free(text);
    return ok;
}

static bool add_preload(list_context *context, const ps_value *source)
{
    if (!source || source->kind != PS_STRING || !source->data.string.length) return true;
    if (source->data.string.length >= 5 &&
        !strncasecmp(source->data.string.bytes, "data:", 5)) return true;
    for (size_t i = 0; i < context->preload_count; ++i)
        if (strlen(context->preloads[i]) == source->data.string.length &&
            !memcmp(context->preloads[i], source->data.string.bytes, source->data.string.length))
            return true;
    if (context->preload_count == context->preload_capacity) {
        size_t capacity = context->preload_capacity ? context->preload_capacity * 2 : 4;
        char **items = realloc(context->preloads, capacity * sizeof(*items));
        if (!items) return false;
        context->preloads = items;
        context->preload_capacity = capacity;
    }
    char *copy = copy_bytes(source->data.string.bytes, source->data.string.length);
    if (!copy) return false;
    context->preloads[context->preload_count++] = copy;
    return true;
}

static bool append_cell_body(list_context *context, const list_column *column,
                             const ps_value *row, const ps_value *value)
{
    ps_html_buffer *out = &context->output;
    const ps_value *options = column->format;
    const char *type = column->type;
    if (!strcmp(type, "date")) {
        char *scalar = ps_scalar_string(value);
        const char *pattern = string_member(options, "pattern");
        if (!*pattern) pattern = "YYYY-MM-DD";
        char *formatted = scalar ? ps_format_date_pattern(scalar, pattern) : NULL;
        bool ok = formatted && ps_html_escaped(out, formatted, strlen(formatted), false);
        free(scalar); free(formatted);
        return ok;
    }
    if (!strcmp(type, "number"))
        return append_number(out, value, options, context->language);
    if (!strcmp(type, "badge")) {
        char *key = ps_scalar_string(value);
        const ps_value *mapped = key ? member(member(options, "map"), key) : NULL;
        char *variant = mapped && (mapped->kind == PS_OBJECT || mapped->kind == PS_ARRAY)
            ? translated(mapped, context->language) : ps_scalar_string(mapped);
        char *label = mapped && (mapped->kind == PS_OBJECT || mapped->kind == PS_ARRAY)
            ? translated(mapped, context->language) : copy_bytes(key ? key : "", strlen(key ? key : ""));
        char *class_name = ps_join_classes("badge", variant && *variant ? "badge-" : "", "");
        if (variant && *variant) { free(class_name); class_name = ps_string_join("badge badge-", variant, ""); }
        ps_value *attrs = ps_object_value();
        bool ok = key && variant && label && class_name && attrs &&
            ps_html_attr_string(attrs, "class", class_name) &&
            write_element_start(out, "span", attrs) &&
            ps_html_escaped(out, label, strlen(label), false) && write_element_end(out, "span");
        if (!ok) ps_value_free(attrs);
        free(key); free(variant); free(label); free(class_name);
        return ok;
    }
    if (!strcmp(type, "link")) {
        const ps_value *href_template = member(options, "href");
        ps_value *selected = NULL, *href = NULL;
        if (href_template && href_template->kind == PS_OBJECT)
            selected = ps_condition_value(href_template, row, NULL, 0);
        else selected = href_template ? ps_value_clone(href_template) : ps_string_value("");
        bool ok = selected && interpolated_value(selected, row, value, &href);
        ps_value_free(selected);
        const ps_value *caption_source = member(options, "text");
        char *caption = caption_source && caption_source->kind != PS_NULL && ps_truthy(caption_source)
            ? translated(caption_source, context->language) : ps_scalar_string(value);
        ps_value *attrs = ps_object_value();
        if (ok) ok = attrs && ps_html_attr_clone(attrs, "href", href);
        const char *target = string_member(options, "target");
        if (ok && *target) ok = ps_html_attr_string(attrs, "target", target);
        if (ok) ok = write_element_start(out, "a", attrs) && caption &&
            ps_html_escaped(out, caption, strlen(caption), false) && write_element_end(out, "a");
        else ps_value_free(attrs);
        ps_value_free(href); free(caption);
        return ok;
    }
    if (!strcmp(type, "choice-label")) {
        char *key = ps_scalar_string(value);
        const ps_value *items = member(options, "items");
        const ps_value *label = NULL;
        if (items && items->kind == PS_ARRAY && key) {
            char *end = NULL; unsigned long index = strtoul(key, &end, 10);
            if (end && !*end) label = ps_at(items, (size_t)index);
        } else if (items && items->kind == PS_OBJECT && !ps_has(items, "model") && key)
            label = ps_get(items, key);
        char *display = label && label->kind == PS_OBJECT ? translated(label, context->language)
            : label ? ps_scalar_string(label) : copy_bytes(key ? key : "", strlen(key ? key : ""));
        bool ok = display && ps_html_escaped(out, display, strlen(display), false);
        free(key); free(display);
        return ok;
    }
    if (!strcmp(type, "bool")) {
        bool truth = list_truthy(value);
        const ps_value *source = member(options, truth ? "true" : "false");
        char *label = source && source->kind != PS_NULL ? translated(source, context->language)
            : copy_bytes(truth ? "true" : "false", truth ? 4 : 5);
        const char *as = string_member(options, "as");
        if (!*as) as = "text";
        ps_value *attrs = ps_object_value();
        bool ok = label && attrs;
        if (ok && !strcmp(as, "check")) {
            ok = ps_html_attr_string(attrs, "class", "bool-check") &&
                ps_html_attr_string(attrs, "aria-label", label) &&
                write_element_start(out, "span", attrs) &&
                ps_html_text(out, truth ? "✔" : "✘") && write_element_end(out, "span");
        } else if (ok && !strcmp(as, "icon")) {
            ok = ps_html_attr_string(attrs, "class", truth ? "bool-icon bool-true" : "bool-icon bool-false") &&
                ps_html_attr_string(attrs, "aria-label", label) &&
                write_element_start(out, "span", attrs) && write_element_end(out, "span");
        } else if (ok) {
            ok = ps_html_attr_string(attrs, "class", "bool-text") &&
                write_element_start(out, "span", attrs) &&
                ps_html_escaped(out, label, strlen(label), false) && write_element_end(out, "span");
        }
        if (!ok) ps_value_free(attrs);
        free(label);
        return ok;
    }
    if (!strcmp(type, "image")) {
        ps_value *attrs = ps_object_value();
        ps_value *alt = NULL;
        const ps_value *alt_template = member(options, "alt");
        char *translated_alt = alt_template ? translated(alt_template, context->language) : copy_bytes("", 0);
        ps_value *translated_value = translated_alt ? ps_string_value(translated_alt) : NULL;
        bool ok = translated_value && interpolated_value(translated_value, row, value, &alt);
        ps_value_free(translated_value); free(translated_alt);
        if (ok) ok = attrs && ps_html_attr_clone(attrs, "src", value ? value : ps_string_value(""));
        if (ok) ok = ps_html_attr_clone(attrs, "alt", alt);
        for (size_t i = 0; ok && i < 2; ++i) {
            const char *name = i ? "height" : "width";
            const ps_value *dimension = member(options, name);
            if (dimension) ok = ps_html_attr_clone(attrs, name, dimension);
        }
        if (ok) ok = write_element_start(out, "img", attrs) && add_preload(context, value);
        else ps_value_free(attrs);
        ps_value_free(alt);
        return ok;
    }
    if (!strcmp(type, "html")) {
        if (!value || value->kind != PS_STRING) return true;
        return ps_html_bytes(out, value->data.string.bytes, value->data.string.length);
    }
    return append_truncated(out, value, options);
}

static bool append_cell(list_context *context, const list_column *column,
                        const ps_value *row, const char *tag, const char *base)
{
    const ps_value *value = column_value(row, column->field);
    ps_value *design = ps_design(member(column->column, "design"), row,
                                 column->field[0] == '.' ? column->field + 1 : column->field);
    ps_value *attrs = ps_object_value();
    bool ok = design && attrs && append_class_style(attrs, base, design) &&
        write_element_start(&context->output, tag, attrs) &&
        append_cell_body(context, column, row, value) && write_element_end(&context->output, tag);
    if (!ok) ps_value_free(attrs);
    ps_value_free(design);
    return ok;
}

static char *column_label(const list_column *column, const char *language)
{
    const ps_value *label = member(column->column, "label");
    return label ? translated(label, language) : copy_bytes(column->key, strlen(column->key));
}

static bool append_toolbar(list_context *context)
{
    const ps_value *actions = member(context->spec, "actions");
    if (!actions || actions->kind != PS_OBJECT) return true;
    size_t count = 0;
    for (size_t i = 0; i < ps_size(actions); ++i) {
        const char *key = ps_key_at(actions, i);
        if (strcmp(key, "$ref") && strcmp(key, "$patch")) count++;
    }
    if (!count) return true;
    ps_value *toolbar = ps_object_value();
    if (!toolbar || !ps_html_attr_string(toolbar, "class", "list-actions") ||
        !write_element_start(&context->output, "div", toolbar)) { ps_value_free(toolbar); return false; }
    for (size_t i = 0; i < ps_size(actions); ++i) {
        const char *key = ps_key_at(actions, i);
        const ps_value *action = ps_at(actions, i);
        if (!strcmp(key, "$ref") || !strcmp(key, "$patch") ||
            (!action || (action->kind != PS_STRING && action->kind != PS_OBJECT))) continue;
        char *label = action->kind == PS_OBJECT && member(action, "label")
            ? translated(member(action, "label"), context->language) : copy_bytes(key, strlen(key));
        const ps_value *format = action->kind == PS_OBJECT ? member(action, "format") : NULL;
        const char *type = format && format->kind == PS_OBJECT ? string_member(format, "type") : "";
        bool link = !strcmp(type, "link");
        ps_value *span = ps_object_value();
        ps_value *attrs = ps_object_value();
        bool ok = label && span && attrs && ps_html_attr_string(span, "class", "list-action") &&
            ps_html_attr_string(span, "data-action", key) &&
            ps_html_attr_string(attrs, link ? "href" : "type", link ? string_member(format, "href") : "button");
        if (ok && link && *string_member(format, "target"))
            ok = ps_html_attr_string(attrs, "target", string_member(format, "target"));
        const ps_value *behavior = action->kind == PS_STRING ? NULL : member(action, "behavior");
        if (action->kind == PS_STRING) {
            char *event = ps_string_join("on", key, "");
            ok = ok && event && ps_html_attr_clone(attrs, event, action);
            free(event);
        } else if (behavior && behavior->kind == PS_OBJECT) {
            for (size_t j = 0; ok && j < ps_size(behavior); ++j) {
                const ps_value *script = ps_at(behavior, j);
                if (script && script->kind == PS_OBJECT) script = member(script, "script");
                if (!script || script->kind != PS_STRING) continue;
                char *event = ps_string_join("on", ps_key_at(behavior, j), "");
                ok = event && ps_html_attr_clone(attrs, event, script);
                free(event);
            }
        }
        if (ok) ok = write_element_start(&context->output, "span", span) &&
            ps_html_start_element(&context->output, link ? "a" : "button", attrs, true, false) &&
            ps_html_raw_text(&context->output, label, strlen(label)) &&
            write_element_end(&context->output, link ? "a" : "button") &&
            write_element_end(&context->output, "span");
        if (!ok) { ps_value_free(span); ps_value_free(attrs); free(label); return false; }
        ps_value_free(attrs);
        free(label);
    }
    return write_element_end(&context->output, "div");
}

static bool append_header(list_context *context, const list_column *columns, size_t count)
{
    if (!write_element_start(&context->output, "thead", ps_object_value()) ||
        !write_element_start(&context->output, "tr", ps_object_value())) return false;
    const ps_value *sort = member(context->spec, "sort");
    const char *sort_field = string_member(sort, "field");
    const char *sort_dir = is_string(member(sort, "dir"), "desc") ? "desc" : "asc";
    for (size_t i = 0; i < count; ++i) {
        ps_value *attrs = ps_object_value();
        char *label = column_label(&columns[i], context->language);
        bool ok = attrs && label && append_class_style(attrs, "list-th", columns[i].design);
        if (ok && *columns[i].field) ok = ps_html_attr_string(attrs, "data-field", columns[i].field);
        if (ok && columns[i].sortable) ok = ps_html_attr_string(attrs, "data-sortable", "true");
        if (ok && *sort_field && (!strcmp(sort_field, columns[i].field) || !strcmp(sort_field, columns[i].key)))
            ok = ps_html_attr_string(attrs, "data-sort-dir", sort_dir);
        if (ok) ok = write_element_start(&context->output, "th", attrs);
        else ps_value_free(attrs);
        ps_value *label_attrs = ps_object_value();
        if (ok) ok = label_attrs && ps_html_attr_string(label_attrs, "class", "list-th-label") &&
            write_element_start(&context->output, "span", label_attrs) &&
            ps_html_escaped(&context->output, label, strlen(label), false) &&
            write_element_end(&context->output, "span");
        else ps_value_free(label_attrs);
        if (ok && columns[i].sortable) {
            ps_value *sort_attrs = ps_object_value();
            ok = sort_attrs && ps_html_attr_string(sort_attrs, "class", "list-sort") &&
                write_element_start(&context->output, "span", sort_attrs) &&
                ps_html_text(&context->output, "↕") && write_element_end(&context->output, "span");
            if (!ok) ps_value_free(sort_attrs);
        }
        if (ok) ok = write_element_end(&context->output, "th");
        free(label);
        if (!ok) return false;
    }
    return write_element_end(&context->output, "tr") && write_element_end(&context->output, "thead");
}

static bool append_table(list_context *context, const list_column *columns, size_t count)
{
    ps_value *attrs = ps_object_value();
    if (!attrs || !ps_html_attr_string(attrs, "class", "list-table") ||
        !write_element_start(&context->output, "table", attrs) ||
        !append_header(context, columns, count) ||
        !write_element_start(&context->output, "tbody", ps_object_value())) return false;
    for (size_t row_index = 0; row_index < ps_size(context->rows); ++row_index) {
        const ps_value *row = ps_at(context->rows, row_index);
        if (!write_element_start(&context->output, "tr", ps_object_value())) return false;
        for (size_t i = 0; i < count; ++i) {
            char *base = ps_string_join("list-td list-td-", columns[i].type, "");
            bool ok = base && append_cell(context, &columns[i], row, "td", base);
            free(base);
            if (!ok) return false;
        }
        if (!write_element_end(&context->output, "tr")) return false;
    }
    return write_element_end(&context->output, "tbody") && write_element_end(&context->output, "table");
}

static bool append_cards(list_context *context, const list_column *columns, size_t count)
{
    ps_value *cards = ps_object_value();
    if (!cards || !ps_html_attr_string(cards, "class", "list-cards") ||
        !write_element_start(&context->output, "div", cards)) return false;
    for (size_t row_index = 0; row_index < ps_size(context->rows); ++row_index) {
        const ps_value *row = ps_at(context->rows, row_index);
        ps_value *article = ps_object_value();
        if (!article || !ps_html_attr_string(article, "class", "list-card") ||
            !write_element_start(&context->output, "article", article)) return false;
        for (size_t i = 0; i < count; ++i) {
            ps_value *design = ps_design(member(columns[i].column, "design"), row,
                columns[i].field[0] == '.' ? columns[i].field + 1 : columns[i].field);
            char *base = ps_string_join("list-td list-td-", columns[i].type, "");
            ps_value *host = ps_object_value();
            char *label = column_label(&columns[i], context->language);
            bool ok = design && base && host && label && append_class_style(host, base, design) &&
                write_element_start(&context->output, "div", host);
            if (!ok) ps_value_free(host);
            ps_value *label_attrs = ps_object_value();
            if (ok) ok = label_attrs && ps_html_attr_string(label_attrs, "class", "list-card-label") &&
                write_element_start(&context->output, "span", label_attrs) &&
                ps_html_escaped(&context->output, label, strlen(label), false) &&
                write_element_end(&context->output, "span");
            else ps_value_free(label_attrs);
            if (ok) ok = append_cell(context, &columns[i], row, "span", "list-card-value") &&
                write_element_end(&context->output, "div");
            ps_value_free(design); free(base); free(label);
            if (!ok) return false;
        }
        if (!write_element_end(&context->output, "article")) return false;
    }
    return write_element_end(&context->output, "div");
}

static bool append_empty(list_context *context)
{
    ps_value *attrs = ps_object_value();
    char *empty = translated(member(context->spec, "empty"), context->language);
    bool ok = attrs && empty && ps_html_attr_string(attrs, "class", "list-empty") &&
        write_element_start(&context->output, "div", attrs) &&
        ps_html_escaped(&context->output, empty, strlen(empty), false) &&
        write_element_end(&context->output, "div");
    if (!ok) ps_value_free(attrs);
    free(empty);
    return ok;
}

static bool append_pagination(list_context *context)
{
    const ps_value *pagination = member(context->spec, "pagination");
    if (!pagination || pagination->kind == PS_NULL ||
        (pagination->kind == PS_BOOL && !pagination->data.boolean)) return true;
    if (pagination->kind != PS_BOOL && pagination->kind != PS_OBJECT) return true;
    ps_value *attrs = ps_object_value();
    bool ok = attrs && ps_html_attr_string(attrs, "class", "list-pagination");
    const char *mode = string_member(pagination, "mode");
    if (ok && *mode) ok = ps_html_attr_string(attrs, "data-mode", mode);
    const ps_value *per_page = member(pagination, "per_page");
    if (ok && per_page && (per_page->kind == PS_INT || per_page->kind == PS_FLOAT))
        ok = ps_html_attr_clone(attrs, "data-per-page", per_page);
    const ps_value *page_meta = member(context->options, "pageMeta");
    for (size_t i = 0; ok && i < 2; ++i) {
        const char *key = i ? "total" : "page";
        const ps_value *value = member(page_meta, key);
        char *name = ps_string_join("data-", key, "");
        if (value) ok = name && ps_html_attr_clone(attrs, name, value);
        free(name);
    }
    if (ok) ok = write_element_start(&context->output, "nav", attrs) &&
        write_element_end(&context->output, "nav");
    else ps_value_free(attrs);
    return ok;
}

static bool append_preloads(list_context *context, ps_html_buffer *target)
{
    for (size_t i = 0; i < context->preload_count; ++i) {
        ps_value *attrs = ps_object_value();
        if (!attrs || !ps_html_attr_string(attrs, "rel", "preload") ||
            !ps_html_attr_string(attrs, "as", "image") ||
            !ps_html_attr_string(attrs, "href", context->preloads[i]) ||
            !write_element_start(target, "link", attrs)) { ps_value_free(attrs); return false; }
    }
    return true;
}

static bool render_list(list_context *context, list_column *columns, size_t count)
{
    ps_value *design = ps_design(member(context->spec, "design"), context->data, "");
    const ps_value *wrapper = member(design, "wrapper");
    ps_value *attrs = ps_object_value();
    char *class_name = ps_join_classes("list-view", string_member(wrapper, "class"), "");
    bool ok = design && attrs && class_name && ps_html_attr_string(attrs, "class", class_name);
    const char *style = string_member(wrapper, "style");
    if (ok && *style) ok = ps_html_attr_string(attrs, "style", style);
    if (ok) ok = write_element_start(&context->output, "div", attrs) && append_toolbar(context);
    else ps_value_free(attrs);
    if (ok) ok = !ps_size(context->rows) ? append_empty(context)
        : !strcmp(context->layout, "card") ? append_cards(context, columns, count)
        : append_table(context, columns, count);
    if (ok) ok = append_pagination(context) && write_element_end(&context->output, "div");
    free(class_name); ps_value_free(design);
    return ok;
}

ps_result ps_render_list(const ps_value *spec, const ps_value *rows, const ps_value *options)
{
    if (!spec || spec->kind != PS_OBJECT)
        return ps_fail("form", "INVALID_FORM_INPUT", "List specification must be an object", "");
    if (!rows || rows->kind != PS_ARRAY)
        return ps_fail("form", "INVALID_FORM_INPUT", "Rows must be an array", "");
    for (size_t i = 0; i < ps_size(rows); ++i)
        if (!ps_at(rows, i) || ps_at(rows, i)->kind != PS_OBJECT)
            return ps_fail("form", "INVALID_FORM_INPUT", "List rows must be objects", "");
    if (!options || options->kind != PS_OBJECT)
        return ps_fail("form", "INVALID_FORM_INPUT", "Options must be an object", "");
    const char *language = string_member(options, "language");
    if (!*language) language = "ko";
    const char *layout = string_member(options, "layout");
    if (!*layout) layout = "table";
    if (strcmp(layout, "table") && strcmp(layout, "card"))
        return ps_fail("form", "INVALID_FORM_INPUT", "List layout must be table or card", "");
    const ps_value *data = member(options, "data");
    ps_value *empty_data = NULL;
    if (!data) data = empty_data = ps_object_value();
    if (!data || data->kind != PS_OBJECT) {
        ps_value_free(empty_data);
        return ps_fail("form", "INVALID_FORM_INPUT", "List context must be an object", "");
    }
    const ps_value *files = member(options, "files");
    ps_value *empty_files = NULL;
    if (!files) files = empty_files = ps_object_value();
    const ps_value *basepath_value = member(options, "basepath");
    const char *basepath = basepath_value && basepath_value->kind == PS_STRING
        ? ps_string(basepath_value) : "";
    ps_value *error = NULL;
    ps_value *columns_value = ps_compose_properties(member(spec, "columns"), files, basepath, &error);
    if (error) { ps_value_free(empty_data); ps_value_free(empty_files); return (ps_result){NULL, error}; }
    if (!columns_value) {
        ps_value_free(empty_data); ps_value_free(empty_files);
        return ps_fail("internal", "INTERNAL_ERROR", "C list composition failed", "");
    }
    list_context context = {spec, columns_value, rows, options, language, layout, data, {0}, NULL, 0, 0};
    list_column *columns = NULL;
    size_t column_count = 0;
    bool ok = collect_columns(&context, &columns, &column_count) &&
        render_list(&context, columns, column_count);
    ps_html_buffer result = {0};
    if (ok) ok = append_preloads(&context, &result) &&
        ps_html_bytes(&result, context.output.data ? context.output.data : "", context.output.length);
    ps_value *output = ok ? ps_html_value(&result) : NULL;
    if (!ok) free(result.data);
    free(context.output.data);
    for (size_t i = 0; i < context.preload_count; ++i) free(context.preloads[i]);
    free(context.preloads);
    free_columns(columns, column_count);
    ps_value_free(columns_value); ps_value_free(empty_data); ps_value_free(empty_files);
    if (!output) return ps_fail("internal", "INTERNAL_ERROR", "C list rendering failed", "");
    return ps_ok(output);
}
