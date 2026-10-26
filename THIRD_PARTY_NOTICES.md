# Third-Party Notices

x-ops uses the following npm packages at runtime. Their exact installed versions are declared in `package.json` and `package-lock.json`. These packages are not vendored into this repository; they remain subject to their respective licenses.

| Package | Version | License | Project |
| --- | ---: | --- | --- |
| `twitter-text` | 3.1.0 | Apache License 2.0 | <https://github.com/twitter/twitter-text> |
| `@js-temporal/polyfill` | 0.5.1 | ISC License | <https://github.com/js-temporal/temporal-polyfill> |
| `ajv` | 8.20.0 | MIT License | <https://github.com/ajv-validator/ajv> |
| `csv-parse` | 7.0.3 | MIT License | <https://github.com/adaltas/node-csv/tree/master/packages/csv-parse> |

Complete license texts for installed packages are distributed by npm inside each package directory, for example `node_modules/<package>/LICENSE`. Source distributions and upstream project pages provide the corresponding copyright notices.

`twitter-text` is consumed as an npm dependency for X-compatible text parsing and weighted-length behavior. x-ops does not copy its implementation. Background information is available from the [twitter-text project](https://github.com/twitter/twitter-text).

Recommendations that discuss X ranking or recommendation systems use links and evidence notes in [`references/algorithm-evidence.md`](references/algorithm-evidence.md). This repository does not copy or redistribute X's recommendation algorithm implementation.
