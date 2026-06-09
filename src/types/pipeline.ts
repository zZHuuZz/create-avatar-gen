export type PoseKey = 'hands-clasped' | 'arms-at-sides' | 'arms-crossed' | 'custom';

export type SceneStatus = 'pending' | 'submitting' | 'generating' | 'done' | 'error';

export interface SceneResult {
  index: number;
  label: string;
  status: SceneStatus;
  progress: number;
  jobId?: string;
  frampackUrl?: string;
  error?: string;
  elapsedMs?: number; // wall-clock time from job submit to done — for comparing step counts etc.
}

export interface PoseStageConfig {
  prompt: string;
  negativePrompt: string;
  duration: number;
  guidanceScale?: number; // overrides the route default for this stage
}

export interface PoseConfig {
  posePrompt: string;
  referenceImageFile?: string; // filename under public/poses/, e.g. 'reference-onehand.jpg'
  stageInto: PoseStageConfig;
  stageHold: PoseStageConfig;
  stageOut: PoseStageConfig;
}

export interface SceneConfig {
  index: number;
  label: string;
  prompt: string;
  negativePrompt: string;
  duration: number;
  seedOffset: number;
  hasArm: boolean;
  useEndImage: boolean;
  poseConfig?: PoseConfig;
  variantGroup?: string; // scenes sharing this tag are interchangeable variants of one gesture
}

export type StageKey = 'into' | 'hold' | 'out';

export interface StageResult {
  key: StageKey;
  label: string;
  status: SceneStatus;
  progress: number;
  jobId?: string;
  frampackUrl?: string;
  error?: string;
}

export interface PosedSceneResult {
  sceneIndex: number;
  label: string;
  poseImageBase64?: string;
  poseStatus: 'pending' | 'generating' | 'done' | 'error';
  poseError?: string;
  stages: StageResult[];
  merging: boolean;
  mergedVideoUrl?: string;
  mergeError?: string;
}

export type AppStep = 1 | 2 | 3;

export interface GenerateVideoRequest {
  imageBase64: string;
  frampackUrl: string;
  scenes: 'quick' | 'all';
  baseSeed: number;
  sceneIndex?: number;
}

export interface GeneratePosedVideoRequest {
  imageBase64: string;       // AI-generated avatar — used as FramePack start/end frames
  portraitBase64: string;    // original uploaded portrait — used as pose generation source
  poseImageBase64?: string;  // pre-generated pose image — skips GPT call if provided
  frampackUrl: string;
  baseSeed: number;
  sceneIndex: number;
  stageOnly?: StageKey;      // if set, only run this one stage (skips the others)
}

export type SSEEvent =
  | { type: 'scene-start'; sceneIndex: number; label: string }
  | { type: 'scene-progress'; sceneIndex: number; pct: number }
  | { type: 'scene-done'; sceneIndex: number; jobId: string; frampackUrl: string; elapsedMs: number }
  | { type: 'scene-error'; sceneIndex: number; error: string }
  | { type: 'all-done' }
  | { type: 'error'; message: string };

export type PosedSSEEvent =
  | { type: 'pose-generating' }
  | { type: 'pose-done'; poseImageBase64: string }
  | { type: 'pose-error'; error: string }
  | { type: 'stage-start'; stage: StageKey }
  | { type: 'stage-progress'; stage: StageKey; pct: number }
  | { type: 'stage-done'; stage: StageKey; jobId: string; frampackUrl: string }
  | { type: 'stage-error'; stage: StageKey; error: string }
  | { type: 'all-done' }
  | { type: 'error'; message: string };
