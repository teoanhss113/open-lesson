import path from 'node:path';
import fs from 'node:fs/promises';
import { EXTRACTED_DOCUMENT_MEDIA_DIR } from '@open-design/contracts';

/**
 * Scan projectDir for any extracted document media under _document_media/
 * and return all image paths that are not already present (referenced) in the HTML content.
 */
export async function getMissingExtractedImages(html: string, projectDir: string): Promise<string[]> {
  const mediaRoot = path.join(projectDir, EXTRACTED_DOCUMENT_MEDIA_DIR);
  const missingImages: string[] = [];

  try {
    const stat = await fs.stat(mediaRoot);
    if (!stat.isDirectory()) return [];
  } catch {
    return [];
  }

  try {
    const slugDirs = await fs.readdir(mediaRoot, { withFileTypes: true });
    for (const dir of slugDirs) {
      if (!dir.isDirectory()) continue;
      const slugPath = path.join(mediaRoot, dir.name);
      const files = await fs.readdir(slugPath, { withFileTypes: true });
      for (const file of files) {
        if (!file.isFile() || file.name.startsWith('.')) continue;
        const relativePath = path.posix.join(EXTRACTED_DOCUMENT_MEDIA_DIR, dir.name, file.name);
        
        // Check if the image relative path is already used in the HTML.
        // We look for the exact string or url-encoded variations
        const isUsed = html.includes(relativePath) || html.includes(encodeURI(relativePath));
        if (!isUsed) {
          missingImages.push(relativePath);
        }
      }
    }
  } catch (err) {
    console.error('Failed to scan extracted media for post-processing:', err);
  }

  return missingImages;
}

/**
 * Post-processes HTML code to inject a section with missing extracted images.
 */
export async function postProcessHtmlWithExtractedImages(
  html: string,
  projectDir: string,
): Promise<string> {
  const missingImages = await getMissingExtractedImages(html, projectDir);
  if (missingImages.length === 0) return html;

  // Generate the gallery HTML with sleek Mintlify-style aesthetics:
  // Glassmorphism, smooth gradients, HSL colors, responsive grid, scale-on-hover micro-animations.
  const galleryHtml = `
  <!-- BEGIN AUTOMATICALLY INJECTED EXTRACTED IMAGES -->
  <section id="automatically-injected-assets" style="margin: 4rem auto; padding: 2.5rem; max-width: 1200px; background: rgba(17, 24, 39, 0.85); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 24px; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3); font-family: system-ui, -apple-system, sans-serif; color: #f3f4f6;">
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2rem; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 1.2rem; flex-wrap: wrap; gap: 1rem;">
      <div>
        <h2 style="margin: 0; font-size: 1.8rem; font-weight: 700; color: #ffffff; letter-spacing: -0.025em; display: flex; align-items: center; gap: 0.75rem;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #10b981;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
          Extracted Reference Media
        </h2>
        <p style="margin: 0.4rem 0 0 0; font-size: 0.95rem; color: #9ca3af;">These assets were automatically extracted from the source document for your lesson activity.</p>
      </div>
      <span style="background: rgba(16, 185, 129, 0.12); color: #34d399; font-weight: 600; font-size: 0.85rem; padding: 0.4rem 0.8rem; border-radius: 99px; border: 1px solid rgba(16, 185, 129, 0.25);">
        ${missingImages.length} Image${missingImages.length > 1 ? 's' : ''}
      </span>
    </div>
    
    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1.5rem;">
      ${missingImages.map((img, idx) => `
      <div class="asset-card" style="background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 16px; overflow: hidden; transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1); display: flex; flex-direction: column;">
        <div style="position: relative; width: 100%; padding-top: 66%; background: rgba(0, 0, 0, 0.25); display: flex; align-items: center; justify-content: center; overflow: hidden;">
          <img src="${img}" alt="Extracted Slide/Image ${idx + 1}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; padding: 0.5rem; transition: transform 0.5s cubic-bezier(0.23, 1, 0.32, 1);" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" />
        </div>
        <div style="padding: 1rem; flex-grow: 1; display: flex; flex-direction: column; justify-content: space-between; background: rgba(0, 0, 0, 0.12);">
          <div style="font-size: 0.85rem; font-family: monospace; color: #9ca3af; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 0.8rem;" title="${path.basename(img)}">
            ${path.basename(img)}
          </div>
          <button onclick="navigator.clipboard.writeText('${img}').then(() => { const original = this.innerText; this.innerText = 'Copied!'; this.style.color = '#34d399'; setTimeout(() => { this.innerText = original; this.style.color = '#f3f4f6'; }, 1500); })" style="background: transparent; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 8px; color: #f3f4f6; font-size: 0.8rem; font-weight: 500; padding: 0.4rem; width: 100%; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 0.4rem;" onmouseover="this.style.borderColor='rgba(255, 255, 255, 0.25)'; this.style.background='rgba(255, 255, 255, 0.05)'" onmouseout="this.style.borderColor='rgba(255, 255, 255, 0.12)'; this.style.background='transparent'">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            Copy Image Path
          </button>
        </div>
      </div>
      `).join('')}
    </div>
  </section>
  <style>
    .asset-card:hover {
      transform: translateY(-4px);
      border-color: rgba(16, 185, 129, 0.25) !important;
      box-shadow: 0 12px 20px rgba(0, 0, 0, 0.2);
      background: rgba(255, 255, 255, 0.04) !important;
    }
  </style>
  <!-- END AUTOMATICALLY INJECTED EXTRACTED IMAGES -->
  `;

  // Inject the gallery HTML right before </body>, or append to the end if </body> doesn't exist.
  const bodyIndex = html.lastIndexOf('</body>');
  if (bodyIndex !== -1) {
    return html.substring(0, bodyIndex) + galleryHtml + html.substring(bodyIndex);
  } else {
    return html + galleryHtml;
  }
}
