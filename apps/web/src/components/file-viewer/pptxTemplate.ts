import type { ProjectFilePreview, ProjectFilePreviewSection } from '../../providers/registry';

export function getPaletteColors(palette: string | null | undefined) {
  const original = {
    bg: '#ffffff',
    fg: '#2C2B2B',
    muted: '#888888',
    accent: '#E31F26',
    surface: '#f5f5f5',
    shell: '#08090d'
  };

  if (!palette) return original;

  switch (palette) {
    case 'coral':
      return {
        bg: '#ffffff',
        fg: '#171717',
        muted: '#ff7a5c',
        accent: '#ff5a3c',
        surface: '#fde2d6',
        shell: '#171717'
      };
    case 'electric':
      return {
        bg: '#ffffff',
        fg: '#171717',
        muted: '#a855f7',
        accent: '#7c3aed',
        surface: '#e9d5ff',
        shell: '#171717'
      };
    case 'acid-forest':
      return {
        bg: '#ffffff',
        fg: '#0f1d14',
        muted: '#22c55e',
        accent: '#16a34a',
        surface: '#bbf7d0',
        shell: '#0f1d14'
      };
    case 'risograph':
      return {
        bg: '#ffffff',
        fg: '#171717',
        muted: '#2563eb',
        accent: '#e11d48',
        surface: '#fde68a',
        shell: '#171717'
      };
    case 'mono-noir':
      return {
        bg: '#ffffff',
        fg: '#0a0a0a',
        muted: '#262626',
        accent: '#0a0a0a',
        surface: '#fafafa',
        shell: '#0a0a0a'
      };
    default:
      return original;
  }
}


