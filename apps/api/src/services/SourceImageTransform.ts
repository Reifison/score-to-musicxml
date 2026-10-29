/** Geometry recorded by the trusted image preparation, never supplied by an upload request. */
export type SourceImageTransform = {
  version: 1;
  method: "crop_padding_v1" | "crop_resize_padding_v1";
  originalImageSHA256: string;
  preparedImageSHA256: string;
  originalWidth: number;
  originalHeight: number;
  preparedWidth: number;
  preparedHeight: number;
  crop: { left: number; top: number; width: number; height: number };
  padding: { left: number; top: number; right: number; bottom: number };
  /** Only for crop_resize_padding_v1: size of the cropped source before padding. */
  resize?: { width: number; height: number };
};

type Rectangle = { left: number; top: number; width: number; height: number };

export function validSourceImageTransform(value: SourceImageTransform): boolean {
  if (!value || value.version !== 1 || !["crop_padding_v1", "crop_resize_padding_v1"].includes(value.method)
    || !/^[a-f0-9]{64}$/.test(value.originalImageSHA256) || !/^[a-f0-9]{64}$/.test(value.preparedImageSHA256)
    || !value.crop || !value.padding) return false;
  const dimensions = [value.originalWidth, value.originalHeight, value.preparedWidth, value.preparedHeight, value.crop.width, value.crop.height];
  const offsets = [value.crop.left, value.crop.top, value.padding.left, value.padding.top, value.padding.right, value.padding.bottom];
  if (dimensions.some((n) => !Number.isSafeInteger(n) || n < 1 || n > 50_000)
    || offsets.some((n) => !Number.isSafeInteger(n) || n < 0 || n > 50_000)
    || [value.padding.left, value.padding.top, value.padding.right, value.padding.bottom].some((n) => !Number.isSafeInteger(n))
    || value.originalWidth * value.originalHeight > 50_000_000
    || value.preparedWidth * value.preparedHeight > 50_000_000) return false;
  const resized = value.method === "crop_resize_padding_v1" ? value.resize : value.crop;
  if (!resized || !Number.isSafeInteger(resized.width) || !Number.isSafeInteger(resized.height)
    || resized.width < 1 || resized.height < 1 || resized.width > 50_000 || resized.height > 50_000
    || value.method === "crop_padding_v1" && value.resize !== undefined
    || value.method === "crop_resize_padding_v1" && (resized.width * resized.height > 20_000_000)) return false;
  return value.crop.left + value.crop.width <= value.originalWidth
    && value.crop.top + value.crop.height <= value.originalHeight
    && value.preparedWidth === resized.width + value.padding.left + value.padding.right
    && value.preparedHeight === resized.height + value.padding.top + value.padding.bottom;
}

/** Project only the pixels originating in the retained source crop; padding has no source evidence. */
export function projectSourceRectangle(rectangle: Rectangle, transform: SourceImageTransform): Rectangle | null {
  if (!validSourceImageTransform(transform)
    || !rectangle || [rectangle.left, rectangle.top, rectangle.width, rectangle.height].some((n) => !Number.isFinite(n))
    || rectangle.width <= 0 || rectangle.height <= 0) return null;
  const left = Math.max(rectangle.left, transform.padding.left);
  const top = Math.max(rectangle.top, transform.padding.top);
  const resized = transform.method === "crop_resize_padding_v1" ? transform.resize! : transform.crop;
  const right = Math.min(rectangle.left + rectangle.width, transform.padding.left + resized.width);
  const bottom = Math.min(rectangle.top + rectangle.height, transform.padding.top + resized.height);
  if (right <= left || bottom <= top) return null;
  const scaleX = transform.crop.width / resized.width;
  const scaleY = transform.crop.height / resized.height;
  return { left: (left - transform.padding.left) * scaleX + transform.crop.left,
    top: (top - transform.padding.top) * scaleY + transform.crop.top,
    width: (right - left) * scaleX, height: (bottom - top) * scaleY };
}
