# Form Spec Playground

An interactive web playground for testing and developing form specifications using the `@form-spec/generator-react` library.

## Features

- **YAML Spec Editor**: Monaco-powered editor with syntax highlighting for editing form specifications
- **Live Form Preview**: Real-time rendering of your form as you edit the YAML spec
- **Validation Results**: See validation errors in real-time as you fill the form
- **JSON Output**: View the form data as JSON and export it
- **Example Specs**: Pre-built example specifications to get started quickly
- **Language Toggle**: Switch between Korean (ko) and English (en) for multi-language form testing

## Getting Started

### Prerequisites

- Node.js 16.0.0 or higher
- npm or yarn

### Installation

1. First, build the form-react library:

```bash
cd ../../react
npm install
npm run build
```

2. Install playground dependencies:

```bash
cd ../examples/playground
npm install
```

### Running the Playground

Start the development server:

```bash
npm run dev
```

The playground will be available at `http://localhost:5173`.

### Building for Production

```bash
npm run build
npm run preview
```

## Usage

### Layout

The playground is divided into three panels:

1. **Left Panel (YAML Editor)**: Write or edit your form specification in YAML format
2. **Right Panel (Form Preview)**: See your form rendered in real-time
3. **Bottom Panel (Output)**: View JSON data and validation results

### Controls

- **Example Selector**: Choose from pre-built example specifications
- **Language Toggle**: Switch between Korean (KO) and English (EN)
- **Export JSON**: Download the current form data as a JSON file

### Writing Form Specs

Form specs follow the YAML format used by `@form-spec/generator-react`. Here's a basic example:

```yaml
type: group
name: my_form
label:
  ko: 내 폼
  en: My Form
buttons:
  - type: submit
    class: btn btn-primary
    text:
      ko: 제출
      en: Submit

properties:
  name:
    type: text
    label:
      ko: 이름
      en: Name
    rules:
      required: true
    messages:
      ko:
        required: 이름을 입력해주세요.
      en:
        required: Please enter your name.
```

### Supported Field Types

- `text` - Text input
- `email` - Email input with validation
- `password` - Password input
- `number` - Numeric input
- `textarea` - Multi-line text
- `select` - Dropdown selection
- `choice` - Radio button group
- `multichoice` - Checkbox group
- `date` - Date picker
- `datetime` - Date and time picker
- `switcher` - Toggle switch
- `file` - File upload
- `image` - Image upload
- `hidden` - Hidden field

### Validation Rules

Common validation rules:

- `required: true` - Field is required
- `email: true` - Must be valid email format
- `minlength: N` - Minimum character length
- `maxlength: N` - Maximum character length
- `min: N` - Minimum numeric value
- `max: N` - Maximum numeric value
- `match: "regex"` - Match regular expression pattern

### Conditional Display

Use `display_switch` to conditionally show/hide fields:

```yaml
account_type:
  type: choice
  items:
    personal: Personal
    business: Business

company_name:
  type: text
  label: Company Name
  display_switch: .account_type == business
```

## Development

### Project Structure

```
playground/
├── src/
│   ├── components/
│   │   ├── YamlEditor.tsx    # Monaco YAML editor
│   │   ├── FormPreview.tsx   # Form rendering component
│   │   └── OutputPanel.tsx   # JSON/validation output
│   ├── specs/
│   │   └── examples.ts       # Example form specifications
│   ├── App.tsx               # Main application component
│   ├── main.tsx              # Application entry point
│   └── index.css             # Styles
├── package.json
├── vite.config.ts
└── README.md
```

### Technologies Used

- **Vite** - Build tool and dev server
- **React** - UI framework
- **TypeScript** - Type safety
- **Monaco Editor** - Code editor
- **@form-spec/generator-react** - Form builder library
- **yaml** - YAML parsing

## License

MIT
