const EXTRACTED_GALLERY_MARKER_RE =
  /\n?\s*<!-- BEGIN AUTOMATICALLY INJECTED EXTRACTED IMAGES -->[\s\S]*?<!-- END AUTOMATICALLY INJECTED EXTRACTED IMAGES -->\s*/g;

const EXTRACTED_GALLERY_SECTION_RE =
  /\n?\s*<section\b[^>]*\bid=\\?(["'])automatically-injected-assets\\?\1[\s\S]*?<\/section>\s*(?:<style>\s*\.asset-card:hover[\s\S]*?<\/style>\s*)?/gi;

export function stripExtractedImageGallery(html: string): string {
  return html
    .replace(EXTRACTED_GALLERY_MARKER_RE, '\n')
    .replace(EXTRACTED_GALLERY_SECTION_RE, '\n');
}

/**
 * HTML artifacts must remain exactly as authored. Strip legacy extracted-media
 * galleries so rewriting a previously affected artifact cleans it, but never
 * append replacement content.
 */
export function sanitizeHtmlArtifact(html: string): string {
  return stripExtractedImageGallery(html);
}