const LOGO_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABTIAAALvCAYAAABWVzorAABYO0lEQVR4XuzdTZLrypEm0NpJzWqigUY16P0vpUc9KbNeQbdBUurxfiQTDhIIxM8ZHCu9m3BnZCAcl/hMT/Uf//s//+v/bf7v3/8XE/q5vz3LNcNKch4AVvV//uvv/5B/PorR1w9X+J+//fc/5J/P6OcZsMKz4Oe+Pt7bxz/Ln//sySpnAVpb4bnz6D9+/kO+XDO+vNk9yjXDanImAFY2+hfx0dcPZ8qgawUrhJmP9zVDy3d+9mLFMwGtzPzcSYLMSeWN7lWuG1aS8wDA+F/ER1//1XoPenJ9Pa5xBCsHVrOfn8f7moHlb17VA+ea9bmTBJmTyhvdo1wzrCbnAoB/Gv2L+Ojrv0KGOymvby3X80rW8FoGVyua9ezkvc2w8jdZk72Bc8z23HlFkDmhvMk9ynXDanImAPjT6F/ER1//mTLUeSfrWsl1/CZr+ZOQ6i8znp28vxlW/ib7ZG/gPDM9d14RZE4mb3Cvct2wmpwJAJ6N/kV89PWfIcOcPVnfQq7hN1nLX14FVqub7fzk/c2wcs+7PsD5ZnnuvCLInEze4B7lmmFFORcAvDb6F/HR1/+tDHIqsseV8rMrsgdCzN/MdH7yHmdQueddH+AaMzx3XhFkTiRvbo9yzbCinAsAfjf6F/HR1/+NDHEqsseV8rMrsgfCzH/MdH7yHmdQueddH+AaMzx3BJlNyJvbs1wzrCrnA4Dfjf5FPMMw3su9u1J+dkUGNAipKu4642d7vN85D36TNdkXuM4Mz51HgsxJ5I3tUa4ZVpRzAUDd6F/EMxDjtdy3K+VnV2RAs7rcU96765yfKe95nodX8vrsCVxv9GfPI0HmBPKm9irXDavJmQDguJm+iK8gQ8CK7HGl/OyK7AFHjH6WHsPJn98jg8tXshZob+RnzyNB5gTypvYo1wwryrkA4DOzfBFfQYaAFdnjSvnZFdkDjhr9PP0Eko/rz+DyMbB89WfAPUZ+9vwQZA4ub2iPcs2wopwLAL4zwxfxFWQIuCfrW8g17Ml6+MTIZ2pb85FgUpAJfcm/10YjyBxYHsZe5bphRTkXAHzv5wtt/jl9yReQd7KulVzHb7IWvjHi2Xpc715AmT//7Vqgrfz7bSSCzIHlQexRrhlWlHMBwHl+vtTmn9OXfAlJeX1ruZ5XsgbOMNIZe7fOx8Ayvbs2/xygSpA5qLyRPco1w6pyNgA417uXa/qT4WBv9y3X1tv6mNMI5+3M9QkzgW8IMgeUN7FXuW5YUc4FANc48yUboLWew8wr1iXMBD4lyBxQ3sQe5ZphRTkXAFzripdtgFZ6DDOvXI8wE/iEIHMweQN7lGuGFeVsAHC9K1+6Aa7WU5jZYh3CTOAoQeZg8gb2KNcMK8q5AKCdFi/fAFfpIcxs+fnCTOAIQeZA8ub1KNcMK8q5AKC9li/hAGe7M8y843OFmUCVIHMQeeN6leuGFeVcAHCPO17GAc5yR5jZ+vMeCTOBCkHmIPLG9SjXDCvKuQDgXne+lAN8q2WY2epzfiPMBPYIMgeQN61HuWZYUc4FAH3o4eUc4FMtwsyr+x8hzAR+I8jsXN6wXuW6YUU5FwD0o6eXdICjrgwzr+r7DWEm8I4gs3N5w3qUa4YV5VwA0J8eX9YBqq4IM8/udyZhJvCKILNjebN6lGuGVeVsANCnnl/aAfacGWae1edKwkwgCTI7ljerR7lmWFHOBQB9G+HlHeCdM8LMb+tbEmYCjwSZncob1aNcM6wo5wKAMYz0Eg+QvgkzP627kzAT+CHI7FDepB7lmmFVORsAjCNf5h+DgW9CAoAWPnlOHb2+J8JMYCPI7FDepB7lmmFFORcAjCdDy99kLcDdjjyjqtf1TJgJCDI7kzeoR7lmWFHOBQDjysDyN1kLcLdXz6gM/PLnI/v53aCFPH/cT5DZkbw5vcp1w4pyLgAYUwaVe7IeoAc/z6gMYX54fsFxwsw+CTI7kjenR7lmWFHOBQDjyqCyInsA9CDDS/+tMvieGeqPILMTeWN6lGuGVeVsADCmDCirsg9ADzK8THk9UGOG+iLI7EDelF7lumFFORcAjCsDSoBRZWj5Sj4DgTpz1A9BZgfypvQo1wwryrkAYGwZBFRlH4AeZHCZ8nrgGLPUB0HmzfKG9CjXDKvK2QBgfBlSVmQPgB5kcPnIswvOIcy8nyDzZnlDepRrhhXlXAAwhwwp92Q9QE8ywHwMMj3D4BzCzHsJMm+UN6NHuWZYUc4FAHPJsPI3WQvQm3chpucYnEeYeR9B5k3yRvQq1w0ryrkAYC75kv9O1gGMwvMMzifMvIcg8yZ5I3qUa4YV5VwAMK980ffSD8zEcw3OJ8xsT5B5g7wJPco1w6pyNgAAYFTCTDifMLMtQWZjeQN6leuGFeVcAADA6ISZcD5hZjuCzMbyBvQo1wwryrkAAIBZCDPhfMLMNgSZDeXm9yjXDKvK2QAAgJkIMuF8wszrCTIbys3vUa4ZVpRzAQAAMxJmwvmEmdcSZDaSG9+jXDOsKOcCAABmJsyE8wkzryPIbCA3vUe5ZlhRzgUAAKxCmAnyqEwAAOppJREFUmAnnmznM/Pnd3snrzyTIbCA3vUe5ZlhRzgUAAKxCmAnyqEwAAOppJREFUmAnnmznM/Ha/8vo3cm27EmQ2kJveo1wzrCjnAgAAViHM3CbMhPMJM68lyGwgN71HuWZYUc4FAACsQpi5TZgJ5xNmXkuQ2UBueo9yzbCinAsAAFhHhpibMBN4R5h5HUHmxXLDe5RrhhXlXAAAwEq+TzOlCABDmHkNQebFcsN7lOuGFeVcAADAOjLIzGQz/3OAEGZeQ5B5sdzsHuW6YUU5FwAAsIZXwWWGnQJN4J0w83yCzIvlZvco1w0ryrkAAID6voLM/FmPAWcKNMm5gfeEmecSZF4sN7tHuW5YUc4FAADUJcQE9ibMPI8g82K52T3KdcOKci4AAKCeV2GmEBN4R5h5DkHmxXKje5TrhhXlXAAAQD3fBZjCTOATwsxjCTIvlBvdo1w3rCjnAgAA6vgqwBRiAt8SZp5HkHmh3Oge5bphRTkXAABQw3dBphAT+JYw8xyCzAvlRvco1w0ryrkAAIDrfRdkCjGBTwkzjyHIvFBudI9yzbCinAsAALjWV2GmEBM4gjDze4LMC+VG9yjXDCvKuQAAgOtkmCnIBI4kzPyeIPNCudE9ynXDi3I2AADgHBlWfhdkCjKBIwkzv1M6yMwF9ijXDSvK2QAAgO+9CjQffwcYQZh5jCDzYrnpPcp1w4pyNgAA4DN5WSYwFM8cfy7M/L2nIDMvokfJdUOqnA0AACBliPnd5ZggE5hJnjl+lTP/5ilj3V/7BOgRcm2QKmcDAAB+l4HmliATmNEsz9+MYebXHsld+UT+LpAqZwMAAN7LQPOVvD5kHcDdZnn+Zgwz0997JNcOoXIuAAD4RwaZr2Q9QB+vhJnbZxk/zRhmpse9lGsHUjkbAAA8E2IC/Zrh+TtbmPn4Hsk1RPaFlOUDAPRPiAn0a/Tnb+Uwc5a9k3sCq8v5AADmI8QE+jHbs7d6mCnnBkCOCwDQFyEmcG+zPX95XlWVcwMg5wcAuD9BJjCufJ5WlfMCXcl5AADuRZgJjC+fowBybgCgO0EmMDYhJgAJ5wA6kvsAAAAAAAAAAAAAUMm/B05Dqa8h7vwAAAAASUVORK5CYII=';

