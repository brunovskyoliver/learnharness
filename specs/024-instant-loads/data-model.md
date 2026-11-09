# Data model: Instant loads

No stored data changes.

- **Document version tag** (derived, not stored): strong ETag from the item id, file size and modification time. Changes on any rewrite of the bytes.
- **Demo kit version** (derived at build/config time): short hash over the built `public/demo-kit/*` files, exposed as `LH_DEMO_KIT_VERSION`; part of every parent-side library URL.
- **In-page library cache** (memory only): `Map<file, Promise<string>>` in the app page; lives for the page's lifetime.
