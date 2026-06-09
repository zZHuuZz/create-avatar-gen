import type { SceneConfig } from '@/types/pipeline';

const BASE_NEGATIVE =
  'completely closed eyes, eyes shut, eyes looking away, eyes wandering, looking off camera, side glance, eye movement, eyes drifting, eyes rolling, jerky, sudden movement, blurry, low quality, deformed, distorted, artifacts, morphing, camera shake, camera movement, zoom, dolly, pan, tilt, tracking shot, walking, stepping, leg movement, running, jumping, foot movement, laughing, smiling';

// Appended to every scene prompt so FramePack keeps the gaze anchored
const EYE_ANCHOR = ' Eyes always looking directly into the camera lens, steady direct eye contact, gaze never drifting.';

const HAND_NEGATIVE = `deformed hands, extra fingers, missing fingers, malformed hands, ${BASE_NEGATIVE}`;

// Short, neutral statement of the avatar's starting hand pose (matches the asymmetric
// resting pose generated for the avatar image). Kept brief and action-first — heavier
// "everything stays the same / fixed framing" wrapper language was tried and ended up
// smothering the actual gesture instruction, producing clips where hands never moved at all.
const NATURAL_POSE_INTRO =
  'A person speaking to the camera, framed from the chest up. Both hands rest near the ' +
  'waist, close together but not touching, one slightly lower than the other, fingers ' +
  'relaxed. ';

function naturalPosePrompt(body: string): string {
  return NATURAL_POSE_INTRO + body + EYE_ANCHOR;
}

export const ALL_SCENES: SceneConfig[] = [
  {
    index: 0,
    label: 'Chỉ nói, không đưa tay',
    prompt: naturalPosePrompt(
      'Person speaks naturally and calmly, with regular eye blinking and natural facial ' +
      'expressions, gentle head movement and subtle body sway following the rhythm of ' +
      'speech. Both hands stay resting in their positions, completely relaxed and unmoving.'
    ),
    negativePrompt: `arms raising, arms reaching, hand gestures, waving, pointing, arm movement, gesticulating, eyes wide open without blinking, ${BASE_NEGATIVE}`,
    duration: 2,
    seedOffset: 0,
    hasArm: false,
    useEndImage: true,
  },
  {
    index: 2,
    label: '2 tay A',
    prompt: naturalPosePrompt(
      'Person speaks with confidence and emphasis. Both hands rise together and sweep ' +
      'outward away from each other in one crisp, decisive opening gesture, then return ' +
      'together back to their resting positions. Single confident movement, not repeated.'
    ),
    negativePrompt: `repeated gesture, double movement, hands frozen, arms stay extended, static pose, asymmetric gesture, ${BASE_NEGATIVE}`,
    duration: 1.5,
    seedOffset: 20,
    hasArm: true,
    useEndImage: true,
  },
  {
    index: 3,
    label: 'Chỉ vào cam',
    prompt: naturalPosePrompt(
      'Person speaks with strong emphasis. The low hand stays resting against the torso, ' +
      'completely still. Only the upper hand rises clearly and points the index finger ' +
      'directly forward at the camera lens in one crisp, decisive pointing motion, then ' +
      'draws back down to its resting position. Single confident movement, not repeated. ' +
      'The low hand stays still throughout.'
    ),
    negativePrompt: `pointing up, pointing sideways, lower hand moving, both hands gesturing, multiple fingers pointing, waving, ${HAND_NEGATIVE}`,
    duration: 2,
    seedOffset: 30,
    hasArm: true,
    useEndImage: true,
  },
  {
    index: 4,
    label: 'Nói nhẹ',
    prompt: naturalPosePrompt(
      'Person speaks with energy and conviction — animated facial expressions with eyebrows ' +
      'raising and furrowing, pronounced head nods on stressed words, and the upper body ' +
      'rocking gently forward and back with the rhythm of speech. Both hands stay resting in ' +
      'their positions, completely relaxed and unmoving.'
    ),
    negativePrompt: `arms raising, arms reaching, hand gestures, waving, pointing, arm movement, gesticulating, eyes wide open without blinking, ${BASE_NEGATIVE}`,
    duration: 2,
    seedOffset: 40,
    hasArm: false,
    useEndImage: true,
  },
  {
    index: 1,
    label: 'Tay tự nhiên A',
    prompt: naturalPosePrompt(
      'Person speaks naturally and casually, with emphasis. The low hand stays resting ' +
      'against the torso, completely still. Only the upper hand rises clearly up to chest ' +
      'height in one crisp, decisive emphasis gesture, then lowers back down to its resting ' +
      'position. Single confident movement, not repeated. The low hand stays still throughout.'
    ),
    negativePrompt: `repeated lifting, both hands moving, hands frozen, static pose, palm facing camera, ${HAND_NEGATIVE}`,
    duration: 2,
    seedOffset: 10,
    hasArm: true,
    useEndImage: true,
    variantGroup: 'natural-hand',
  },
  {
    index: 5,
    label: 'Tay tự nhiên B',
    prompt: naturalPosePrompt(
      'Person speaks while explaining an idea, with conviction. The low hand stays resting ' +
      'against the torso, completely still. Only the upper hand rises clearly up to chest ' +
      'height and turns palm-up in one crisp, decisive explaining gesture, then lowers back ' +
      'down to its resting position. Single confident movement, not repeated. The low hand ' +
      'stays still throughout.'
    ),
    negativePrompt: `repeated gesture, both hands moving, hands frozen, static pose, palm facing camera, ${HAND_NEGATIVE}`,
    duration: 2,
    seedOffset: 50,
    hasArm: true,
    useEndImage: true,
    variantGroup: 'natural-hand',
  },
  {
    index: 6,
    label: 'Tay tự nhiên C',
    prompt: naturalPosePrompt(
      'Person speaks with enthusiasm and emphasis. Both hands rise together clearly up to ' +
      'chest height in one crisp, decisive lifting motion, as if raising something up to ' +
      'show it, then lower back down together to their resting positions. Single confident ' +
      'movement, both hands moving together in sync, not repeated.'
    ),
    negativePrompt: `repeated lifting, asymmetric gesture, hands frozen, static pose, palm facing camera, ${HAND_NEGATIVE}`,
    duration: 2,
    seedOffset: 60,
    hasArm: true,
    useEndImage: true,
    variantGroup: 'natural-hand',
  },
];

export const QUICK_SCENE = ALL_SCENES[0];

// Scene indices that are interchangeable variants of the "natural hand movement" gesture —
// the sequencer picks among them, capping repeats and spacing them out so the video
// doesn't look like the same clip looping.
export const NATURAL_HAND_VARIANTS = ALL_SCENES.filter((s) => s.variantGroup === 'natural-hand').map((s) => s.index);
export const POSED_SCENE_INDICES = new Set<number>([]);
