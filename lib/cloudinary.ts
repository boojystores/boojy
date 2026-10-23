import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

// Configure Cloudinary from environment variables
function initCloudinary() {
  if (process.env.CLOUDINARY_URL) {
    cloudinary.config({
      cloudinary_url: process.env.CLOUDINARY_URL,
      secure: true,
    });
  } else if (
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  ) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }
}

initCloudinary();

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_URL ||
      (process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET),
  );
}

// In-memory storage for test suite or unconfigured local mock runs
export const mockCloudinaryStorage = new Map<string, Buffer>();
let mockFailNextUpload = false;
let mockFailNextRemove = false;

export function setMockCloudinaryFailures(opts: {
  upload?: boolean;
  remove?: boolean;
}): void {
  if (opts.upload !== undefined) mockFailNextUpload = opts.upload;
  if (opts.remove !== undefined) mockFailNextRemove = opts.remove;
}

export async function uploadBufferToCloudinary(
  buffer: Buffer,
  options: {
    folder?: string;
    publicId?: string;
  } = {},
): Promise<{ url: string; publicId: string }> {
  initCloudinary();
  const folder = options.folder ?? "boojy/products";
  const publicId = options.publicId ?? `${folder}/${crypto.randomUUID()}`;

  // When live credentials are not set or during unit testing:
  if (!isCloudinaryConfigured() || process.env.NODE_ENV === "test") {
    if (mockFailNextUpload) {
      mockFailNextUpload = false;
      throw new Error("Cloudinary upload failed: simulated error");
    }
    mockCloudinaryStorage.set(publicId, buffer);
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME || "boojy-store";
    return {
      url: `https://res.cloudinary.com/${cloudName}/image/upload/v1/${publicId}.webp`,
      publicId,
    };
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        format: "webp",
      },
      (error, result: UploadApiResponse | undefined) => {
        if (error || !result) {
          reject(error ?? new Error("Cloudinary upload failed"));
        } else {
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
          });
        }
      },
    );
    stream.end(buffer);
  });
}

export async function deleteFromCloudinary(publicId: string): Promise<void> {
  initCloudinary();
  if (!isCloudinaryConfigured() || process.env.NODE_ENV === "test") {
    if (mockFailNextRemove) {
      mockFailNextRemove = false;
      throw new Error("Cloudinary delete failed: simulated error");
    }
    mockCloudinaryStorage.delete(publicId);
    return;
  }

  await cloudinary.uploader.destroy(publicId, {
    resource_type: "image",
    invalidate: true,
  });
}

export { cloudinary };
