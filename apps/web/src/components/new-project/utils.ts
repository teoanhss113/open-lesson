import type { Dict } from '../../i18n/types';
import {
  AUDIO_DURATIONS_SEC,
  findProvider,
  IMAGE_MODELS,
  MEDIA_ASPECTS,
  type MediaModel,
  VIDEO_MODELS,
} from '../../media/models';
import type {
  AudioKind,
  DesignSystemSummary,
  MediaAspect,
  ProjectKind,
  ProjectMetadata,
  ProjectPlatform,
  ProjectTemplate,
} from '../../types';
import type {
  CreateTab,
  CurriculumKind,
  MediaSurface,
  NewProjectPlatform,
  PromptTemplatePick,
  TranslateFn,
} from './types';

export const SFX_AUDIO_DURATIONS_SEC = AUDIO_DURATIONS_SEC.filter((sec) => sec <= 30);

export const DESIGN_PLATFORMS: Array<{
  value: NewProjectPlatform;
  labelKey: keyof Dict;
  hintKey: keyof Dict;
}> = [
  {
    value: 'responsive',
    labelKey: 'newproj.platform.responsive.label',
    hintKey: 'newproj.platform.responsive.hint',
  },
  {
    value: 'web-desktop',
    labelKey: 'newproj.platform.webDesktop.label',
    hintKey: 'newproj.platform.webDesktop.hint',
  },
  {
    value: 'mobile-ios',
    labelKey: 'newproj.platform.mobileIos.label',
    hintKey: 'newproj.platform.mobileIos.hint',
  },
  {
    value: 'mobile-android',
    labelKey: 'newproj.platform.mobileAndroid.label',
    hintKey: 'newproj.platform.mobileAndroid.hint',
  },
  {
    value: 'tablet',
    labelKey: 'newproj.platform.tablet.label',
    hintKey: 'newproj.platform.tablet.hint',
  },
  {
    value: 'desktop-app',
    labelKey: 'newproj.platform.desktopApp.label',
    hintKey: 'newproj.platform.desktopApp.hint',
  },
];

export const TAB_LABEL_KEYS: Record<CreateTab, keyof Dict> = {
  prototype: 'newproj.tabPrototype',
  'live-artifact': 'newproj.tabLiveArtifact',
  deck: 'newproj.tabDeck',
  template: 'newproj.tabTemplate',
  media: 'newproj.tabMedia',
  other: 'newproj.tabOther',
};

export const MEDIA_SURFACE_LABEL_KEYS: Record<MediaSurface, keyof Dict> = {
  image: 'newproj.surfaceImage',
  video: 'newproj.surfaceVideo',
  audio: 'newproj.surfaceAudio',
};

export const CURRICULUM_KIND_LABEL_KEYS: Record<CurriculumKind, keyof Dict> = {
  syllabus: 'newproj.curriculumKind.syllabus',
  'lesson-plan': 'newproj.curriculumKind.lessonPlan',
  'teaching-guide': 'newproj.curriculumKind.teachingGuide',
  slides: 'newproj.curriculumKind.slides',
  material: 'newproj.curriculumKind.material',
  homework: 'newproj.curriculumKind.homework',
  'curriculum-review': 'newproj.curriculumKind.curriculumReview',
  'rollout-validation': 'newproj.curriculumKind.rolloutValidation',
};

export function formatPickAndImportErrorDetails(details: unknown): string | undefined {
  if (typeof details === 'string' && details.length > 0) return details;
  if (details == null || typeof details !== 'object') return undefined;
  const record = details as Record<string, unknown>;
  const error = record.error;
  if (error != null && typeof error === 'object') {
    const errRecord = error as Record<string, unknown>;
    const message = errRecord.message;
    const nestedDetails = errRecord.details;
    if (typeof message === 'string' && message.length > 0) {
      if (nestedDetails != null && typeof nestedDetails === 'object') {
        const nestedReason = (nestedDetails as Record<string, unknown>).reason;
        if (typeof nestedReason === 'string' && nestedReason.length > 0) {
          return `${message} (${nestedReason})`;
        }
      }
      return message;
    }
  }
  return undefined;
}

export function defaultDesignSystemSelection(
  defaultDesignSystemId: string | null,
  designSystems: DesignSystemSummary[],
): string[] {
  if (!defaultDesignSystemId) return [];
  return designSystems.some((d) => d.id === defaultDesignSystemId)
    ? [defaultDesignSystemId]
    : [];
}

