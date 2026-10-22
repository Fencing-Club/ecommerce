import { ImagePlus, Star, X } from "lucide-react"
import { useRef, useState } from "react"
import { useTranslations } from "use-intl"
import { fileName } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useErrorMessage } from "@/hooks/use-error-text"
import { useUploadProductImageMutation } from "@/lib/supplier-api"
import type { ProductImage } from "@/lib/supplier-product"
import { imageUrl } from "@/lib/supplier-product"
import { cn } from "@/lib/utils"

function uploadLabel(
  uploading: number,
  count: number,
  t: ReturnType<typeof useTranslations<"supplier.productEditor">>
) {
  if (uploading) {
    return t("uploading", { count: uploading })
  }
  return count ? t("add") : t("addPhotos")
}

// A product's photos: upload several at once, remove one, or make one the main photo.
export function ProductMedia({
  images,
  onChange
}: {
  images: ProductImage[]
  onChange: (images: ProductImage[]) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(0)
  // The last photo that didn't upload, and why.
  const [failed, setFailed] = useState<{ name: string; error: string } | null>(null)
  const [uploadImage] = useUploadProductImageMutation()
  const t = useTranslations("supplier.productEditor")
  const errorMessage = useErrorMessage()

  // A photo that fails, even one that never reaches the server, is skipped: the rest still upload, and every photo that
  // did is kept.
  async function upload(files: File[]) {
    setFailed(null)
    setUploading(files.length)
    const added: ProductImage[] = []
    for (const file of files) {
      try {
        added.push(await uploadImage(file).unwrap())
      } catch (caught) {
        setFailed({ name: file.name, error: errorMessage(caught, t("couldNotUpload")) })
      } finally {
        setUploading((count) => count - 1)
      }
    }
    onChange([...images, ...added])
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("media")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {images.map((image, index) => (
            <figure
              key={image.key}
              className={cn(
                "group relative aspect-square overflow-hidden rounded-lg border bg-muted/30",
                index === 0 && "col-span-2 row-span-2"
              )}
            >
              {/* Stored photos come from our own authenticated route. */}
              <img src={imageUrl(image)} alt={image.name} className="size-full object-contain" />
              <div className="absolute inset-x-1 top-1 flex justify-end gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                {index > 0 && (
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="secondary"
                    aria-label={t("makeMain", { name: image.name })}
                    onClick={() => onChange([image, ...images.filter((other) => other.key !== image.key)])}
                  >
                    <Star />
                  </Button>
                )}
                <Button
                  type="button"
                  size="icon-xs"
                  variant="secondary"
                  aria-label={t("removePhoto", { name: image.name })}
                  onClick={() => onChange(images.filter((other) => other.key !== image.key))}
                >
                  <X />
                </Button>
              </div>
            </figure>
          ))}
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={uploading > 0}
            className={cn(
              "focus-ring flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground",
              !images.length && "col-span-3 aspect-auto py-8 sm:col-span-5"
            )}
          >
            <ImagePlus className="size-5" aria-hidden />
            {uploadLabel(uploading, images.length, t)}
          </button>
        </div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          hidden
          onChange={(event) => {
            // Copied first: clearing the input, so the same photos can be chosen again, empties its own file list.
            const files = Array.from(event.target.files ?? [])
            event.target.value = ""
            if (files.length) {
              void upload(files)
            }
          }}
        />
        {failed && <p className="text-sm text-destructive">{t.rich("fileError", { ...failed, file: fileName })}</p>}
      </CardContent>
    </Card>
  )
}
