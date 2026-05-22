import { useEffect, useRef } from 'react';
import {
  anonymizeArtifactId,
  artifactKindToTracking,
  type TrackingProjectKind,
} from '@open-design/contracts/analytics';
import { useAnalytics } from '../analytics/provider';
import { trackStudioViewArtifact } from '../analytics/events';
import { artifactRendererRegistry } from '../artifacts/renderer-registry';
import type { ProjectFile, PreviewComment, ChatCommentAttachment, PreviewCommentTarget } from '../types';
import { isRenderableSketchJson } from './SketchPreview';

import {
  HtmlViewer,
  ReactComponentViewer,
  MarkdownViewer,
  SvgViewer,
  ImageViewer,
  VideoViewer,
  AudioViewer,
  SketchViewer,
  TextViewer,
  DocumentPreviewViewer,
  BinaryViewer,
} from './file-viewer';

// Re-export everything from file-viewer to keep full backward compatibility
export * from './file-viewer';

interface Props {
  projectId: string;
  projectKind: TrackingProjectKind;
  file: ProjectFile;
  liveHtml?: string;
  filesRefreshKey?: number;
  isDeck?: boolean;
  onExportAsPptx?: ((fileName: string) => void) | undefined;
  streaming?: boolean;
  previewComments?: PreviewComment[];
  onSavePreviewComment?: (target: PreviewCommentTarget, note: string, attachAfterSave: boolean) => Promise<PreviewComment | null>;
  onRemovePreviewComment?: (commentId: string) => Promise<void>;
  onSendBoardCommentAttachments?: (attachments: ChatCommentAttachment[]) => Promise<void> | void;
  onFileSaved?: () => Promise<void> | void;
  onSelectionChange?: (text: string) => void;
}

export function FileViewer({
  projectId,
  projectKind,
  file,
  liveHtml,
  filesRefreshKey = 0,
  isDeck,
  onExportAsPptx,
  streaming,
  previewComments = [],
  onSavePreviewComment,
  onRemovePreviewComment,
  onSendBoardCommentAttachments,
  onFileSaved,
  onSelectionChange,
}: Props) {
  const rendererMatch = artifactRendererRegistry.resolve({
    file,
    isDeckHint: Boolean(isDeck),
  });

  // studio_view artifact — fire once per (project, file) pair so the
  // activation funnel can attribute "user opened the produced artifact"
  // even when the sub-viewer below is HtmlViewer / MarkdownViewer / etc.
  // artifact_id is anonymized to satisfy the CSV's no-filename rule.
  const analytics = useAnalytics();
  const studioViewKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = `${projectId}::${file.name}`;
    if (studioViewKeyRef.current === key) return;
    studioViewKeyRef.current = key;
    trackStudioViewArtifact(analytics.track, {
      page: 'studio',
      area: 'artifact',
      element: 'artifact_view',
      view_type: 'artifact',
      artifact_id: anonymizeArtifactId({ projectId, fileName: file.name }),
      artifact_kind: artifactKindToTracking({
        rendererId: rendererMatch?.renderer.id ?? null,
        fileKind: file.kind ?? null,
      }),
      project_id: projectId,
      project_kind: projectKind,
    });
  }, [projectId, projectKind, file.name, file.kind, rendererMatch?.renderer.id, analytics.track]);

  if (rendererMatch?.renderer.id === 'html' || rendererMatch?.renderer.id === 'deck-html') {
    return (
      <HtmlViewer
        projectId={projectId}
        projectKind={projectKind}
        file={file}
        liveHtml={liveHtml}
        filesRefreshKey={filesRefreshKey}
        isDeck={rendererMatch.renderer.id === 'deck-html'}
        onExportAsPptx={onExportAsPptx}
        streaming={Boolean(streaming)}
        previewComments={previewComments}
        onSavePreviewComment={onSavePreviewComment}
        onRemovePreviewComment={onRemovePreviewComment}
        onSendBoardCommentAttachments={onSendBoardCommentAttachments}
        onFileSaved={onFileSaved}
        onSelectionChange={onSelectionChange}
      />
    );
  }
  if (rendererMatch?.renderer.id === 'react-component') {
    return <ReactComponentViewer projectId={projectId} file={file} />;
  }
  if (rendererMatch?.renderer.id === 'markdown') {
    return <MarkdownViewer projectId={projectId} file={file} />;
  }
  if (rendererMatch?.renderer.id === 'svg') {
    return <SvgViewer projectId={projectId} file={file} />;
  }
  if (file.kind === 'image') {
    return <ImageViewer projectId={projectId} file={file} />;
  }
  if (file.kind === 'video') {
    return <VideoViewer projectId={projectId} file={file} />;
  }
  if (file.kind === 'audio') {
    return <AudioViewer projectId={projectId} file={file} />;
  }
  if (file.kind === 'sketch') {
    if (isRenderableSketchJson(file)) {
      return <SketchViewer projectId={projectId} file={file} />;
    }
    return <ImageViewer projectId={projectId} file={file} />;
  }
  if (file.kind === 'text' || file.kind === 'code') {
    return <TextViewer projectId={projectId} file={file} />;
  }
  if (
    file.kind === 'pdf' ||
    file.kind === 'document' ||
    file.kind === 'presentation' ||
    file.kind === 'spreadsheet'
  ) {
    return (
      <DocumentPreviewViewer
        projectId={projectId}
        file={file}
        streaming={Boolean(streaming)}
        previewComments={previewComments}
        onSavePreviewComment={onSavePreviewComment}
        onRemovePreviewComment={onRemovePreviewComment}
        onSendBoardCommentAttachments={onSendBoardCommentAttachments}
        onSelectionChange={onSelectionChange}
      />
    );
  }
  return <BinaryViewer projectId={projectId} file={file} />;
}
