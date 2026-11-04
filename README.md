# Home Server Interface apps

The App Store catalog of [Home Server Interface](https://github.com/kittyruntime/home-server-interface) (HSI): the apps HSI offers to install, each pinned to an exact image, with what HSI needs to set it up.

HSI ships a copy of this catalog with every release and checks this repository for a newer one every 12 hours, so new apps and image updates reach every HSI without waiting for an HSI release.

## Principles

The App Store is free and curated, and it stays that way:

- only free and open-source self-hosted apps;
- nothing is sold: no paid apps, subscriptions, sponsored or promoted placement, or affiliate links;
- no account is needed to browse or install;
- nothing about what anyone browses or installs is collected. HSI downloads the whole catalog, the same file for everyone.

The App Store points to the apps' own images on their registries; this repository never hosts or redistributes them.

## How HSI reads it

Every change on `main` publishes a release with two files:

- `catalog.json`: every app with its icon inline, and a version (the publication's date and time, `YYYYMMDDHHmm` UTC);
- `catalog.json.sig`: the ed25519 signature of that file, made with the `CATALOG_SIGNING_KEY` secret.

HSI reads `releases/latest/download/catalog.json`, checks the signature against the public key it ships, and uses the catalog only when it is newer than the one it has: an old catalog can never come back. An app that needs a newer HSI (`minHsiVersion`) or that an HSI cannot read is left out on that HSI alone; the rest of the catalog still applies.

## Layout

```
apps/<id>/manifest.json   the app (format: schema/app-manifest.schema.json)
apps/<id>/icon.svg        its logo
schema/                   the manifest format, exported from HSI
catalog-signing.pub       the public half of the signing key
scripts/build.mjs         checks every app, builds and signs the catalog
```

`npm run check` checks every app the way the pull request checks do.

See [CONTRIBUTING.md](CONTRIBUTING.md) to add or update an app.
