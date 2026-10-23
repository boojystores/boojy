# Product images: server-side compression and Cloudinary storage lifecycle

Product images are re-encoded server-side with `sharp` — to WebP, longest edge ≤ 1600px, quality 80, auto-oriented — before upload to **Cloudinary** under the `boojy/products` folder. This guarantees that only small, optimized WebP objects (typically ~150–350 KB) are uploaded and served globally with fast CDN delivery, avoiding database and storage egress bottlenecks on Supabase.

Every `products.image_url` points at a secure WebP URL hosted on Cloudinary owned by exactly one Product; when a Product is deleted or its image replaced on edit, the previous Cloudinary asset is removed **best-effort after the database write succeeds**, and only for URLs that actually live on Cloudinary (`res.cloudinary.com`) — seeded `picsum.photos` image URLs are external and never touched. A Product must always have an image: the column is `NOT NULL` and `updateProduct` rejects a blank `image_url` with a friendly message.

Status: accepted (updated to Cloudinary)

## Considered options

- **Supabase Storage** — initially used, but switched to Cloudinary to eliminate Supabase bandwidth/egress spikes and leverage Cloudinary's dedicated media CDN and transformations.
- **Client-side (browser) compression** — rejected: quality control is weaker, EXIF handling is manual, and the upload already flows through a Server Action where server-side validation must happen regardless; server-side `sharp` (already shipped by Next.js) ensures strict format and dimension caps before reaching Cloudinary.
- **Strict cleanup (fail the action if Cloudinary removal fails)** — rejected: an orphaned asset costs negligible storage, while a product delete/update blocked by an external network outage is a real failure. DB-first ordering guarantees consistent product state.

## Consequences

- Admin-uploaded products point to `https://res.cloudinary.com/<cloud_name>/image/upload/...`; seed URLs (`picsum.photos`) are preserved and protected.
- A failed product creation removes the freshly uploaded Cloudinary image best-effort, so an upload never orphans on error.
- Cloudinary credentials are read from `CLOUDINARY_URL` or `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
- Image logic lives in `features/admin/lib/products/images.ts` and `lib/cloudinary.ts` (server-only).