// Common visual styles for slide layout and paper layout
const DECK_COMMON_CSS = `
  :root {
    --bg: #ffffff;
    --fg: #2C2B2B;
    --muted: #888888;
    --accent: #E31F26;
    --surface: #f5f5f5;
    --shell: #08090d;
    --brand-red: #E31F26;
    --brand-dark: #2C2B2B;
    --brand-gray: #888888;
    --brand-light: #f9f9f9;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--shell);
    color: var(--fg);
    font: 18px/1.5 -apple-system, system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  .deck-shell {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    overflow: hidden;
  }
  .deck-stage {
    width: 1920px;
    height: 1080px;
    background: var(--bg);
    position: relative;
    transform-origin: top left;
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
    flex-shrink: 0;
  }
  .slide {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }
  .slide:not(.active) { display: none !important; }
  :where(.slide.active) { display: flex; flex-direction: column; }
  
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  .slide {
    font-family: 'Inter', 'Arial', -apple-system, sans-serif;
  }
  .logo {
    position: absolute;
    top: 28px;
    left: 40px;
    z-index: 10;
  }
  .logo img {
    height: 40px;
    width: auto;
  }
  .slide-footer {
    position: absolute;
    bottom: 28px;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 13px;
    color: var(--brand-gray);
    letter-spacing: 0.01em;
    z-index: 5;
  }
  .slide-badge {
    position: absolute;
    top: 28px;
    left: 40px;
    background: var(--brand-red);
    color: #fff;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 700;
    z-index: 10;
  }
  .section-eyebrow {
    position: absolute;
    top: 32px;
    left: 100px;
    font-size: 14px;
    font-weight: 600;
    color: var(--brand-red);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    z-index: 10;
  }

  /* === TITLE SLIDE === */
  .s-title {
    background: linear-gradient(135deg, #E31F26 0%, #C41A20 50%, #8B0000 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #fff;
  }
  .s-title .logo-title {
    margin-bottom: 40px;
  }
  .s-title .logo-title img {
    height: 60px;
  }
  .s-title h1 {
    font-size: 96px;
    font-weight: 900;
    letter-spacing: -0.02em;
    text-align: center;
    line-height: 1.1;
    max-width: 1400px;
  }
  .s-title .subtitle {
    font-size: 28px;
    font-weight: 400;
    margin-top: 20px;
    opacity: 0.9;
    letter-spacing: 0.02em;
  }
  .s-title .topic-tag {
    margin-top: 50px;
    padding: 12px 32px;
    border: 2px solid rgba(255,255,255,0.4);
    border-radius: 50px;
    font-size: 18px;
    font-weight: 500;
    letter-spacing: 0.04em;
  }
  .s-title .copyright-title {
    position: absolute;
    bottom: 28px;
    color: rgba(255,255,255,0.6);
    font-size: 13px;
    text-align: center;
    left: 0;
    right: 0;
  }

  /* === TOC SLIDE === */
  .s-toc {
    padding: 80px 80px 100px;
  }
  .s-toc h2 {
    font-size: 48px;
    font-weight: 800;
    color: var(--brand-dark);
    margin-bottom: 50px;
  }
  .toc-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
  }
  .toc-item {
    background: var(--brand-light);
    border-radius: 16px;
    padding: 28px 32px;
    display: flex;
    align-items: center;
    gap: 20px;
    border-left: 6px solid var(--brand-red);
  }
  .toc-num {
    width: 48px;
    height: 48px;
    background: var(--brand-red);
    color: #fff;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .toc-item p {
    font-size: 22px;
    font-weight: 600;
    color: var(--brand-dark);
  }

  /* === SECTION DIVIDER === */
  .s-divider {
    background: linear-gradient(135deg, #E31F26 0%, #C41A20 50%, #8B0000 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #fff;
  }
  .s-divider .section-num {
    font-size: 160px;
    font-weight: 900;
    line-height: 1;
    opacity: 0.3;
    position: absolute;
    top: 40px;
    right: 80px;
  }
  .s-divider h2 {
    font-size: 72px;
    font-weight: 800;
    text-align: center;
    line-height: 1.2;
  }
  .s-divider .divider-sub {
    font-size: 20px;
    font-weight: 400;
    margin-top: 16px;
    opacity: 0.8;
  }

  /* === CONTENT SLIDE === */
  .s-content {
    padding: 40px 80px 100px;
  }
  .s-content h2 {
    font-size: 42px;
    font-weight: 800;
    color: var(--brand-red);
    margin-bottom: 24px;
    line-height: 1.15;
  }
  .s-content h3 {
    font-size: 30px;
    font-weight: 700;
    color: var(--brand-dark);
    margin-bottom: 16px;
  }
  .s-content p {
    font-size: 20px;
    line-height: 1.4;
    color: var(--brand-dark);
    max-width: 1400px;
    margin-bottom: 8px;
  }
  .s-content ul {
    list-style: none;
    padding: 0;
  }
  .s-content ul li {
    font-size: 20px;
    line-height: 1.4;
    color: var(--brand-dark);
    padding-left: 32px;
    position: relative;
    margin-bottom: 8px;
  }
  .s-content ul li::before {
    content: "•";
    position: absolute;
    left: 8px;
    color: var(--brand-red);
    font-weight: 700;
  }

  /* Highlight box */
  .highlight-box {
    background: #fff5f5;
    border-radius: 16px;
    padding: 24px 32px;
    border-left: 6px solid var(--brand-red);
    margin: 16px 0;
  }
  .highlight-box p, .highlight-box li {
    font-size: 20px;
  }

  /* Game rules table */
  .game-rules {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px 32px;
    margin-top: 12px;
  }
  .game-rule {
    background: var(--brand-light);
    border-radius: 12px;
    padding: 16px 20px;
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .game-rule .color-dot {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .game-rule span {
    font-size: 18px;
    font-weight: 500;
  }

  /* Challenge box */
  .challenge-box {
    background: var(--brand-red);
    color: #fff;
    border-radius: 16px;
    padding: 20px 32px;
    margin: 16px 0;
    font-size: 22px;
    font-weight: 600;
    text-align: center;
  }
  .challenge-box p {
    color: #fff !important;
  }

  /* Two-column layout */
  .two-col {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 32px;
    margin-top: 12px;
  }
  .col-box {
    background: var(--brand-light);
    border-radius: 16px;
    padding: 24px 28px;
    height: fit-content;
  }
  .col-box h4 {
    font-size: 24px;
    font-weight: 700;
    color: var(--brand-red);
    margin-bottom: 10px;
  }
  .col-box p, .col-box li {
    font-size: 18px;
  }

  /* Timer label */
  .timer-tag {
    display: inline-block;
    background: var(--brand-red);
    color: #fff;
    padding: 6px 18px;
    border-radius: 50px;
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 12px;
  }

  /* Code block mock */
  .code-block {
    background: #1e1e1e;
    color: #d4d4d4;
    border-radius: 12px;
    padding: 16px 20px;
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 16px;
    line-height: 1.6;
    margin: 12px 0;
  }
  .code-block .green { color: #6A9955; }
  .code-block .blue { color: #569CD6; }
  .code-block .orange { color: #CE9178; }
  .code-block .yellow { color: #DCDCAA; }

  /* Break slide */
  .s-break {
    background: linear-gradient(135deg, #FF6B6B 0%, #E31F26 50%, #8B0000 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #fff;
  }
  .s-break h2 {
    font-size: 80px;
    font-weight: 900;
    text-align: center;
  }
  .s-break p {
    font-size: 28px;
    margin-top: 16px;
    opacity: 0.85;
  }

  /* Thank you slide */
  .s-thanks {
    background: linear-gradient(135deg, #E31F26 0%, #C41A20 50%, #8B0000 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #fff;
  }
  .s-thanks h1 {
    font-size: 120px;
    font-weight: 900;
    letter-spacing: 0.02em;
  }
  .s-thanks p {
    font-size: 28px;
    margin-top: 20px;
    opacity: 0.85;
  }
  
  .stage { place-content: center !important; }
  .deck-shell { display: block !important; }
  .deck-stage { position: absolute !important; }
`;

