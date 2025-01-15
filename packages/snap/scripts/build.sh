#!/bin/bash

ENVIRONMENT="${1}"
MANIFEST="snap.manifest.json"
PACKAGE_FILE="package.json"
CONFIG_FILE="snap.config.${ENVIRONMENT}.ts"
ORIGINS_FILE="config/origins.${ENVIRONMENT}.json"

if ! test -f "${ORIGINS_FILE}"; then
  echo "Error: Unsupported environment ${ENVIRONMENT}."
  exit 1
fi

ALLOWED_ORIGINS=$(jq '.' "$ORIGINS_FILE")

if [ "${ENVIRONMENT}" == 'sandbox' ]
then
jq '.name = "@bitpandacustody/trust-vault-snap-sandbox"' "${PACKAGE_FILE}" > temp.json && mv temp.json "${PACKAGE_FILE}"
jq '.proposedName = "TrustVault Sandbox"
    | .source.location.npm.packageName = "@bitpandacustody/trust-vault-snap-sandbox"' "${MANIFEST}" > temp.json && mv temp.json "${MANIFEST}"
pwd
fi

jq --argjson allowedOrigins "$ALLOWED_ORIGINS" \
  '.initialPermissions."endowment:keyring".allowedOrigins = $allowedOrigins
  | .initialPermissions."endowment:rpc".allowedOrigins = $allowedOrigins' "${MANIFEST}" > temp.json && mv temp.json "${MANIFEST}"

mm-snap build -c "${CONFIG_FILE}"
mm-snap eval -c "${CONFIG_FILE}"
