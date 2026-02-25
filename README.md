### Quick Start:

1. build code for `dist`:

```shell
yarn build
```

2. navigate to Chrome Extension: [`chrome://extensions`](chrome://extensions), toogle on **Developer Mode**, click **Load Unpacked** button and select the `path/to/dist` folder.

### TODOs:

1. To support more Banking views in [`src/popup/index.ts`](https://github.com/DrChai/msn/blob/61e91cb5aa71a51c9ffa17bbd934e995c5a6bf0c/src/popup/index.ts#L111-L145): upgrade `getAllAccounts()` and `syncAccountTypesFromPage` functions
2. strict types for Alpine.js
