import type { SceneConfig } from '@/types/pipeline';

const BASE_NEGATIVE =
  'completely closed eyes, eyes shut, jerky, sudden movement, blurry, low quality, deformed, distorted, artifacts, morphing, camera shake, camera movement, zoom, dolly, pan, tilt, tracking shot, walking, stepping, leg movement, running, jumping, foot movement, laughing, smiling';

const HAND_NEGATIVE = `deformed hands, extra fingers, missing fingers, malformed hands, ${BASE_NEGATIVE}`;

export const ALL_SCENES: SceneConfig[] = [
  {
    index: 0,
    label: 'Chỉ nói, không đưa tay',
    prompt:
      'Person speaks naturally to the camera. Eyes blink regularly. Hands completely still and resting. Subtle natural head movement and gentle body sway with speech rhythm. Natural facial expressions with frequent eye blinking.',
    negativePrompt: `arms raising, arms reaching, hand gestures, waving, pointing, arm movement, gesticulating, eyes wide open without blinking, ${BASE_NEGATIVE}`,
    duration: 2,
    seedOffset: 0,
    hasArm: false,
    useEndImage: true,
  },
  {
    index: 1,
    label: '1 tay',
    prompt:
      'A person speaking expressively to the camera. RIGHT hand is already raised at stomach/mid-torso level and moves continuously throughout — open palm pushes forward, wrist flicks, hand rotates and bobs with each word, fingers spread and close. Expressive ongoing talking gesture with right hand, always in motion. LEFT arm hangs completely still at side. Natural head nods and facial expressions.',
    negativePrompt: `left arm moving, both hands moving, two hands gesturing, right hand still, right hand frozen, static hand, hand lowering, arm dropping, hand touching chest, ${BASE_NEGATIVE}`,
    duration: 1.8,
    seedOffset: 10,
    hasArm: true,
    useEndImage: true,
  },
  {
    index: 2,
    label: '2 tay',
    prompt:
      'A person talking to camera. Both hands make one single decisive sweep outward then return. One crisp open-arm gesture, not repeated. Confident and natural.',
    negativePrompt: `repeated gesture, double movement, hands frozen, arms stay extended, static pose, ${BASE_NEGATIVE}`,
    duration: 1.5,
    seedOffset: 20,
    hasArm: true,
    useEndImage: true,
  },
  {
    index: 3,
    label: 'Chỉ lên trời',
    prompt:
      'A person speaking naturally. Primary motion: right hand gently pointing the index finger straight upward to the sky. Slow, steady, and deliberate pointing gesture. High quality hand anatomy.',
    negativePrompt: `left arm raising, left arm moving, both arms raised, two arms up, multiple fingers pointing, waving, deformed hands, extra fingers, fast movement, ${BASE_NEGATIVE}`,
    duration: 5,
    seedOffset: 30,
    hasArm: true,
    useEndImage: true,
    poseConfig: {
      referenceImageFile: 'reference-pointup.jpg',
      posePrompt:
        'RIGHT arm raised, right index finger pointing straight up, all other right fingers naturally curled. LEFT arm relaxed, left hand visible at lower-abdomen level in front of the body — open, loose, fingers straight, NOT making any gesture or sign. BOTH hands MUST be visible in the output. Frame waist-up, same head size as original, do NOT zoom out.',
      stageInto: {
        prompt:
          'Person makes one decisive raise of right arm, index finger pointing straight up. Single clean upward motion, does not repeat. Left arm stays still.',
        negativePrompt: `repeated movement, double gesture, multiple fingers pointing, left arm moving, both hands moving, ${HAND_NEGATIVE}`,
        duration: 0.8,
      },
      stageHold: {
        prompt:
          'Person speaking naturally to camera. Right arm raised with index finger pointing straight up. Subtle natural head movement and blinking. Arm completely still.',
        negativePrompt: `arm dropping, hand lowering, arm movement, finger curling, ${HAND_NEGATIVE}`,
        duration: 3,
      },
      stageOut: {
        prompt:
          'Person swiftly lowers right arm from pointing-up position back down to resting at side — arm fully down by end of clip. Fast single downward sweep, arm reaches neutral resting position completely. Left arm stays still.',
        negativePrompt: `repeated movement, double gesture, left arm moving, both hands moving, arm still raised, finger still pointing, ${HAND_NEGATIVE}`,
        duration: 1.5,
      },
    },
  },
  {
    index: 4,
    label: 'Nói nhẹ',
    prompt:
      'Person speaking with energy and conviction. Pronounced head nod downward on stressed words. Upper body rocks forward and back with speech rhythm. Shoulders move naturally. Animated facial expressions, eyebrows raising and furrowing. Hands completely still at sides.',
    negativePrompt: `arms raising, arms reaching, hand gestures, waving, pointing, arm movement, gesticulating, eyes wide open without blinking, ${BASE_NEGATIVE}`,
    duration: 2,
    seedOffset: 40,
    hasArm: false,
    useEndImage: true,
  },
];

export const QUICK_SCENE = ALL_SCENES[0];
export const POSED_SCENE_INDICES = new Set([3]);