export function compilePptxToHtml(preview: ProjectFilePreview, activeSlideIndex: number, palette?: string | null): string {
  const colors = getPaletteColors(palette);
  const sections = preview.sections || [];
  let bodyHtml = '';
  let sectionCounter = 0;

  sections.forEach((section: ProjectFilePreviewSection, idx: number) => {
    const isActive = idx === activeSlideIndex;
    const activeClass = isActive ? 'active' : '';
    const slideNumLabel = String(idx + 1).padStart(2, '0');
    const slideTitle = section.title || '';

    // Classify slide type based on heuristics
    const lowerTitle = slideTitle.toLowerCase();
    
    // 1. Title Slide
    if (idx === 0) {
      bodyHtml += `
        <section class="slide ${activeClass} s-title" data-screen-label="${slideNumLabel} Title">
          <div class="logo-title">
            <img src="${LOGO_BASE64}" alt="MindX Logo">
          </div>
          <h1>${slideTitle.replace(/buổi\s+\d+:\s*/gi, 'BUỔI 2:<br>') || 'GIỚI THIỆU'}</h1>
          <p class="subtitle">${preview.title || 'Robotics and Engineering — Nhập môn Robotics'}</p>
          <div class="topic-tag">Độ tuổi: 6–7 | Thời lượng: 120 phút</div>
          <p class="copyright-title">Bản quyền thuộc CTCP Trường học công nghệ MindX, website: mindx.edu.vn</p>
          <div class="slide-counter">${idx + 1} / ${sections.length}</div>
        </section>
      `;
      return;
    }

    // 2. TOC Slide
    if (idx === 1 || lowerTitle.includes('nội dung') || lowerTitle.includes('mục lục') || lowerTitle.includes('nội dung buổi học')) {
      const tocItems = section.lines
        .map((line) => line.replace(/^\d+[\s.-]*/, '').trim())
        .filter((line) => line.length > 0 && !line.toLowerCase().includes('bản quyền thuộc') && !line.toLowerCase().includes('mindx.edu.vn'));
      
      let gridHtml = '';
      tocItems.forEach((item, itemIdx) => {
        const itemNum = String(itemIdx + 1).padStart(2, '0');
        gridHtml += `
          <div class="toc-item">
            <div class="toc-num">${itemNum}</div>
            <p>${item}</p>
          </div>
        `;
      });

      bodyHtml += `
        <section class="slide ${activeClass} s-toc" data-screen-label="${slideNumLabel} Nội dung buổi học">
          <div class="logo">
            <img src="${LOGO_BASE64}" alt="MindX Logo">
          </div>
          <h2>NỘI DUNG BUỔI HỌC</h2>
          <div class="toc-grid">
            ${gridHtml || '<div class="toc-item"><p>Nội dung đang được cập nhật...</p></div>'}
          </div>
          <div class="slide-footer">Bản quyền thuộc CTCP Trường học công nghệ MindX, website: mindx.edu.vn</div>
          <div class="slide-counter">${idx + 1} / ${sections.length}</div>
        </section>
      `;
      return;
    }

    // 3. Thanks Slide
    if (idx === sections.length - 1 || lowerTitle.includes('cảm ơn') || lowerTitle.includes('thank you')) {
      bodyHtml += `
        <section class="slide ${activeClass} s-thanks" data-screen-label="${slideNumLabel} Cảm ơn">
          <h1>CẢM ƠN!</h1>
          <p>Hẹn gặp lại các con ở buổi học tiếp theo!</p>
          <div class="slide-footer" style="color: rgba(255,255,255,0.5);">Bản quyền thuộc CTCP Trường học công nghệ MindX, website: mindx.edu.vn</div>
          <div class="slide-counter">${idx + 1} / ${sections.length}</div>
        </section>
      `;
      return;
    }

    // 4. Break Slide
    if (lowerTitle.includes('giải lao') || lowerTitle.includes('break') || lowerTitle.includes('nghỉ ngơi')) {
      bodyHtml += `
        <section class="slide ${activeClass} s-break" data-screen-label="${slideNumLabel} Giải lao">
          <h2>GIẢI LAO</h2>
          <p>⏱ 5 - 10 phút</p>
          <div class="slide-footer" style="color: rgba(255,255,255,0.5);">Bản quyền thuộc CTCP Trường học công nghệ MindX, website: mindx.edu.vn</div>
          <div class="slide-counter">${idx + 1} / ${sections.length}</div>
        </section>
      `;
      return;
    }

    // 5. Section Divider Slide (has uppercase title & short/no lines)
    const isUppercase = slideTitle === slideTitle.toUpperCase() && slideTitle.length > 3;
    const hasFewLines = section.lines.length <= 1;
    if (isUppercase || hasFewLines || lowerTitle.includes('khởi động') || lowerTitle.includes('tìm hiểu về') || lowerTitle.includes('xây dựng')) {
      sectionCounter++;
      const secNum = String(sectionCounter).padStart(2, '0');
      bodyHtml += `
        <section class="slide ${activeClass} s-divider" data-screen-label="${slideNumLabel} ${slideTitle}">
          <div class="section-num">${secNum}</div>
          <h2>${slideTitle.replace(/phần\s+\d+:\s*/gi, '')}</h2>
          <p class="divider-sub">⏱ ${section.lines[0] || '15 phút'}</p>
          <div class="slide-footer" style="color: rgba(255,255,255,0.5);">Bản quyền thuộc CTCP Trường học công nghệ MindX, website: mindx.edu.vn</div>
          <div class="slide-counter">${idx + 1} / ${sections.length}</div>
        </section>
      `;
      return;
    }

    // 6. Standard Content Slide
    // Parse contents into beautiful structural widgets
    let contentHtml = '';
    const lines = (section.lines || []).filter(line => {
      const lower = line.toLowerCase();
      return !lower.includes('bản quyền thuộc') && !lower.includes('mindx.edu.vn');
    });
    let bulletList: string[] = [];
    let currentColumnData: { title: string; text: string }[] = [];
    let gameRules: { color: string; label: string }[] = [];

    // Helper to flush current list/grid structures
    const flushStructures = (except: 'bullets' | 'columns' | 'rules' | 'none' = 'none') => {
      let chunk = '';
      if (except !== 'bullets' && bulletList.length > 0) {
        chunk += `<ul style="margin-top: 16px;">`;
        bulletList.forEach((b) => {
          chunk += `<li>${b}</li>`;
        });
        chunk += `</ul>`;
        bulletList = [];
      }
      if (except !== 'columns' && currentColumnData.length > 0) {
        chunk += `<div class="two-col" style="margin-top: 24px;">`;
        currentColumnData.forEach((col) => {
          chunk += `
            <div class="col-box">
              <h4>${col.title}</h4>
              <p>${col.text}</p>
            </div>
          `;
        });
        chunk += `</div>`;
        currentColumnData = [];
      }
      if (except !== 'rules' && gameRules.length > 0) {
        chunk += `<div class="game-rules">`;
        gameRules.forEach((rule) => {
          chunk += `
            <div class="game-rule">
              <div class="color-dot" style="background: ${rule.color};"></div>
              <span>${rule.label}</span>
            </div>
          `;
        });
        chunk += `</div>`;
        gameRules = [];
      }
      return chunk;
    };

    let processedHeaderCount = 0;

    for (let lIdx = 0; lIdx < lines.length; lIdx++) {
      const rawLine = lines[lIdx] || '';
      const line = rawLine.trim();
      if (!line) continue;

      // Classify lines
      // Heuristic 1: Game rule colors
      if (line.includes('→') && (line.toLowerCase().includes('khối') || line.toLowerCase().includes('màu'))) {
        const parts = line.split('→');
        const colorName = parts[0]!.trim();
        const ruleLabel = parts[1]!.trim();
        let colorHex = '#E31F26'; // Default red
        if (colorName.includes('Xanh')) colorHex = '#4CAF50';
        else if (colorName.includes('Vàng')) colorHex = '#FFC107';
        else if (colorName.includes('Tím')) colorHex = '#9C27B0';
        else if (colorName.includes('Đỏ')) colorHex = '#F44336';
        else if (colorName.includes('Cam')) colorHex = '#FF9800';

        contentHtml += flushStructures('rules');
        gameRules.push({ color: colorHex, label: `<strong>${colorName}</strong> → ${ruleLabel}` });
        continue;
      }

      // Heuristic 2: Column box definitions (Bold / capital lines followed by details)
      const isEmojiHeader = /^[^\w\s]{1,3}\s+[a-zA-ZÀ-ỹ]/.test(line);
      const isShortUppercase = line.length < 35 && line === line.toUpperCase() && /[A-ZÀ-ỸđĐ]/.test(line) && line.replace(/[^A-ZÀ-ỸđĐ]/g, '').length >= 3;
      if ((isEmojiHeader || isShortUppercase) && lIdx + 1 < lines.length && !lines[lIdx + 1]!.trim().startsWith('•') && lines[lIdx + 1]!.trim().length > 10) {
        contentHtml += flushStructures('columns');
        currentColumnData.push({
          title: line,
          text: lines[lIdx + 1]!.trim()
        });
        lIdx++; // skip next line as it is consumed
        continue;
      }

      // Heuristic 3: Code block
      if (line.includes('{') || line.includes('}') || line.startsWith('when') || line.startsWith('forever') || line.includes('import ') || line.includes('def ')) {
        contentHtml += flushStructures('none');
        contentHtml += `
          <div class="code-block">
            <span class="blue">${line.replace(/([{}])/g, '<span class="yellow">$1</span>')}</span>
          </div>
        `;
        continue;
      }

      // Heuristic 4: Highlight box (e.g. 💡 Vì sao...)
      if (line.startsWith('💡') || line.startsWith('❓') || line.startsWith('⚠️')) {
        contentHtml += flushStructures('none');
        contentHtml += `
          <div class="highlight-box">
            <p style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">${line.slice(0, 2)} ${line.slice(2).trim()}</p>
          </div>
        `;
        continue;
      }

      // Heuristic 5: Challenge box (wrapped in quotes and starts with "Hãy...")
      if (line.startsWith('"') && line.endsWith('"') && line.length > 25) {
        contentHtml += flushStructures('none');
        contentHtml += `
          <div class="challenge-box">
            ${line}
          </div>
        `;
        continue;
      }

      // Heuristic 6: Bullets
      if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) {
        contentHtml += flushStructures('bullets');
        bulletList.push(line.replace(/^[•\-*]\s*/, '').trim());
      } else {
        // Normal paragraph text
        contentHtml += flushStructures('none');
        if (processedHeaderCount === 0 && line.length < 60) {
          contentHtml += `<p style="font-weight: 600; font-size: 24px; margin-top: 12px; margin-bottom: 16px;">${line}</p>`;
          processedHeaderCount++;
        } else {
          contentHtml += `<p>${line}</p>`;
        }
      }
    }

    contentHtml += flushStructures('none');

    bodyHtml += `
      <section class="slide ${activeClass} s-content" data-screen-label="${slideNumLabel} ${slideTitle.substring(0, 12)}">
        <div class="slide-badge">${slideNumLabel}</div>
        <div class="section-eyebrow">NHẬP MÔN ROBOTICS</div>
        <h2 style="margin-top: 70px;">${slideTitle}</h2>
        ${contentHtml}
        <div class="slide-footer">Bản quyền thuộc CTCP Trường học công nghệ MindX, website: mindx.edu.vn</div>
        <div class="slide-counter">${idx + 1} / ${sections.length}</div>
      </section>
    `;
  });

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${preview.title || 'MINDX LESSON'}</title>
  <style>
    ${DECK_COMMON_CSS}
    :root {
      --bg: ${colors.bg};
      --fg: ${colors.fg};
      --muted: ${colors.muted};
      --accent: ${colors.accent};
      --surface: ${colors.surface};
      --shell: ${colors.shell};
      --brand-red: ${colors.accent};
      --brand-dark: ${colors.fg};
      --brand-gray: ${colors.muted};
      --brand-light: ${colors.surface};
    }
    .slide-counter {
      position: absolute;
      bottom: 28px;
      right: 40px;
      font-size: 15px;
      font-weight: 600;
      color: var(--brand-gray);
      letter-spacing: 0.05em;
      z-index: 10;
    }
  </style>
  <script>
    (function() {
      function fitStage() {
        const stage = document.getElementById('deck-stage');
        if (!stage) return;
        
        // Calculate the scale to fit the stage inside the window
        const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
        
        stage.style.transform = 'scale(' + scale + ')';
        stage.style.transformOrigin = 'top left';
        
        // Center the scaled stage inside the window
        const left = (window.innerWidth - 1920 * scale) / 2;
        const top = (window.innerHeight - 1080 * scale) / 2;
        
        stage.style.setProperty('left', left + 'px', 'important');
        stage.style.setProperty('top', top + 'px', 'important');
      }
      
      window.addEventListener('resize', fitStage);
      window.addEventListener('load', fitStage);
      document.addEventListener('DOMContentLoaded', fitStage);
      
      // Initial trigger
      fitStage();
      setTimeout(fitStage, 100);
    })();
  </script>
