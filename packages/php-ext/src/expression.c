#include "engine_internal.h"

#include <ctype.h>
#include <errno.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef enum {
    TOK_STRING, TOK_NUMBER, TOK_BOOLEAN, TOK_NULL, TOK_IDENTIFIER, TOK_DOT,
    TOK_DOT_DOT, TOK_ASTERISK, TOK_EQ, TOK_NE, TOK_GT, TOK_GE, TOK_LT, TOK_LE,
    TOK_AND, TOK_OR, TOK_NOT, TOK_IN, TOK_NOT_IN, TOK_LPAREN, TOK_RPAREN,
    TOK_LBRACKET, TOK_RBRACKET, TOK_COMMA, TOK_QUESTION, TOK_COLON, TOK_EOF,
    TOK_INVALID
} token_kind;

typedef struct {
    token_kind kind;
    char *text;
    ps_value *literal;
    size_t dots;
} token;

typedef enum { NODE_TERNARY, NODE_BINARY, NODE_UNARY, NODE_IN, NODE_PATH,
               NODE_LITERAL, NODE_GROUP } node_kind;
typedef enum { SEGMENT_IDENTIFIER, SEGMENT_INDEX, SEGMENT_WILDCARD } segment_kind;

typedef struct { segment_kind kind; char *text; } path_segment;
typedef struct expression_node expression_node;
struct expression_node {
    node_kind kind;
    union {
        struct { expression_node *condition, *yes, *no; } ternary;
        struct { token_kind operation; expression_node *left, *right; } binary;
        expression_node *unary;
        struct { bool negated; expression_node *value; expression_node **items; size_t length; } in;
        struct { bool relative; size_t levels_up; path_segment *segments; size_t length; } path;
        ps_value *literal;
        expression_node *group;
    } data;
};

typedef struct { token *items; size_t length; size_t capacity; bool valid; } lexer_output;
typedef struct { token *tokens; size_t length; size_t current; bool valid; } parser;
typedef struct { const ps_value *data; const char *const *path; size_t path_length; } evaluator;
typedef struct { ps_value *value; bool wildcard; } resolved_value;

static char *copy_range(const char *start, size_t length)
{
    char *copy = malloc(length + 1);
    if (!copy) return NULL;
    memcpy(copy, start, length); copy[length] = '\0'; return copy;
}

static bool push_token(lexer_output *output, token item)
{
    if (output->length == output->capacity) {
        size_t capacity = output->capacity ? output->capacity * 2 : 16;
        token *items = realloc(output->items, capacity * sizeof(*items));
        if (!items) return false;
        output->items = items; output->capacity = capacity;
    }
    output->items[output->length++] = item; return true;
}

static void free_tokens(lexer_output *output)
{
    for (size_t i = 0; i < output->length; ++i) {
        free(output->items[i].text); ps_value_free(output->items[i].literal);
    }
    free(output->items);
}

static bool word_character(char c)
{
    return isalnum((unsigned char)c) || c == '_';
}

static bool token_text(lexer_output *out, token_kind kind, const char *start,
                       size_t length, ps_value *literal, size_t dots)
{
    char *text = copy_range(start, length);
    if (!text || !push_token(out, (token){kind, text, literal, dots})) {
        free(text); ps_value_free(literal); return false;
    }
    return true;
}

