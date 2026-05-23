# Layout Discipline

The app preview is a browser reconstruction. The PPTX file must be checked as Office XML because PowerPoint and Google Slides use the PPTX geometry, not the app's HTML preview.

## Default 16:9 Rails

- Canvas height: `7.50in`
- Content max Y: `6.70in`
- Footer top: `6.85in`

Editable text boxes should not cross `CONTENT_MAX_Y` unless they are intentional footer elements.

## Hybrid Fidelity Pattern

For complex HTML decks, create each slide as:

1. A full-slide PNG background captured from the HTML.
2. Optional editable text overlays for simple headings or labels.
3. Notes or hidden/off-canvas text for accessibility/search when overlays would visually drift.

This keeps the exported deck visually stable in PowerPoint and Google Slides while preserving enough editable structure for practical revisions.
