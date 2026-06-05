import type { WorkflowSession } from '@/types';
import type { LingjiEntry } from '@/lib/account-presets';
import { InspirationStepWidget } from './widgets/InspirationStepWidget';
import { CopywritingStepWidget } from './widgets/CopywritingStepWidget';
import { ImageStepWidget } from './widgets/ImageStepWidget';
import { ImageEditorStepWidget } from './widgets/ImageEditorStepWidget';
import { TtsStepWidget } from './widgets/TtsStepWidget';
import { VideoStepWidget } from './widgets/VideoStepWidget';
import { DigitalHumanStepWidget } from './widgets/DigitalHumanStepWidget';
import { AdsStepWidget } from './widgets/AdsStepWidget';
import { HotspotStepWidget } from './widgets/HotspotStepWidget';
import { PublishStepWidget } from './widgets/PublishStepWidget';

export interface StepWidgetProps {
  session: WorkflowSession;
  handoff: Record<string, string>;
  onComplete: (data: {
    handoffData: Record<string, string>;
    outputContentId?: string;
  }) => Promise<void>;
  isCompleting: boolean;
  autoExecute?: boolean;
  onAutoError?: (error: string) => void;
}

type StepWidgetComponent = React.ComponentType<StepWidgetProps>;

const STEP_WIDGET_MAP: Record<LingjiEntry, StepWidgetComponent> = {
  '/inspiration': InspirationStepWidget,
  '/ai/copywriting': CopywritingStepWidget,
  '/ai/image': ImageStepWidget,
  '/ai/image-editor': ImageEditorStepWidget,
  '/ai/tts': TtsStepWidget,
  '/ai/video': VideoStepWidget,
  '/ai/digital-human': DigitalHumanStepWidget,
  '/ai/ads': AdsStepWidget,
  '/hotspot': HotspotStepWidget,
  '/publish': PublishStepWidget,
};

export function getStepWidget(entry: string): StepWidgetComponent | null {
  return (STEP_WIDGET_MAP as Record<string, StepWidgetComponent>)[entry] || null;
}