static lexer_output tokenize(const char *source)
{
    lexer_output out = {.valid = true};
    const char *cursor = source;
    while (*cursor && out.valid) {
        if (isspace((unsigned char)*cursor)) { cursor++; continue; }
        const char *start = cursor;
        token_kind kind = TOK_INVALID;
        size_t length = 1;
        ps_value *literal = NULL;
        size_t dots = 0;
        if (!strncmp(cursor, "not", 3) && !word_character(cursor[3])) {
            const char *look = cursor + 3;
            while (isspace((unsigned char)*look)) look++;
            if (!strncmp(look, "in", 2) && !word_character(look[2])) {
                kind = TOK_NOT_IN; length = (size_t)(look + 2 - cursor);
            }
        }
        if (kind == TOK_INVALID && !strncmp(cursor, "&&", 2)) { kind = TOK_AND; length = 2; }
        else if (kind == TOK_INVALID && !strncmp(cursor, "||", 2)) { kind = TOK_OR; length = 2; }
        else if (kind == TOK_INVALID && !strncmp(cursor, "==", 2)) { kind = TOK_EQ; length = 2; }
        else if (kind == TOK_INVALID && !strncmp(cursor, "!=", 2)) { kind = TOK_NE; length = 2; }
        else if (kind == TOK_INVALID && !strncmp(cursor, ">=", 2)) { kind = TOK_GE; length = 2; }
        else if (kind == TOK_INVALID && !strncmp(cursor, "<=", 2)) { kind = TOK_LE; length = 2; }
        else if (kind == TOK_INVALID && *cursor == '>') kind = TOK_GT;
        else if (kind == TOK_INVALID && *cursor == '<') kind = TOK_LT;
        else if (kind == TOK_INVALID && *cursor == '!') kind = TOK_NOT;
        else if (kind == TOK_INVALID && *cursor == '.') {
            while (cursor[dots] == '.') dots++;
            kind = dots > 1 ? TOK_DOT_DOT : TOK_DOT; length = dots;
        } else if (kind == TOK_INVALID && *cursor == '*') kind = TOK_ASTERISK;
        else if (kind == TOK_INVALID && *cursor == '(') kind = TOK_LPAREN;
        else if (kind == TOK_INVALID && *cursor == ')') kind = TOK_RPAREN;
        else if (kind == TOK_INVALID && *cursor == '[') kind = TOK_LBRACKET;
        else if (kind == TOK_INVALID && *cursor == ']') kind = TOK_RBRACKET;
        else if (kind == TOK_INVALID && *cursor == ',') kind = TOK_COMMA;
        else if (kind == TOK_INVALID && *cursor == '?') kind = TOK_QUESTION;
        else if (kind == TOK_INVALID && *cursor == ':') kind = TOK_COLON;
        else if (kind == TOK_INVALID && (*cursor == '\'' || *cursor == '"')) {
            char quote = *cursor++;
            size_t capacity = strlen(cursor) + 1, used = 0;
            char *decoded = malloc(capacity);
            if (!decoded) { out.valid = false; break; }
            while (*cursor && *cursor != quote) {
                char value = *cursor++;
                if (value == '\\' && *cursor) {
                    value = *cursor++;
                    if (value == 'n') value = '\n';
                    else if (value == 't') value = '\t';
                    else if (value == 'r') value = '\r';
                }
                decoded[used++] = value;
            }
            if (*cursor != quote) { free(decoded); out.valid = false; break; }
            cursor++; decoded[used] = '\0';
            kind = TOK_STRING; length = (size_t)(cursor - start);
            literal = ps_string_value(decoded); free(decoded);
        } else if (kind == TOK_INVALID && (isdigit((unsigned char)*cursor) ||
                   (*cursor == '-' && isdigit((unsigned char)cursor[1])))) {
            const char *number = cursor;
            if (*cursor == '-') cursor++;
            while (isdigit((unsigned char)*cursor)) cursor++;
            bool decimal = false;
            if (*cursor == '.' && isdigit((unsigned char)cursor[1])) {
                decimal = true; cursor++; while (isdigit((unsigned char)*cursor)) cursor++;
            }
            if (*cursor == 'e' || *cursor == 'E') {
                decimal = true; cursor++;
                if (*cursor == '+' || *cursor == '-') cursor++;
                while (isdigit((unsigned char)*cursor)) cursor++;
            }
            length = (size_t)(cursor - number);
            char *raw = copy_range(number, length);
            if (!raw) { out.valid = false; break; }
            if (decimal) literal = ps_float_value(strtod(raw, NULL));
            else {
                errno = 0; char *end = NULL; long long value = strtoll(raw, &end, 10);
                literal = errno || !end || *end ? ps_float_value(strtod(raw, NULL))
                                                : ps_int_value((int64_t)value);
            }
            free(raw); kind = TOK_NUMBER;
        } else if (kind == TOK_INVALID && (isalpha((unsigned char)*cursor) || *cursor == '_')) {
            cursor++; while (word_character(*cursor)) cursor++;
            length = (size_t)(cursor - start);
            char *word = copy_range(start, length);
            if (!word) { out.valid = false; break; }
            if (!strcmp(word, "true")) { kind = TOK_BOOLEAN; literal = ps_bool_value(true); }
            else if (!strcmp(word, "false")) { kind = TOK_BOOLEAN; literal = ps_bool_value(false); }
            else if (!strcmp(word, "null")) { kind = TOK_NULL; literal = ps_null_value(); }
            else if (!strcmp(word, "in")) kind = TOK_IN;
            else { kind = TOK_IDENTIFIER; literal = ps_string_value(word); }
            free(word);
        }
        if (!token_text(&out, kind, start, length, literal, dots)) out.valid = false;
        cursor = start + length;
    }
    if (out.valid && !token_text(&out, TOK_EOF, "", 0, NULL, 0)) out.valid = false;
    return out;
}

