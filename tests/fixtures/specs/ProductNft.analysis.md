# ProductNft Spec Analysis

**Source**: `/Users/max/Work/bluetools-deploy/source/app/bluetools-app-main/resource/Module/Max/Shop/Controller/AppFrontSide/Controller/Control/Controller/ProductNft/Spec/Create.yml`

**Lines**: 1,317 lines (ProductNft.yml) + 109 lines (OptionMultiplexable.yml)

---

## Summary

| Metric | Count |
|--------|-------|
| Total Fields (ProductNft.yml) | 74 |
| Total Fields (OptionMultiplexable.yml) | 6 |
| Combined Total | 80 |
| Field Types | 13 |
| Validation Rules | 9 unique types |
| Conditional Expressions | 15 |
| display_target Patterns | 37 |
| display-switch Classes | 6 |
| $ref References | 1 |

---

## Field Types Used

| Type | Count | Description |
|------|-------|-------------|
| group | 16 | Container for nested properties |
| dummy | 16 | Display-only label fields |
| number | 12 | Numeric input fields |
| choice | 8 | Radio button style selection |
| text | 6 | Text input fields |
| select | 5 | Dropdown select fields |
| datetime | 4 | Date/time picker fields |
| image | 2 | Image upload fields |
| multichoice | 1 | Checkbox style multi-selection |
| search | 1 | Search/autocomplete field |
| textarea | 1 | Multi-line text input |
| tinymce | 1 | Rich text editor |
| button | 1 | Action button |
| dummy-input | 1 | Read-only input display (from ref) |

---

## Validation Rules Used

