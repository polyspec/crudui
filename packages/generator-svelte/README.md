# @form-spec/generator-svelte

> Svelte form generator - Coming Soon

This package will provide Svelte components for form generation based on @form-spec YAML specifications.

## Status

🚧 **Under Development** - React stabilization in progress.

## Planned Features

- Svelte 4+ support
- Same 30+ field types as React version
- Identical validation via @form-spec/validator
- Full TypeScript support

## Installation (Future)

```bash
npm install @form-spec/generator-svelte
```

## Usage (Future)

```svelte
<script lang="ts">
  import { FormBuilder } from '@form-spec/generator-svelte';

  let formData = {};

  function handleSubmit(data) {
    console.log(data);
  }
</script>

<FormBuilder {spec} bind:data={formData} on:submit={handleSubmit} />
```