static expression_node *new_node(node_kind kind)
{
    expression_node *node = calloc(1, sizeof(*node));
    if (node) node->kind = kind;
    return node;
}

static void free_node(expression_node *node)
{
    if (!node) return;
    switch (node->kind) {
        case NODE_TERNARY:
            free_node(node->data.ternary.condition); free_node(node->data.ternary.yes);
            free_node(node->data.ternary.no); break;
        case NODE_BINARY:
            free_node(node->data.binary.left); free_node(node->data.binary.right); break;
        case NODE_UNARY: free_node(node->data.unary); break;
        case NODE_IN:
            free_node(node->data.in.value);
            for (size_t i = 0; i < node->data.in.length; ++i) free_node(node->data.in.items[i]);
            free(node->data.in.items); break;
        case NODE_PATH:
            for (size_t i = 0; i < node->data.path.length; ++i) free(node->data.path.segments[i].text);
            free(node->data.path.segments); break;
        case NODE_LITERAL: ps_value_free(node->data.literal); break;
        case NODE_GROUP: free_node(node->data.group); break;
    }
    free(node);
}

static token *peek(parser *p) { return &p->tokens[p->current]; }
static bool check(parser *p, token_kind kind) { return peek(p)->kind == kind; }
static bool match(parser *p, token_kind kind)
{
    if (!check(p, kind)) return false;
    p->current++;
    return true;
}
static token *previous(parser *p) { return &p->tokens[p->current - 1]; }
static expression_node *parse_ternary(parser *p);
static expression_node *parse_primary(parser *p);

static expression_node *literal_node(const ps_value *value)
{
    expression_node *node = new_node(NODE_LITERAL);
    if (node) node->data.literal = ps_value_clone(value);
    if (!node || !node->data.literal) { free_node(node); return NULL; }
    return node;
}

static bool append_segment(expression_node *node, segment_kind kind, const char *text)
{
    size_t length = node->data.path.length;
    path_segment *segments = realloc(node->data.path.segments, (length + 1) * sizeof(*segments));
    if (!segments) return false;
    node->data.path.segments = segments;
    char *copy = text ? copy_range(text, strlen(text)) : NULL;
    if (text && !copy) return false;
    segments[length] = (path_segment){kind, copy}; node->data.path.length++; return true;
}

static expression_node *parse_path_node(parser *p)
{
    expression_node *node = new_node(NODE_PATH);
    if (!node) return NULL;
    if (match(p, TOK_DOT_DOT)) { node->data.path.relative = true; node->data.path.levels_up = previous(p)->dots - 1; }
    else if (match(p, TOK_DOT)) node->data.path.relative = true;
    if (match(p, TOK_IDENTIFIER)) {
        if (!append_segment(node, SEGMENT_IDENTIFIER, previous(p)->text)) goto fail;
    } else if (node->data.path.relative) goto fail;
    while (match(p, TOK_DOT)) {
        if (match(p, TOK_ASTERISK)) { if (!append_segment(node, SEGMENT_WILDCARD, NULL)) goto fail; }
        else if (match(p, TOK_NUMBER)) {
            char number[32];
            if (previous(p)->literal->kind == PS_INT)
                snprintf(number, sizeof(number), "%lld", (long long)previous(p)->literal->data.integer);
            else snprintf(number, sizeof(number), "%lld", (long long)previous(p)->literal->data.number);
            if (!append_segment(node, SEGMENT_INDEX, number)) goto fail;
        } else if (match(p, TOK_IDENTIFIER)) {
            if (!append_segment(node, SEGMENT_IDENTIFIER, previous(p)->text)) goto fail;
        } else goto fail;
    }
    return node;
fail:
    p->valid = false; free_node(node); return NULL;
}

