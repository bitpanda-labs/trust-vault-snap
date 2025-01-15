# TrustVault Snap

An account management snap that interacts with Bitpanda Custody sub-wallets to sign transactions.

## Snaps is pre-release software

To interact with your Snap, you will need to install [MetaMask Flask](https://metamask.io/flask/),
a canary distribution for developers that provides access to upcoming features.

## Getting Started
To build and start the development server, run
```shell
yarn install && yarn start
```

To build sandbox or production, run
```shell
yarn build:sandbox
yarn build:production
```

To serve the sandbox or production build from previous step (for local testing), run
```shell
yarn serve -c snap.config.sandbox.ts
yarn serve -c snap.config.production.ts
```

To build and serve master / test version (not publicly available), run
```shell
yarn build:master
yarn serve -c snap.config.master.ts
```
## Contributing

### Testing and Linting

Run `yarn test` to run the tests once.

Run `yarn lint` to run the linter, or run `yarn lint:fix` to run the linter and
fix any automatically fixable issues.
