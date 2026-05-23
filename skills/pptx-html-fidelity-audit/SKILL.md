name: PPTX HTML Fidelity Audit
description: Audits and re-exports HTML slide decks to PPTX with PowerPoint and Google Slides fidelity, using pixel-faithful slide backgrounds, explicit fonts/colors, and layout rail verification.
triggers:
  - export pptx
  - html to pptx
  - pptx fidelity
  - powerpoint fidelity
  - google slides fidelity
  - slide export audit
od.mode: deck

# PPTX HTML Fidelity Audit

Use this skill whenever an HTML deck must become a `.pptx` that still looks right in PowerPoint and Google Slides. The in-app preview is not the acceptance target; external viewers are.

## Goal

Produce a PPTX whose visual appearance matches the source HTML deck at slide size. Prefer PowerPoint / Google Slides fidelity over fully-native editability when those conflict.

## Required Workflow

1. Inspect the source HTML at its intended slide canvas size.
2. Capture each HTML slide as a PNG at the exact slide aspect ratio.
3. Build a PPTX with one full-slide PNG background per slide.
4. Add editable text overlays only when their position, font, color, and line breaks can be matched closely. Otherwise keep the visible text in the background image and add speaker notes or off-canvas accessibility text.
5. Set explicit RGB colors for every visible text run and shape. Do not rely on theme/scheme colors.
6. Set explicit Latin and East Asian font slots for every text run.
7. Run `python3 skills/pptx-html-fidelity-audit/scripts/verify_layout.py "<deck>.pptx"` before declaring the file done.
8. If verifier errors remain, revise the PPTX and rerun. Do not claim fidelity from the app preview alone.

## Viewer Compatibility Rules

- Use slide-wide raster backgrounds for any design with gradients, CSS effects, complex grids, absolute positioning, or web fonts.
- Avoid semi-transparent native PPTX text/shapes unless verified in both PowerPoint and Google Slides.
- Avoid relying on fonts that are unlikely to exist on the user's machine. Use installed/system fonts for editable overlays; keep exact typography in the raster background.
- Keep editable text boxes inside the safe content rail unless the original design intentionally places them elsewhere.
- Preserve the source canvas aspect ratio. For 16:9 decks, use 13.333 x 7.5 inches.

## Reporting

When done, report:

- PPTX file path.
- Whether the deck is `pixel-faithful hybrid` or `fully editable`.
- Verifier result, for example `0 rail violations, 0 theme colors, 0 risky font fallbacks`.