static expression_node *parse_primary(parser *p)
{
    if (match(p, TOK_LPAREN)) {
        expression_node *node = new_node(NODE_GROUP);
        if (!node) return NULL;
        node->data.group = parse_ternary(p);
        if (!node->data.group || !match(p, TOK_RPAREN)) { p->valid = false; free_node(node); return NULL; }
        return node;
    }
    if (check(p, TOK_DOT) || check(p, TOK_DOT_DOT) || check(p, TOK_IDENTIFIER))
        return parse_path_node(p);
    if (match(p, TOK_STRING) || match(p, TOK_NUMBER) || match(p, TOK_BOOLEAN) || match(p, TOK_NULL))
        return literal_node(previous(p)->literal);
    p->valid = false; return NULL;
}

static expression_node *parse_comparison_value(parser *p)
{
    if (check(p, TOK_IDENTIFIER) && p->current + 1 < p->length &&
        p->tokens[p->current + 1].kind != TOK_DOT) {
        p->current++; return literal_node(previous(p)->literal);
    }
    return parse_primary(p);
}

static expression_node *parse_list_item(parser *p)
{
    if (match(p, TOK_IDENTIFIER) || match(p, TOK_NUMBER) || match(p, TOK_STRING))
        return literal_node(previous(p)->literal);
    p->valid = false; return NULL;
}

static bool append_list(expression_node *node, expression_node *item)
{
    size_t length = node->data.in.length;
    expression_node **items = realloc(node->data.in.items, (length + 1) * sizeof(*items));
    if (!items) return false;
    node->data.in.items = items; items[length] = item; node->data.in.length++; return true;
}

static expression_node *parse_comparison(parser *p)
{
    expression_node *left = parse_primary(p);
    if (!left) return NULL;
    if (check(p, TOK_IN) || check(p, TOK_NOT_IN)) {
        bool negated = match(p, TOK_NOT_IN); if (!negated) match(p, TOK_IN);
        expression_node *node = new_node(NODE_IN);
        if (!node) { free_node(left); return NULL; }
        node->data.in.negated = negated; node->data.in.value = left;
        bool brackets = match(p, TOK_LBRACKET);
        expression_node *item = parse_list_item(p);
        if (!item || !append_list(node, item)) goto fail;
        while (match(p, TOK_COMMA)) {
            item = parse_list_item(p); if (!item || !append_list(node, item)) goto fail;
        }
        if (brackets && !match(p, TOK_RBRACKET)) goto fail;
        return node;
fail:
        p->valid = false; free_node(item); free_node(node); return NULL;
    }
    token_kind operation = peek(p)->kind;
    if (operation == TOK_EQ || operation == TOK_NE || operation == TOK_GT ||
        operation == TOK_GE || operation == TOK_LT || operation == TOK_LE) {
        p->current++; expression_node *right = parse_comparison_value(p);
        expression_node *node = new_node(NODE_BINARY);
        if (!right || !node) { free_node(left); free_node(right); free_node(node); return NULL; }
        node->data.binary.operation = operation;
        node->data.binary.left = left;
        node->data.binary.right = right;
        return node;
    }
    return left;
}

static expression_node *parse_not(parser *p)
{
    if (!match(p, TOK_NOT)) return parse_comparison(p);
    expression_node *node = new_node(NODE_UNARY);
    if (!node) return NULL;
    node->data.unary = parse_not(p);
    if (!node->data.unary) { free_node(node); return NULL; }
    return node;
}

static expression_node *parse_and(parser *p)
{
    expression_node *left = parse_not(p);
    while (left && match(p, TOK_AND)) {
        expression_node *right = parse_not(p), *node = new_node(NODE_BINARY);
        if (!right || !node) { free_node(left); free_node(right); free_node(node); return NULL; }
        node->data.binary.operation = TOK_AND;
        node->data.binary.left = left;
        node->data.binary.right = right;
        left = node;
    }
    return left;
}

static expression_node *parse_or(parser *p)
{
    expression_node *left = parse_and(p);
    while (left && match(p, TOK_OR)) {
        expression_node *right = parse_and(p), *node = new_node(NODE_BINARY);
        if (!right || !node) { free_node(left); free_node(right); free_node(node); return NULL; }
        node->data.binary.operation = TOK_OR;
        node->data.binary.left = left;
        node->data.binary.right = right;
        left = node;
    }
    return left;
}

