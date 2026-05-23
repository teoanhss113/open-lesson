# Font And Color Discipline

PowerPoint and Google Slides do not render web fonts the same way a browser preview does. Treat every editable text run as an explicit Office object.

## Text Runs

- Set Latin font and East Asian font slots explicitly.
- Use conservative installed fonts when text must remain editable.
- Preserve exact web typography in the slide background PNG when the font is not guaranteed.
- Do not apply italic to CJK text. Split Latin and CJK runs when needed.
- Set bold, italic, underline, size, and RGB color directly on each run.

## Colors

- Use RGB colors, not theme colors, for visible text and shape fills.
- Do not depend on inherited colors from slide masters or layouts.
- Avoid CSS-only effects in native shapes. Capture shadows, gradients, blur, masks, and blend modes into the PNG background.

## Audit Signals

The verifier flags:

- Theme/scheme colors such as `<a:schemeClr>`.
- Font fallback names commonly introduced by Office or python-pptx defaults.
- Text boxes whose bottom edge crosses the content rail.
