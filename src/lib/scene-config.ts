import type { SceneConfig } from '@/types/pipeline';

const BASE_NEGATIVE =
  'completely closed eyes, eyes shut, eyes looking away, eyes wandering, looking off camera, side glance, eye movement, eyes drifting, eyes rolling, jerky, sudden movement, blurry, low quality, deformed, distorted, artifacts, morphing, camera shake, camera movement, zoom, dolly, pan, tilt, tracking shot, walking, stepping, leg movement, running, jumping, foot movement, laughing, smiling';

// Appended to every scene prompt so FramePack keeps the gaze anchored
const EYE_ANCHOR = ' Eyes always looking directly into the camera lens, steady direct eye contact, gaze never drifting.';

const HAND_NEGATIVE = `deformed hands, extra fingers, missing fingers, malformed hands, ${BASE_NEGATIVE}`;

export const ALL_SCENES: SceneConfig[] = [
  {
    index: 0,
    label: 'Chỉ nói, không đưa tay',
    prompt:
      'Person speaks naturally to the camera. Eyes blink regularly. Hands completely still and resting. Subtle natural head movement and gentle body sway with speech rhythm. Natural facial expressions with frequent eye blinking.' + EYE_ANCHOR,
    negativePrompt: `arms raising, arms reaching, hand gestures, waving, pointing, arm movement, gesticulating, eyes wide open without blinking, ${BASE_NEGATIVE}`,
    duration: 2,
    seedOffset: 0,
    hasArm: false,
    useEndImage: true,
  },
  {
    index: 1,
    label: '2 tay B',
    prompt:
      'A person speaking to camera. Both hands make one single sharp downward press at mid-torso level — a decisive emphatic gesture like punctuating a point — then return to resting at sides. Clean and confident.' + EYE_ANCHOR,
    negativePrompt: `arms lifting up, arms sweeping sideways, arms spreading wide, one hand only, asymmetric gesture, arms staying raised, repeated movement, ${BASE_NEGATIVE}`,
    duration: 1.5,
    seedOffset: 10,
    hasArm: true,
    useEndImage: true,
  },
  {
    index: 2,
    label: '2 tay A',
    prompt:
      'A person talking to camera. Both hands make one single decisive sweep outward then return to resting. One crisp open-arm gesture, not repeated. Confident and natural.' + EYE_ANCHOR,
    negativePrompt: `repeated gesture, double movement, hands frozen, arms stay extended, static pose, ${BASE_NEGATIVE}`,
    duration: 1.5,
    seedOffset: 20,
    hasArm: true,
    useEndImage: true,
  },
  {
    index: 3,
    label: 'Chỉ vào cam',
    prompt:
      'A person speaking with strong emphasis. Right hand raises and points index finger directly forward at the camera, finger aimed straight at the viewer. Single decisive forward-pointing gesture, confident and deliberate.' + EYE_ANCHOR,
    negativePrompt: `pointing up, pointing sideways, left arm raising, two hands gesturing, multiple fingers pointing, waving, ${HAND_NEGATIVE}`,
    duration: 2,
    seedOffset: 30,
    hasArm: true,
    useEndImage: true,
  },
  {
    index: 4,
    label: 'Nói nhẹ',
    prompt:
      'Person speaking with energy and conviction. Pronounced head nod downward on stressed words. Upper body rocks forward and back with speech rhythm. Shoulders move naturally. Animated facial expressions, eyebrows raising and furrowing. Hands completely still at sides.' + EYE_ANCHOR,
    negativePrompt: `arms raising, arms reaching, hand gestures, waving, pointing, arm movement, gesticulating, eyes wide open without blinking, ${BASE_NEGATIVE}`,
    duration: 2,
    seedOffset: 40,
    hasArm: false,
    useEndImage: true,
  },
];

export const QUICK_SCENE = ALL_SCENES[0];
export const POSED_SCENE_INDICES = new Set<number>([]);