static expression_node *parse_ternary(parser *p)
{
    expression_node *condition = parse_or(p);
    if (!condition || !match(p, TOK_QUESTION)) return condition;
    expression_node *yes = parse_ternary(p);
    if (!yes || !match(p, TOK_COLON)) { p->valid = false; free_node(condition); free_node(yes); return NULL; }
    expression_node *no = parse_ternary(p), *node = new_node(NODE_TERNARY);
    if (!no || !node) { free_node(condition); free_node(yes); free_node(no); free_node(node); return NULL; }
    node->data.ternary.condition = condition;
    node->data.ternary.yes = yes;
    node->data.ternary.no = no;
    return node;
}

static expression_node *parse_expression(lexer_output *tokens)
{
    parser p = {tokens->items, tokens->length, 0, tokens->valid};
    expression_node *node = p.valid ? parse_ternary(&p) : NULL;
    if (!node || !p.valid || !check(&p, TOK_EOF)) { free_node(node); return NULL; }
    return node;
}

static bool numeric_segment(const char *text)
{
    if (!*text) return false;
    for (; *text; ++text) if (!isdigit((unsigned char)*text)) return false;
    return true;
}

static ps_value *value_at(const ps_value *data, char **segments, size_t length)
{
    const char **borrowed = (const char **)segments;
    const ps_value *value = ps_path_segments(data, borrowed, length);
    return value ? ps_value_clone(value) : ps_null_value();
}

static bool has_wildcard(char **segments, size_t length)
{
    for (size_t i = 0; i < length; ++i) if (!strcmp(segments[i], "*")) return true;
    return false;
}

static ps_value *wildcard_values(const ps_value *data, char **segments, size_t length)
{
    size_t wildcard = length;
    for (size_t i = 0; i < length; ++i) if (!strcmp(segments[i], "*")) { wildcard = i; break; }
    if (wildcard == length) {
        ps_value *array = ps_array_value();
        ps_value *value = value_at(data, segments, length);
        if (!array || !value || !ps_append(array, value)) { ps_value_free(array); return NULL; }
        return array;
    }
    ps_value *source = value_at(data, segments, wildcard);
    if (!source) return NULL;
    if (source->kind == PS_OBJECT) {
        memmove(&segments[wildcard], &segments[wildcard + 1], (length - wildcard - 1) * sizeof(*segments));
        ps_value *out = wildcard_values(data, segments, length - 1);
        memmove(&segments[wildcard + 1], &segments[wildcard], (length - wildcard - 1) * sizeof(*segments));
        segments[wildcard] = "*"; ps_value_free(source); return out;
    }
    ps_value *out = ps_array_value();
    if (!out) { ps_value_free(source); return NULL; }
    if (source->kind == PS_ARRAY) {
        for (size_t i = 0; i < ps_size(source); ++i) {
            char index[32]; snprintf(index, sizeof(index), "%zu", i);
            char *saved = segments[wildcard]; segments[wildcard] = index;
            ps_value *items = wildcard_values(data, segments, length); segments[wildcard] = saved;
            if (!items) { ps_value_free(out); ps_value_free(source); return NULL; }
            for (size_t j = 0; j < ps_size(items); ++j)
                if (!ps_append(out, ps_value_clone(ps_at(items, j)))) { ps_value_free(items); ps_value_free(out); ps_value_free(source); return NULL; }
            ps_value_free(items);
        }
    }
    ps_value_free(source); return out;
}

static resolved_value resolve_node(const expression_node *, const evaluator *);
static bool evaluate_node(const expression_node *, const evaluator *);

