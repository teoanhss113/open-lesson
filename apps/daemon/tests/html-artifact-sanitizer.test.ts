import { describe, expect, it } from 'vitest';

import {
  sanitizeHtmlArtifact,
  stripExtractedImageGallery,
} from '../src/html-artifact-sanitizer.js';

describe('sanitizeHtmlArtifact', () => {
  it('does not inject reference media galleries into slide decks', () => {
    const html = [
      '<!doctype html>',
      '<html><body>',
      '<div class="deck-container">',
      '<section class="slide active" data-slide="1"><h1>Title</h1></section>',
      '<section class="slide" data-slide="2"><h1>Next</h1></section>',
      '</div>',
      '<div class="nav-controls"></div>',
      '</body></html>',
    ].join('');

    expect(sanitizeHtmlArtifact(html)).toBe(html);
  });

  it('does not inject reference media galleries into non-deck HTML', () => {
    const html = '<!doctype html><html><body><h1>Lesson brief</h1></body></html>';

    expect(sanitizeHtmlArtifact(html)).toBe(html);
  });

  it('strips previously injected reference media galleries from saved HTML', () => {
    const html = [
      '<!doctype html><html><body>',
      '<h1>Keep this lesson</h1>',
      '<!-- BEGIN AUTOMATICALLY INJECTED EXTRACTED IMAGES -->',
      '<section id="automatically-injected-assets"><h2>Extracted Reference Media</h2></section>',
      '<style>.asset-card:hover { transform: translateY(-4px); }</style>',
      '<!-- END AUTOMATICALLY INJECTED EXTRACTED IMAGES -->',
      '<p>Keep this ending</p>',
      '</body></html>',
    ].join('');

    const processed = sanitizeHtmlArtifact(html);

    expect(processed).toContain('<h1>Keep this lesson</h1>');
    expect(processed).toContain('<p>Keep this ending</p>');
    expect(processed).not.toContain('automatically-injected-assets');
    expect(processed).not.toContain('Extracted Reference Media');
  });
});

describe('stripExtractedImageGallery', () => {
  it('removes unmarked extracted-media sections too', () => {
    const html = [
      '<main>Keep</main>',
      '<section id="automatically-injected-assets"><div>Extracted Reference Media</div></section>',
      '<style>.asset-card:hover { color: red; }</style>',
    ].join('');

    const processed = stripExtractedImageGallery(html);

    expect(processed).toContain('<main>Keep</main>');
    expect(processed).not.toContain('automatically-injected-assets');
    expect(processed).not.toContain('asset-card:hover');
  });
});