</head>
<body>
  <div class="deck-shell">
    <div class="deck-stage" id="deck-stage">
      ${bodyHtml}
    </div>
  </div>
</body>
</html>`;
}

export function compileDocxToHtml(preview: ProjectFilePreview, palette?: string | null): string {
  const colors = getPaletteColors(palette);
  const sections = preview.sections || [];
  let paperHtml = '';

  sections.forEach((section: ProjectFilePreviewSection, idx: number) => {
    let sectionHtml = '';
    let inList = false;

    const flushList = () => {
      if (inList) {
        sectionHtml += '</ul>';
        inList = false;
      }
    };

    if (idx === 0 && section.title === 'Document') {
      // First section is usually title
      const titleText = preview.title || section.lines[0] || 'Tài liệu hướng dẫn học tập';
      sectionHtml += `
        <h1 style="font-size: 28px; font-weight: 800; color: #111827; line-height: 1.35; margin-top: 0; margin-bottom: 24px; border-bottom: 2px solid var(--accent); padding-bottom: 12px; font-family: 'Plus Jakarta Sans', 'Inter', sans-serif;">
          ${titleText}
        </h1>
      `;
      
      const startIdx = preview.title ? 0 : 1;
      section.lines.slice(startIdx).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        
        if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
          if (!inList) {
            sectionHtml += `<ul style="margin-left: 20px; margin-bottom: 16px; padding-left: 0; list-style-type: none;">`;
            inList = true;
          }
          sectionHtml += `
            <li style="font-size: 14.5px; line-height: 1.6; color: #374151; margin-bottom: 8px; position: relative; padding-left: 20px;">
              <span style="position: absolute; left: 0; color: var(--accent); font-weight: bold;">•</span>
              ${trimmed.replace(/^[•\-*]\s*/, '')}
            </li>
          `;
        } else if (trimmed.startsWith('💡') || trimmed.startsWith('👉') || trimmed.startsWith('⚠️')) {
          flushList();
          sectionHtml += `
            <div style="background: #f8fafc; border-left: 4px solid var(--accent); padding: 16px 20px; border-radius: 6px; margin: 20px 0; font-size: 14px; color: #334155; line-height: 1.6; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.02);">
              <strong style="margin-right: 6px;">${trimmed.slice(0, 2)}</strong> ${trimmed.slice(2).trim()}
            </div>
          `;
        } else {
          flushList();
          sectionHtml += `<p style="font-size: 14.5px; line-height: 1.65; margin-bottom: 16px; text-align: justify; color: #374151;">${trimmed}</p>`;
        }
      });
      
      flushList();
      paperHtml += sectionHtml;
      return;
    }

    // Standard Document Section header
    if (section.title && section.title !== 'Document') {
      sectionHtml += `
        <h2 style="font-size: 18px; font-weight: 700; color: var(--accent); margin-top: 36px; margin-bottom: 16px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; font-family: 'Plus Jakarta Sans', 'Inter', sans-serif; text-transform: uppercase; letter-spacing: 0.5px;">
          ${section.title}
        </h2>
      `;
    }

    section.lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
        if (!inList) {
          sectionHtml += `<ul style="margin-left: 20px; margin-bottom: 16px; padding-left: 0; list-style-type: none;">`;
          inList = true;
        }
        sectionHtml += `
          <li style="font-size: 14.5px; line-height: 1.6; color: #374151; margin-bottom: 8px; position: relative; padding-left: 20px;">
            <span style="position: absolute; left: 0; color: var(--accent); font-weight: bold;">•</span>
            ${trimmed.replace(/^[•\-*]\s*/, '')}
          </li>
        `;
      } else if (trimmed.startsWith('💡') || trimmed.startsWith('👉') || trimmed.startsWith('⚠️')) {
        flushList();
        sectionHtml += `
          <div style="background: #f8fafc; border-left: 4px solid var(--accent); padding: 16px 20px; border-radius: 6px; margin: 20px 0; font-size: 14px; color: #334155; line-height: 1.6; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.02);">
            <strong style="margin-right: 6px;">${trimmed.slice(0, 2)}</strong> ${trimmed.slice(2).trim()}
          </div>
        `;
      } else {
        flushList();
        sectionHtml += `<p style="font-size: 14.5px; line-height: 1.65; margin-bottom: 16px; text-align: justify; color: #374151;">${trimmed}</p>`;
      }
    });

    flushList();
    paperHtml += sectionHtml;
  });

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${preview.title || 'MINDX DOCUMENT'}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap');
    :root {
      --bg: ${colors.bg};
      --fg: ${colors.fg};
      --muted: ${colors.muted};
      --accent: ${colors.accent};
      --surface: ${colors.surface};
      --shell: ${colors.shell};
    }
    body {
      font-family: 'Inter', Arial, sans-serif;
      background-color: #f3f4f6; /* Premium light grey document backdrop */
      color: #1f2937; /* Clean grey-900 text */
      margin: 0;
      padding: 40px var(--spacing-md, 20px);
      display: flex;
      justify-content: center;
      min-height: 100vh;
      box-sizing: border-box;
    }
    .docx-paper {
      background-color: #ffffff; /* Sharp white paper sheet */
      max-width: 816px; /* Google Docs / MS Word standard width at 96 DPI */
      width: 100%;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 10px 15px -3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04);
      border-radius: 4px;
      padding: 72px 80px; /* Standard A4 page gutters */
      box-sizing: border-box;
      position: relative;
    }
    .docx-watermark {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 8px;
      margin-bottom: 40px;
      font-size: 11px;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-weight: 600;
      font-family: 'Plus Jakarta Sans', sans-serif;
    }
    .docx-watermark span {
      display: flex;
      align-items: center;
      gap: 6px;
    }
  </style>
</head>
<body>
  <div class="docx-paper">
    <div class="docx-watermark">
      <span>Curriculum Document</span>
      <span>MINDX ROBOTICS</span>
    </div>
    ${paperHtml}
  </div>
</body>
</html>`;
}