export function buildDesignSystemCreateSelection(
  showDesignSystemPicker: boolean,
  selectedIds: string[],
): { primary: string | null; inspirations: string[] } {
  return showDesignSystemPicker
    ? {
        primary: selectedIds[0] ?? null,
        inspirations: selectedIds.slice(1),
      }
    : { primary: null, inspirations: [] };
}

export function fallbackSwatches(seed: string): string[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const base = h % 360;
  return [
    `hsl(${base}, 18%, 96%)`,
    `hsl(${(base + 90) % 360}, 22%, 78%)`,
    `hsl(${(base + 180) % 360}, 30%, 32%)`,
    `hsl(${(base + 30) % 360}, 70%, 52%)`,
  ];
}

export function supportedModels(surface: 'image' | 'video' | 'audio', models: MediaModel[]): MediaModel[] {
  const supportedProviders: Record<'image' | 'video' | 'audio', Set<string>> = {
    image: new Set(['openai', 'volcengine', 'grok', 'nanobanana']),
    video: new Set(['volcengine', 'hyperframes', 'grok']),
    audio: new Set(['minimax', 'fishaudio', 'senseaudio', 'elevenlabs', 'openai', 'volcengine']),
  };
  return models.filter((model) => {
    const provider = findProvider(model.provider);
    return provider?.integrated === true && supportedProviders[surface].has(model.provider);
  });
}

export function normalizeSelectedPlatforms(platforms: NewProjectPlatform[]): NewProjectPlatform[] {
  const seen = new Set<NewProjectPlatform>();
  for (const platform of platforms) {
    if (DESIGN_PLATFORMS.some((option) => option.value === platform)) {
      seen.add(platform);
    }
  }
  return seen.size > 0 ? [...seen] : ['responsive'];
}

export function platformTargetsSupportOsWidgets(platforms: ProjectPlatform[] | NewProjectPlatform[]): boolean {
  return platforms.some((platform) =>
    platform === 'mobile-ios'
    || platform === 'mobile-android'
    || platform === 'tablet',
  );
}

export function platformTargetsFor(platforms: NewProjectPlatform[]): ProjectPlatform[] {
  const targets = new Set<ProjectPlatform>();
  for (const platform of platforms) {
    switch (platform) {
      case 'responsive':
        targets.add('responsive');
        break;
      case 'web-desktop':
        targets.add('web-desktop');
        break;
      case 'mobile-ios':
        targets.add('mobile-ios');
        break;
      case 'mobile-android':
        targets.add('mobile-android');
        break;
      case 'tablet':
        targets.add('tablet');
        break;
      case 'desktop-app':
        targets.add('desktop-app');
        break;
      default: {
        const exhaustive: never = platform;
        targets.add(exhaustive);
      }
    }
  }
  return targets.size > 0 ? [...targets] : ['responsive'];
}

export function buildPromptTemplateMetadata(
  pick: PromptTemplatePick | null,
): { promptTemplate?: ProjectMetadata['promptTemplate'] } {
  if (!pick) return {};
  const trimmed = pick.prompt.trim();
  if (trimmed.length === 0) return {};
  const { summary } = pick;
  return {
    promptTemplate: {
      id: summary.id,
      surface: summary.surface,
      title: summary.title,
      prompt: trimmed,
      summary: summary.summary || undefined,
      category: summary.category || undefined,
      tags: summary.tags && summary.tags.length > 0 ? summary.tags : undefined,
      model: summary.model,
      aspect: summary.aspect,
      source: summary.source
        ? {
            repo: summary.source.repo,
            license: summary.source.license,
            author: summary.source.author,
            url: summary.source.url,
          }
        : undefined,
    },
  };
}

