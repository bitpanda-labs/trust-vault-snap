#!/bin/bash
# usage: bin/version.sh [major|minor|patch]

npm --no-git-tag-version version $1
version=$(jq -r '.version' package.json)

jq --arg version "$version" '.version = $version' packages/snap/package.json > temp.json && mv temp.json packages/snap/package.json
jq --arg version "$version" '.version = $version' packages/snap/snap.manifest.json > temp.json && mv temp.json packages/snap/snap.manifest.json

git add {package.json,packages/snap/package.json,packages/snap/snap.manifest.json}
msg="chore: $version"
git commit -m "$msg"
