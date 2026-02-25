###Quick Start:

1. build code for `dist`

```shell
yarn build
```

2. navigate to Chrome Extension: `chrome://extensions/`, toogle on **Developer Mode**, click **Load Unpacked** button and select the `path/to/dist` folder.

### TODOs:

1. To support more Banking views in [`src/popup/index.ts`](): upgrade `getAllAccounts()` and `syncAccountTypesFromPage` functions
2. strict types for Alpine.js
