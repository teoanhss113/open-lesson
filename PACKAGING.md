# Packaging Open Lesson

This repo packages a standalone Electron desktop app named **Open Lesson**.

Use Node 24.x for release builds. Node 26 currently works for some local steps but is outside the repo engine range and may break native modules.

## macOS

Run on macOS:

```bash
pnpm --filter @open-design/tools-pack build
pnpm exec tools-pack mac build --to all --portable --dir .tmp/tools-pack-open-lesson
```

Artifacts:

- `.tmp/tools-pack-open-lesson/out/mac/namespaces/default/dmg/Open Lesson-default.dmg`
- `.tmp/tools-pack-open-lesson/out/mac/namespaces/default/zip/Open Lesson-default.zip`

The local build is unsigned unless `--signed` is provided with the required Apple signing/notarization environment.

## Windows

Run on Windows:

```bash
pnpm --filter @open-design/tools-pack build
pnpm exec tools-pack win build --to nsis --portable --dir .tmp/tools-pack-open-lesson
```

Artifact:

- `.tmp/tools-pack-open-lesson/out/win/namespaces/default/builder/Open Lesson-default-setup.exe`

The Windows NSIS installer step must run on Windows because the custom installer builder uses Windows-only tooling.

## Bundled Resources

Packaged builds bundle only the runtime resources required by the curriculum app:

- `skills/`
- `design-templates/`
- `design-systems/`
- `craft/`
- `assets/frames/`

The package intentionally excludes removed/reference features:

- bundled plugins and plugin registries
- community pet assets
- prompt-template galleries
- Open Design landing page templates

