# View session scenarios

[한국어](README.ko.md).

This family contains a shared module instead of `cases.json`. Each renderer's test shows a list or
a detail in a mounted element and passes a `show` function with `expect` and a `flush` function
that waits for rendering.

- [`rerender.mjs`](rerender.mjs) exports `listSpec`, `detailSpec` and `exerciseViewRerender`. It
  shows a list as a table and as cards and a detail, each with a name, an `html` cell and, for the
  list, a link action and a behavior action. It shows each again from a new model with the same
  content and from a model whose `html` value changed, and requires the same element nodes after
  every render and the changed text inside the kept nodes.

The [HTML](../../../packages/generator-html/src/view-session.test.ts),
[React](../../../packages/generator-react/src/__tests__/View.test.tsx),
[Vue](../../../packages/generator-vue/test/view-session.test.mjs) and
[Svelte](../../../packages/generator-svelte/test/view-session.client.mjs) tests run it. The HTML
test patches each newly rendered markup into the element with `patchContent`.
