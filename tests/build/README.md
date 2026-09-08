# Package build checks

[한국어](README.ko.md).

Run from the repository root:

```sh
npm ci
npm run build
npm run test:build
npm run test:build:repeat
npm run test:packages
```

`test:build` loads validator, generator-core and generator-react through their
public CommonJS and ESM exports. It compiles strict NodeNext type consumers with
`skipLibCheck: false`, checks the complete declaration graph and verifies React's
exported stylesheet. Invalid public types must prevent declaration emission in
all four TypeScript package configurations.

`test:build:repeat` runs the complete build twice and compares every output file's
path and SHA-256 digest in all five package directories.

`test:packages` builds and packs the packages, installs them into a separate
consumer, compiles all framework types, builds the consumer application and runs
its three form components in a browser. These checks do not replace form
validation, persistence or the full interaction matrix.
