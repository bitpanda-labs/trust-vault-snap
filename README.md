# TrustVault Snap

An account management snap that interacts with Bitpanda Custody sub-wallets to sign transactions.

## Usage

NOTE: Usage of this snap requires a Bitpanda Custody account or a Bitpanda Custody Sandbox account.

Set up the snap:
1. Navigate to https://app.bitpandacustody.com and login
2. Navigate to https://app.bitpandacustody.com/metamask-snap
3. If you don't have Metamask installed, you will be prompted to install the extension
4. Click `Install Trust Vault Metamask Snap` and accept the required permissions
5. You will then see your EVM sub-wallets, choose which ones you would like to add to the snap

Set up the sandbox snap:
1. Navigate to https://tvw-sandbox.trustology-test.com and login (with your sandbox account)
2. Navigate to https://tvw-sandbox.trustology-test.com/metamask-snap
3. If you don't have Metamask Flask (development version) installed, you will be prompted to install the extension
4. Click `Install Trust Vault Metamask Snap` and accept the required permissions
5. You will then see your EVM sub-wallets, choose which ones you would like to add to the snap

After your sub-wallets are added, you can normally interact with Metamask using them as accounts.
For example, you can create transactions, interact with Dapps, sign personal messages, etc.

## Development

### Local Setup

NOTE: The local functionality of the snap is very limited as it requires a Development Bitpanda Custody account.

To build and run a development (local) version of the snap:
1. Clone the repository - `git clone https://github.com/bitpanda-labs/trust-vault-snap.git`
2. Navigate to project root - `cd trust-vault-snap`
3. Install the dependencies - `yarn install`
4. Build the snap and serve it - `yarn start`

You can now install the snap by using the following on a browser:
```javascript
const snapId = "local:http://localhost:8092";
const params = { version: "<check version in package.json>" };
const result = await window.ethereum.request({
  method: "wallet_requestSnaps",
  params: {
    [snapId]: params,
  },
});
```

### Testing and Linting

Run `yarn test` to run the tests once.

Run `yarn lint` to run the linter, or run `yarn lint:fix` to run the linter and
fix any automatically fixable issues.