static resolved_value resolve_path_node(const expression_node *node, const evaluator *eval)
{
    size_t base = 0;
    if (node->data.path.relative) {
        base = eval->path_length; if (base) base--;
        for (size_t level = 0; level < node->data.path.levels_up; ++level) {
            while (base && numeric_segment(eval->path[base - 1])) base--;
            if (base) base--;
        }
    }
    size_t length = base + node->data.path.length;
    char **segments = calloc(length ? length : 1, sizeof(*segments));
    if (!segments) return (resolved_value){ps_null_value(), false};
    for (size_t i = 0; i < base; ++i) segments[i] = (char *)eval->path[i];
    for (size_t i = 0; i < node->data.path.length; ++i)
        segments[base + i] = node->data.path.segments[i].kind == SEGMENT_WILDCARD
            ? "*" : node->data.path.segments[i].text;
    size_t current_index = 0;
    for (size_t i = 0; i < length; ++i) if (!strcmp(segments[i], "*")) {
        while (current_index < eval->path_length && !numeric_segment(eval->path[current_index])) current_index++;
        if (current_index < eval->path_length) segments[i] = (char *)eval->path[current_index++];
    }
    bool wildcard = has_wildcard(segments, length);
    ps_value *value = wildcard ? wildcard_values(eval->data, segments, length)
                               : value_at(eval->data, segments, length);
    free(segments); return (resolved_value){value ? value : ps_null_value(), wildcard};
}

static resolved_value resolve_node(const expression_node *node, const evaluator *eval)
{
    if (node->kind == NODE_LITERAL) return (resolved_value){ps_value_clone(node->data.literal), false};
    if (node->kind == NODE_PATH) return resolve_path_node(node, eval);
    if (node->kind == NODE_GROUP) return (resolved_value){ps_bool_value(evaluate_node(node->data.group, eval)), false};
    return (resolved_value){ps_null_value(), false};
}

static bool number_value(const ps_value *value, bool whole_string, double *number)
{
    if (!value) return false;
    if (value->kind == PS_INT) { *number = (double)value->data.integer; return true; }
    if (value->kind == PS_FLOAT) { *number = value->data.number; return true; }
    if (value->kind == PS_BOOL) { *number = value->data.boolean ? 1 : 0; return true; }
    if (value->kind != PS_STRING) return false;
    const char *text = ps_string(value);
    while (isspace((unsigned char)*text)) text++;
    if (!*text) { *number = 0; return true; }
    char *end = NULL; errno = 0; double parsed = strtod(text, &end);
    if (end == text || errno == ERANGE) return false;
    if (whole_string) { while (isspace((unsigned char)*end)) end++; if (*end) return false; }
    *number = parsed; return true;
}

static int js_type(const ps_value *value)
{
    if (!value || value->kind == PS_NULL) return PS_NULL;
    if (value->kind == PS_INT || value->kind == PS_FLOAT) return PS_FLOAT;
    return value->kind;
}

static bool loose_equal(const ps_value *left, const ps_value *right)
{
    if (js_type(left) == js_type(right)) return ps_equal(left, right);
    if (!left || left->kind == PS_NULL) return !right || right->kind == PS_NULL;
    if (!right || right->kind == PS_NULL) return false;
    double a, b;
    if (number_value(left, true, &a) && number_value(right, true, &b)) return a == b;
    char *sa = ps_scalar_string(left), *sb = ps_scalar_string(right);
    bool equal = sa && sb && !strcmp(sa, sb); free(sa); free(sb); return equal;
}

static bool compare_values(const ps_value *left, const ps_value *right, token_kind operation)
{
    if (operation == TOK_EQ) return loose_equal(left, right);
    if (operation == TOK_NE) return !loose_equal(left, right);
    double a = 0, b = 0; number_value(left, false, &a); number_value(right, false, &b);
    if (operation == TOK_GT) return a > b;
    if (operation == TOK_GE) return a >= b;
    if (operation == TOK_LT) return a < b;
    if (operation == TOK_LE) return a <= b;
    return false;
}

static bool evaluate_binary(const expression_node *node, const evaluator *eval)
{
    token_kind operation = node->data.binary.operation;
    if (operation == TOK_AND) return evaluate_node(node->data.binary.left, eval) && evaluate_node(node->data.binary.right, eval);
    if (operation == TOK_OR) return evaluate_node(node->data.binary.left, eval) || evaluate_node(node->data.binary.right, eval);
    resolved_value left = resolve_node(node->data.binary.left, eval);
    resolved_value right = resolve_node(node->data.binary.right, eval);
    bool result = false;
    if (left.wildcard && left.value->kind == PS_ARRAY) {
        for (size_t i = 0; i < ps_size(left.value); ++i)
            if (compare_values(ps_at(left.value, i), right.value, operation)) { result = true; break; }
    } else result = compare_values(left.value, right.value, operation);
    ps_value_free(left.value); ps_value_free(right.value); return result;
}