| Rule | Usages | Description |
|------|--------|-------------|
| required | 22 | Field must have value |
| min | 11 | Minimum numeric value |
| unique | 5 | Values must be unique in array |
| max | 3 | Maximum numeric value |
| accept | 2 | File type acceptance (image/*) |
| maxlength | 2 | Maximum string length |
| minlength | 2 | Minimum string length |
| enddate | 1 | Must be after start date |
| match | 1 | Regex pattern matching |

---

## Conditional Expressions Found

Total: 15 conditional expressions (13 in ProductNft.yml + 2 in OptionMultiplexable.yml)

### ProductNft.yml Conditionals

| Field Path | Rule | Expression |
|------------|------|------------|
| common.display.start_dt | required | `..is_display == 2 \|\| ..is_display == 3` |
| common.display.end_dt | required | `..is_display == 2` |
| common.yoil.day[] | required | `..is_allday == 1` |
| common.sale.start_dt | required | `common.is_sale == 2` |
| common.sale.end_dt | required | `common.is_sale == 2` |
| option.groups[].name | required | `common.is_option == 1` |
| option.groups[].items[] | required | `common.is_option == 1` |
| option.button | required | `common.is_option == 1` |
| option_single.items[].price | required | `common.is_option == 0 && option_single.items.*.is_close == 0` |
| option_single.items[].total_quantity | required | `common.is_option == 0 && common.is_quantity > 0 && option_single.items.*.is_close == 0` |
| option_multiple.items[].name | required | `common.is_option == 2 && option_multiple.items.*.is_close == 0` |
| option_multiple.items[].price | required | `common.is_option == 2 && option_multiple.items.*.is_close == 0` |
| option_multiple.items[].total_quantity | required | `common.is_option == 2 && common.is_quantity > 0 && option_multiple.items.*.is_close == 0` |

### OptionMultiplexable.yml Conditionals

| Field Path | Rule | Expression |
|------------|------|------------|
| price | required | `common.is_option == 1 && option_multiplexable.items.*.is_close == 0` |
| total_quantity | required | `common.is_option == 1 && common.is_quantity > 0 && option_multiplexable.items.*.is_close == 0` |

### Expression Patterns Identified

1. **Relative Path References**: `..is_display`, `..is_allday` (parent scope)
2. **Absolute Path References**: `common.is_option`, `common.is_sale`, `common.is_quantity`
3. **Wildcard Path References**: `option_single.items.*.is_close`, `option_multiple.items.*.is_close`
4. **Operators Used**: `==`, `>`, `&&`, `||`

---

## display_target Patterns

Total: 37 patterns (32 in ProductNft.yml + 5 in OptionMultiplexable.yml)

### Target Types

| Target Field | Usage Count | Description |
|--------------|-------------|-------------|
| common.is_quantity | 17 | Controls quantity-related field visibility |
| common.is_option | 6 | Controls option type field visibility |
| ..is_display | 2 | Parent display mode (relative path) |
| .is_display | 2 | Sibling display mode (relative path) |
| .is_allday | 2 | Sibling all-day mode (relative path) |
| common.is_sale | 1 | Controls sale period visibility |

### Condition Modifiers

| Pattern | Condition Style | Condition Class | Description |
|---------|-----------------|-----------------|-------------|
| common.display | Yes | Yes | Both style and class modified |
| common.display.start_dt | Yes | Yes | Both modifiers |
| option_multiplexable | Yes | Yes | Both modifiers |
| option_single | Yes | Yes | Both modifiers |
| option_multiple | Yes | Yes | Both modifiers |
| common.display.end_dt | Yes | No | Style only |
| common.yoil | Yes | No | Style only |
| common.sale | Yes | No | Style only |
| option | Yes | No | Style only |
| common.yoil.is_allday | No | Yes | Class only |
| Various quantity titles | No | Yes | Class only for layout changes |

### Sample display_target_condition_style Values

```yaml
0: "display: none;"
1: "display: none;"
2: "display: block;"
3: "display: block;"
```

### Sample display_target_condition_class Values

```yaml
0: "col-md-6"
1: "col-md-6"
2: "col-md-6"
3: "col-sm-12"
```

---

## display-switch Class Patterns

Total: 6 patterns using `display-switch` CSS class

| Field Path | Classes |
|------------|---------|
| common.is_display | `col-12 col-sm-6 display-switch-btn` |
| common.display | `col-12 xmt-3 display-switch display-switch-dt display-switch-startdt switch-display copy-hide` |
| common.display.start_dt | `col-12 col-sm-6 border-top border-top-1 xpb-0 border-sm-0 display-switch display-switch-dt display-switch-startdt switch-startdt` |
| common.display.end_dt | `col-12 col-sm-6 pt-sm-0 xpb-sm-0 mt-sm-0 border-sm-0 display-switch display-switch-dt switch-enddt mb-1` |
| common.yoil | `col-12 display-switch display-switch-dt display-switch-startdt switch-yoil display-switch-yoil` |
| common.yoil.is_allday | `col-12 col-sm-3 pb-0 display-switch display-switch-always display-switch-dt display-switch-startdt display-switch-yoil` |

### Switch Class Naming Conventions

- `display-switch`: Base switch class
- `display-switch-btn`: Button variant
- `display-switch-dt`: Date-related switches
- `display-switch-startdt`: Start date switches
- `display-switch-yoil`: Day-of-week switches
- `display-switch-always`: Always visible switches
- `switch-display`, `switch-startdt`, `switch-enddt`, `switch-yoil`: Specific switch identifiers

---

## $ref References

Total: 1 reference

| Location | Reference |
|----------|-----------|
| `option_multiplexable.items[].$ref` | `OptionMultiplexable.yml` |

The referenced file `OptionMultiplexable.yml` (109 lines) contains 6 fields:
- `name` (dummy-input)
- `is_close` (choice)
- `original_price` (number)
- `price` (number)
- `total_quantity` (number)
- `rest_quantity` (number)

---

## Structural Overview

```
ProductNft.yml
├── common (group) - Basic Settings
│   ├── is_close (choice) - Display status
│   ├── is_display (choice) - Display period mode
│   ├── display (group) - Date range
│   │   ├── start_dt (datetime)
│   │   └── end_dt (datetime)
│   ├── yoil (group) - Day of week settings
│   │   ├── is_allday (choice)
│   │   └── day[] (multichoice)
│   ├── is_sale (choice) - Sale mode
│   ├── sale (group) - Sale period
│   │   ├── start_dt (datetime)
│   │   └── end_dt (datetime)
│   ├── name (text) - Product name
│   ├── id (text) - Product ID
│   ├── require_point_start (number)
│   ├── require_point_end (number)
│   ├── max_quantity (number)
│   ├── grade_number (number)
│   ├── product_brand_seq (search)
│   ├── product_type_attribute_seq (select)
│   ├── product_type_attribute_items (group)
│   ├── product_attribute (textarea)
│   ├── category_seqs[] (select, multiple)
│   ├── sub_category_seqs[] (select, multiple)
│   ├── cover_images[] (image, multiple)
│   ├── product_attribute_image (image)
│   ├── short_description (text)
│   ├── content (tinymce)
│   ├── is_quantity (choice) - Quantity tracking
│   └── is_option (choice) - Option type
├── option (group) - Multi-option settings
│   ├── groups[] (group, multiple)
│   │   ├── name (text)
│   │   └── items[] (text, multiple)
│   └── button (button)
├── option_multiplexable (group) - Multi-option item list
│   ├── title (group) - Header row
│   └── items[] ($ref: OptionMultiplexable.yml)
├── option_single (group) - No-option settings
│   ├── title (group) - Header row
│   └── items[] (group)
│       ├── is_close (choice)
│       ├── original_price (number)
│       ├── price (number)
│       ├── total_quantity (number)
│       └── rest_quantity (number)
├── option_multiple (group) - Single-option settings
│   ├── title (group) - Header row
│   └── items[] (group, multiple)
│       ├── name (text)
│       ├── is_close (choice)
│       ├── original_price (number)
│       ├── price (number)
│       ├── total_quantity (number)
│       └── rest_quantity (number)
├── additionals[] (select, multiple) - Additional products
└── shipping_methods[] (select, multiple) - Shipping methods
```

---

## Key Testing Considerations

1. **Conditional Validation**: 13 fields have conditional required rules
2. **Dynamic Visibility**: 32 display_target patterns control field visibility
3. **Array Fields**: Multiple fields use `multiple: true` or `multiple: only`
4. **Nested Groups**: Up to 4 levels of nesting
5. **External References**: 1 $ref to external YAML file
6. **Complex Expressions**: Uses `&&`, `||`, `==`, `>` operators with relative (`..`) and wildcard (`*`) paths
7. **Dual Modifiers**: Some fields modify both style and class based on conditions

---

*Generated: 2026-01-04*