export function buildMetadata(input: {
  tab: CreateTab;
  mediaSurface: MediaSurface;
  fidelity: 'wireframe' | 'high-fidelity';
  platformTargets: NewProjectPlatform[];
  includeLandingPage: boolean;
  includeOsWidgets: boolean;
  speakerNotes: boolean;
  animations: boolean;
  templateId: string | null;
  templates: ProjectTemplate[];
  imageModel: string;
  imageAspect: MediaAspect;
  videoModel: string;
  videoAspect: MediaAspect;
  videoLength: number;
  audioKind: AudioKind;
  audioModel: string;
  audioDuration: number;
  voice: string;
  inspirationIds: string[];
  promptTemplate: PromptTemplatePick | null;
  curriculumKind?: CurriculumKind;
  courseName?: string;
  moduleName?: string;
  lessonTitle?: string;
  ageGroup?: string;
  level?: string;
  curriculumVersion?: string;
}): ProjectMetadata {
  const kind: ProjectKind =
    input.tab === 'live-artifact'
      ? 'prototype'
      : input.tab === 'media'
        ? input.mediaSurface
        : input.tab;
  const selectedPlatforms = normalizeSelectedPlatforms(input.platformTargets);
  const concreteTargets = platformTargetsFor(selectedPlatforms);
  const canIncludeOsWidgets = platformTargetsSupportOsWidgets(concreteTargets);
  const surfaceOptions = {
    ...(input.includeLandingPage ? { includeLandingPage: true } : {}),
    ...(input.includeOsWidgets && canIncludeOsWidgets ? { includeOsWidgets: true } : {}),
  };
  const base = {
    platform: selectedPlatforms[0],
    platformTargets: concreteTargets,
    ...surfaceOptions,
  };
  const inspirations = input.inspirationIds.length > 0
    ? { inspirationDesignSystemIds: input.inspirationIds }
    : {};
  if (input.tab === 'prototype' || input.tab === 'live-artifact') {
    return {
      kind,
      ...base,
      fidelity: input.tab === 'live-artifact' ? 'high-fidelity' : input.fidelity,
      ...(input.tab === 'live-artifact' ? { intent: 'live-artifact' as const } : {}),
      ...inspirations,
      curriculumKind: input.curriculumKind,
      courseName: input.courseName,
      moduleName: input.moduleName,
      lessonTitle: input.lessonTitle,
      ageGroup: input.ageGroup,
      level: input.level,
      curriculumVersion: input.curriculumVersion,
      curriculumStatus: 'draft',
    };
  }

  if (input.tab === 'deck') {
    return { kind, speakerNotes: input.speakerNotes, ...inspirations };
  }
  if (input.tab === 'template') {
    if (input.templateId == null) {
      return { kind, ...base, animations: input.animations, ...inspirations };
    }
    const tpl = input.templates.find((x) => x.id === input.templateId);
    return {
      kind,
      ...base,
      animations: input.animations,
      templateId: input.templateId,
      templateLabel: tpl?.name ?? 'Saved template',
      ...inspirations,
    };
  }
  if (input.tab === 'media') {
    if (input.mediaSurface === 'image') {
      return {
        kind,
        imageModel: input.imageModel,
        imageAspect: input.imageAspect,
        ...buildPromptTemplateMetadata(input.promptTemplate),
        ...inspirations,
      };
    }
    if (input.mediaSurface === 'video') {
      return {
        kind,
        videoModel: input.videoModel,
        videoAspect: input.videoAspect,
        videoLength: input.videoLength,
        ...buildPromptTemplateMetadata(input.promptTemplate),
        ...inspirations,
      };
    }
    return {
      kind,
      audioKind: input.audioKind,
      audioModel: input.audioModel,
      audioDuration: input.audioDuration,
      ...(input.audioKind === 'speech' && input.voice.trim()
        ? { voice: input.voice.trim() }
        : {}),
      ...inspirations,
    };
  }
  return { kind: 'other', ...base, ...inspirations };
}

export function inferUnifiedCreateSurface(text: string): {
  tab: CreateTab;
  mediaSurface: MediaSurface;
  curriculumKind?: CurriculumKind;
} {
  const value = text.trim().toLowerCase();
  if (!value) return { tab: 'live-artifact', mediaSurface: 'image' };

  const has = (pattern: RegExp) => pattern.test(value);
  const curriculumKind: CurriculumKind | undefined =
    has(/\b(homework|worksheet|exercise|assignment)\b|bài tập|bai tap/i)
      ? 'homework'
      : has(/\b(slides?|deck|ppt|powerpoint)\b|slide|bài giảng|bai giang/i)
        ? 'slides'
        : has(/\b(teaching guide|teacher guide)\b|giáo án dạy|giao an day/i)
          ? 'teaching-guide'
          : has(/\b(review|validation|rollout)\b|rà soát|ra soat|thẩm định|tham dinh/i)
            ? 'curriculum-review'
            : undefined;

  if (has(/\b(video|mp4|movie|clip)\b/i)) return { tab: 'media', mediaSurface: 'video', curriculumKind };
  if (has(/\b(audio|voice|speech|podcast|mp3|sound)\b/i)) return { tab: 'media', mediaSurface: 'audio', curriculumKind };
  if (has(/\b(image|poster|illustration|thumbnail|cover)\b|ảnh|anh minh họa|anh minh hoa/i)) {
    return { tab: 'media', mediaSurface: 'image', curriculumKind };
  }
  if (has(/\b(template|starter)\b|mẫu|mau/i)) return { tab: 'template', mediaSurface: 'image', curriculumKind };
  if (has(/\b(slides?|deck|ppt|powerpoint)\b|slide|bài giảng|bai giang/i)) {
    return { tab: 'deck', mediaSurface: 'image', curriculumKind };
  }
  if (
    has(/\b(web|website|prototype|html|interactive|quiz|simulator|calculator)\b|trực quan|tuong tac|tương tác|làm bài tập|lam bai tap|trắc nghiệm|trac nghiem/i)
  ) {
    return { tab: 'prototype', mediaSurface: 'image', curriculumKind };
  }
  if (has(/\b(other|misc|freeform)\b|khác|khac/i)) return { tab: 'other', mediaSurface: 'image', curriculumKind };
  return { tab: 'live-artifact', mediaSurface: 'image', curriculumKind };
}