static bool evaluate_in(const expression_node *node, const evaluator *eval)
{
    resolved_value probe = resolve_node(node->data.in.value, eval);
    size_t count = probe.wildcard && probe.value->kind == PS_ARRAY ? ps_size(probe.value) : 1;
    bool result = false;
    for (size_t p = 0; p < count && !result; ++p) {
        const ps_value *value = count == 1 && !probe.wildcard ? probe.value : ps_at(probe.value, p);
        bool included = false;
        for (size_t i = 0; i < node->data.in.length; ++i) {
            resolved_value item = resolve_node(node->data.in.items[i], eval);
            included = loose_equal(value, item.value); ps_value_free(item.value);
            if (included) break;
        }
        result = node->data.in.negated ? !included : included;
    }
    ps_value_free(probe.value); return result;
}

static ps_value *evaluate_value_node(const expression_node *node, const evaluator *eval);

static bool evaluate_node(const expression_node *node, const evaluator *eval)
{
    switch (node->kind) {
        case NODE_TERNARY: { ps_value *value = evaluate_value_node(node, eval); bool result = ps_truthy(value); ps_value_free(value); return result; }
        case NODE_BINARY: return evaluate_binary(node, eval);
        case NODE_UNARY: return !evaluate_node(node->data.unary, eval);
        case NODE_IN: return evaluate_in(node, eval);
        case NODE_GROUP: return evaluate_node(node->data.group, eval);
        case NODE_LITERAL: case NODE_PATH: { resolved_value value = resolve_node(node, eval); bool result = ps_truthy(value.value); ps_value_free(value.value); return result; }
    }
    return false;
}

static ps_value *branch_value(const expression_node *node, const evaluator *eval)
{
    if (node->kind == NODE_TERNARY) return evaluate_value_node(node, eval);
    if (node->kind == NODE_GROUP) return branch_value(node->data.group, eval);
    if (node->kind == NODE_LITERAL || node->kind == NODE_PATH) {
        resolved_value value = resolve_node(node, eval); return value.value;
    }
    return ps_bool_value(evaluate_node(node, eval));
}

static ps_value *evaluate_value_node(const expression_node *node, const evaluator *eval)
{
    if (node->kind != NODE_TERNARY) return ps_bool_value(evaluate_node(node, eval));
    return evaluate_node(node->data.ternary.condition, eval)
        ? branch_value(node->data.ternary.yes, eval) : branch_value(node->data.ternary.no, eval);
}

ps_value *ps_expression_value(const char *expression, const ps_value *data,
                              const char *const *current_path, size_t path_length,
                              bool *parsed)
{
    lexer_output tokens = tokenize(expression);
    expression_node *node = parse_expression(&tokens);
    if (parsed) *parsed = node != NULL;
    evaluator eval = {data, current_path, path_length};
    ps_value *value = node ? evaluate_value_node(node, &eval) : NULL;
    free_node(node); free_tokens(&tokens); return value;
}

bool ps_expression_truth(const char *expression, const ps_value *data,
                         const char *const *current_path, size_t path_length,
                         bool *parsed)
{
    lexer_output tokens = tokenize(expression);
    expression_node *node = parse_expression(&tokens);
    if (parsed) *parsed = node != NULL;
    evaluator eval = {data, current_path, path_length};
    bool value = node ? evaluate_node(node, &eval) : false;
    free_node(node); free_tokens(&tokens); return value;
}

ps_value *ps_condition_value(const ps_value *map, const ps_value *data,
                             const char *const *current_path, size_t path_length)
{
    if (!map || map->kind != PS_OBJECT) return ps_null_value();
    const ps_value *fallback = NULL;
    for (size_t i = 0; i < ps_size(map); ++i) {
        const char *condition = ps_key_at(map, i);
        if (!strcmp(condition, "true")) { fallback = ps_at(map, i); continue; }
        bool parsed = false;
        if (ps_expression_truth(condition, data, current_path, path_length, &parsed) && parsed)
            return ps_value_clone(ps_at(map, i));
    }
    return fallback ? ps_value_clone(fallback) : ps_null_value();
}
