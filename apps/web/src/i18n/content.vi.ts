import type { LocalizedSkillCopy } from './content';

export const VI_SKILL_COPY: Record<string, LocalizedSkillCopy> = {
  // Empty for now, will fall back to English
};

export const VI_DESIGN_SYSTEM_SUMMARIES: Record<string, string> = {
  default: 'Hệ thống thiết kế mặc định, sạch sẽ và hướng tới sản phẩm. Phù hợp cho các công cụ B2B, bảng điều khiển và trang tiện ích.',
  'warm-editorial': 'Thẩm mỹ tạp chí với font serif. Điểm nhấn màu đất nung trên giấy trắng ấm — tốt cho bài viết dài và trang marketing.',
  'atelier-zero': 'Hệ thống studio biên tập. Vải giấy ấm, tranh ghép siêu thực, chữ hiển thị serif nghiêng mixed — dành cho landing page tạp chí và slide bài giảng.',
  kami: 'Hệ thống giấy biên tập. Vải giấy da ấm, điểm nhấn xanh mực, phân cấp chữ serif — dành cho sơ yếu lý lịch, white paper và bài trình chiếu slide.',
};

export const VI_DESIGN_SYSTEM_CATEGORIES: Record<string, string> = {
  Slide: 'Mẫu Slide',
  Starter: 'Khởi đầu',
  'AI & LLM': 'AI & LLM',
  'Bold & Expressive': 'Mạnh mẽ & Biểu cảm',
  'Creative & Artistic': 'Sáng tạo & Nghệ thuật',
  'Developer Tools': 'Công cụ phát triển',
  'Layout & Structure': 'Bố cục & Cấu trúc',
  'Modern & Minimal': 'Hiện đại & Tối giản',
  'Morphism & Effects': 'Hiệu ứng & Hình khối',
  'Productivity & SaaS': 'Năng suất & SaaS',
  'Professional & Corporate': 'Chuyên nghiệp & Doanh nghiệp',
  'Backend & Data': 'Hậu trường & Dữ liệu',
  'Design & Creative': 'Thiết kế & Sáng tạo',
  'Fintech & Crypto': 'Tài chính & Tiền điện tử',
  'E-Commerce & Retail': 'Thương mại & Bán lẻ',
  'Media & Consumer': 'Truyền thông & Người dùng',
  'Social & Messaging': 'Mạng xã hội & Nhắn tin',
  Automotive: 'Ô tô & Xe cộ',
  'Editorial & Print': 'Biên tập & In ấn',
  'Editorial · Studio': 'Biên tập · Studio',
  'Retro & Nostalgic': 'Hoài cổ & Phục cổ',
  'Themed & Unique': 'Chủ đề & Độc đáo',
  'Editorial / Personal / Publication': 'Biên tập / Cá nhân / Xuất bản',
  Uncategorized: 'Chưa phân loại',
};

export const VI_PROMPT_TEMPLATE_CATEGORIES: Record<string, string> = {
  // Empty for now
};

export const VI_PROMPT_TEMPLATE_TAGS: Record<string, string> = {
  // Empty for now
};

export const VI_PROMPT_TEMPLATE_COPY: Record<string, any> = {
  // Empty for now
};