export function titleForTab(
  tab: CreateTab,
  mediaSurface: MediaSurface,
  t: TranslateFn,
): string {
  switch (tab) {
    case 'prototype':
      return t('newproj.titlePrototype');
    case 'live-artifact':
      return t('newproj.titleLiveArtifact');
    case 'deck':
      return t('newproj.titleDeck');
    case 'template':
      return t('newproj.titleTemplate');
    case 'media': {
      const key: keyof Dict =
        mediaSurface === 'image'
          ? 'newproj.titleImage'
          : mediaSurface === 'video'
            ? 'newproj.titleVideo'
            : 'newproj.titleAudio';
      return t(key);
    }
    case 'other':
      return t('newproj.titleOther');
  }
}

export function autoName(
  tab: CreateTab,
  mediaSurface: MediaSurface,
  t: TranslateFn,
): string {
  const stamp = new Date().toLocaleDateString();
  const labelKey: keyof Dict =
    tab === 'media' ? MEDIA_SURFACE_LABEL_KEYS[mediaSurface] : TAB_LABEL_KEYS[tab];
  return `${t(labelKey)} · ${stamp}`;
}

export function autoCurriculumWorkspaceName(t: TranslateFn): string {
  const stamp = new Date().toLocaleDateString();
  return `${t('newproj.titleCurriculumWorkspace')} · ${stamp}`;
}

export function defaultCurriculumWorkspaceSkillId(skills: Array<{ id: string; mode?: string; defaultFor?: string[]; name?: string }>): string | null {
  const byId = (...ids: string[]) => {
    for (const id of ids) {
      const skill = skills.find((s) => s.id === id);
      if (skill) return skill.id;
    }
    return null;
  };
  const curriculumSkill = byId(
    'lesson-plan-generator',
    'teaching-guide-generator',
    'curriculum-analysis',
    'curriculum-review',
  );
  if (curriculumSkill) return curriculumSkill;
  const liveArtifact = skills.find((s) => s.id === 'live-artifact' || s.name === 'live-artifact');
  if (liveArtifact) return liveArtifact.id;
  const prototypes = skills.filter((s) => s.mode === 'prototype');
  return prototypes.find((s) => s.defaultFor?.includes('prototype'))?.id
    ?? prototypes[0]?.id
    ?? null;
}

export function defaultUnifiedCreateSkillId(
  skills: Array<{ id: string; mode?: string; surface?: string; defaultFor?: string[]; name?: string }>,
  tab: CreateTab,
  mediaSurface: MediaSurface,
): string | null {
  const byId = (...ids: string[]) => {
    for (const id of ids) {
      const skill = skills.find((s) => s.id === id);
      if (skill) return skill.id;
    }
    return null;
  };

  if (tab === 'live-artifact') return defaultCurriculumWorkspaceSkillId(skills);
  if (tab === 'prototype') {
    return byId('web-prototype')
      ?? skills.find((s) => s.defaultFor?.includes('prototype') && s.surface === 'web')?.id
      ?? skills.find((s) => s.mode === 'prototype' && s.surface === 'web')?.id
      ?? skills.find((s) => s.defaultFor?.includes('prototype'))?.id
      ?? skills.find((s) => s.mode === 'prototype')?.id
      ?? defaultCurriculumWorkspaceSkillId(skills);
  }
  if (tab === 'deck') {
    return skills.find((s) => s.defaultFor?.includes('deck'))?.id
      ?? skills.find((s) => s.mode === 'deck')?.id
      ?? null;
  }
  if (tab === 'template') {
    return skills.find((s) => s.defaultFor?.includes('template'))?.id
      ?? skills.find((s) => s.mode === 'template')?.id
      ?? null;
  }
  if (tab === 'media') {
    return skills.find((s) => s.surface === mediaSurface)?.id
      ?? skills.find((s) => s.mode === mediaSurface)?.id
      ?? null;
  }
  return null;
}
