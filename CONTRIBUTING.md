# Adding or updating an app

## An app fits when

- it is free and open source, self-hosted, and useful on a home server;
- it publishes an official image on a public registry;
- it runs without a paid plan, an account with a third party or tracking.

## Adding one

1. Create `apps/<id>/manifest.json`, where `<id>` is lowercase letters, digits and dashes. Start from a similar app. The format is `schema/app-manifest.schema.json`; the main fields:
   - `image`: pinned to an exact tag (never `latest`) or a `@sha256:` digest;
   - `added`: today's date, `YYYY-MM-DD` (the App Store marks the app New for a while, never by popularity);
   - `ports`, `env` (mark passwords `"secret": true`), `volumes` (`"suggest": "place"` for the user's files);
   - `services`: a database or cache that runs beside the app, if it needs one;
   - `license`, `source`, `docs` and a few `postInstall` first steps;
   - `minHsiVersion`: only when the app uses a manifest field older HSI releases do not know.
2. Add `apps/<id>/icon.svg`: the app's logo, a plain SVG under 64 KB, with no scripts, event handlers or `foreignObject`.
3. Run `npm ci && npm run check`.
4. Open a pull request. The checks validate every app and that every image exists on its registry.

## Updating an image

Renovate proposes the image bumps as pull requests. To bump one by hand, change the tag in `image` (and in `services` when they must move together) and mention the upstream release notes in the pull request.

## Changing the format

The manifest format belongs to HSI (`packages/app-catalog/src/manifest.ts`). A new field lands in HSI first, then `schema/` is exported again from it (`pnpm --filter @app/app-catalog schema`), and the apps that use the field set `minHsiVersion` to the first HSI release that reads it.
