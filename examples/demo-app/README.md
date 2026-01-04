# Form Builder Demo Application

A demo React application that renders forms from YAML specifications using `@form-spec/generator-react`.

## Features

- **YAML Spec Rendering**: Forms are defined in YAML and rendered dynamically
- **Real-time Validation**: Validation errors are displayed as you type
- **Conditional Fields**: Fields can be shown/hidden based on other field values
- **Multi-language Support**: Switch between Korean (ko) and English (en)
- **Multiple Fields**: Support for array-type fields with add/remove functionality
- **Nested Groups**: Complex form structures with nested field groups

## Demo Pages

1. **Contact Form** (`/contact`)
   - Basic form fields (text, email, select, textarea)
   - Simple validation rules
   - Privacy agreement switcher

2. **Registration Form** (`/registration`)
   - Nested field groups (Personal, Account, Preferences)
   - Conditional fields (Business info shown when Business account selected)
   - Multi-select preferences
   - Terms and conditions agreements

3. **Product Form** (`/product`)
   - Complex nested structures
   - Conditional display periods and pricing
   - Multiple categories and tags (array fields)
   - Dynamic option groups
   - Inventory management with conditional fields
   - SEO settings

## Getting Started

### Prerequisites

- Node.js 16+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The application will open at http://localhost:3000

### Build for Production

```bash
npm run build
npm run preview
```

## Project Structure

```
demo-app/
├── src/
│   ├── specs/           # YAML form specifications
│   │   ├── contact.yaml
│   │   ├── registration.yaml
│   │   └── product.yaml
│   ├── pages/           # React page components
│   │   ├── HomePage.tsx
│   │   ├── ContactPage.tsx
│   │   ├── RegistrationPage.tsx
│   │   └── ProductPage.tsx
│   ├── App.tsx          # Main app with routing
│   ├── App.css          # Styles
│   └── main.tsx         # Entry point
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## Usage Example

```tsx
import { FormBuilder } from '@form-spec/generator-react';

const yamlSpec = `
type: group
name: contact
properties:
  email:
    type: email
    label:
      ko: 이메일
      en: Email
    rules:
      required: true
      email: true
`;

function MyForm() {
  return (
    <FormBuilder
      spec={yamlSpec}
      data={{ email: '' }}
      language="ko"
      onSubmit={(data, errors) => {
        if (Object.keys(errors).length === 0) {
          console.log('Submitted:', data);
        }
      }}
      onChange={(name, value) => {
        console.log(`${name} changed to:`, value);
      }}
    />
  );
}
```

## YAML Spec Features Demonstrated

### Basic Fields
```yaml
email:
  type: email
  label:
    ko: 이메일
    en: Email
  rules:
    required: true
    email: true
  messages:
    ko:
      required: 이메일을 입력해주세요.
    en:
      required: Please enter your email.
```

### Conditional Display
```yaml
display_type:
  type: choice
  default: 1
  items:
    1: Always
    2: Custom Period

display_period:
  type: group
  display_switch: .display_type == 2
  properties:
    start_date:
      type: datetime
      rules:
        required: ..display_type == 2
```

### Multiple Fields (Arrays)
```yaml
tags[]:
  type: text
  label: Tags
  multiple: true
  sortable: true
  rules:
    unique: true
```

### Nested Groups
```yaml
personal:
  type: group
  label: Personal Info
  properties:
    name:
      type: text
    email:
      type: email
```

## License

MIT
