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

## Concepts

### Asynchronous Transaction Flow

Transaction processing in this snap is implemented using the asynchronous transaction flow. That means:
1. The user initiates a transaction through Metamask or a Dapp
2. A transaction request is created in the snap
3. The transaction appears in "Signing" status in the Metamask interface
4. The snap communicates the transaction request with the TrustVault system
5. The snap periodically polls the status of the request in TrustVault and:
   * if the request is pending it does nothing
   * if the request is signed, it approves it, and Metamask broadcasts the signed transaction
   * if the request is cancelled / failed, it rejects it, and Metamask displays "Failed" as the status

### Allowed signing methods

The snap is only compatible with the following signing requests:
* eth_signTransaction
  * legacy transactions
  * eip1559 transactions
* personal_sign
* eth_signTypedData_v3
* eth_signTypedData_v4

That means that if a user interacts with a Dapp that requires a different transaction / signing type,
the snap will throw an "EVM method (method) not supported" error.

### Private Key Management

The purpose of the snap is to provide a layer for seamless interactions between Metamask and the TrustVault system.
No private keys are stored in the snap state. All signing requests are completed via the TrustVault system.
The Metamask seed is not used for private key generation or management within the snap.

In effect:
* Any Metamask account with the `TrustVault` symbol does not have a corresponding private key within Metamask or the snap
* Any Metamask account without the `TrustVault` symbol is handled by Metamask and its private is derived from the seed
* Importing the recovery seed in a different Metamask instance will not recover TrustVault account / funds. See the [Usage](#usage) section
* That does not mean the seed should not be secured and be kept private. See [deterministic signatures](#deterministic-signatures) section

### Deterministic Signatures

NOTE: This only concerns the following signing types: personal_sign, eth_signTypedData_v3, eth_signTypedData_v4

Many Dapps require messages to be signed in a deterministic way. That means, if the same message is signed with the same
private key it should produce the same signature. This is useful, for example, for Dapps that use that signature as a seed
to generate additional, account-bound key-pairs.

The problem stems from the fact that ECDSA does not support that in its default spec. In fact, its security depends on a
strong, randomly generated input (k). If that same k were to be used to sign a different message with the same private key
it would result in exposing that private key. There are proposals for allowing deterministic signatures in ECDSA
(e.g. [RFC6979](https://datatracker.ietf.org/doc/html/rfc6979#section-3.2)) by deriving (k) from the message itself.

As an alternative to those proposals, TrustVault supports deterministic signatures using its state. It will check if the message
has already been signed with the required private key, and if so, it will return that signature and will not attempt to re-sign.

Since the signature could potentially be used to generate sensitive information (like additional private keys),
it should also be treated as sensitive information. To avoid storing and transmitting the clear-text signature, an ECIES key-pair is
generated in the snap using the Metamask seed as entropy (and the unique id of request). The public key is submitted to TrustVault
together with the signing request and is used to encrypt the signature. When requested, TrustVault will return the encrypted signature
and the snap will decrypt it by generating the key-pair again.

The key-pair is not stored in the snap state but can be easily generated with the knowledge of the Metamask seed and the
request id. Thus, the Metamask seed needs to be secured and treated as sensitive data.

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
