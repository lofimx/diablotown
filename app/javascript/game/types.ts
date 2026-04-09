export interface HellTownConfig {
  user: { username: string; character_class: CharacterClass; last_map_id?: number | null; last_x?: number | null; last_y?: number | null } | null;
  maps?: Array<{ id: number; name: string; tileset: string; video_mode: VideoMode }>;
  map?: GameMapData;
  csrfToken: string;
}

export type VideoMode = "proximity" | "explicit";

export interface GameMapData {
  id: number;
  name: string;
  width: number;
  height: number;
  tile_data: string | null;
  spawn_x: number;
  spawn_y: number;
  tileset: string;
  video_mode: VideoMode;
}

export interface Player {
  username: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  direction: Direction;
  moving: boolean;
  attacking: boolean;
  characterClass: CharacterClass;
  animFrame: number;
}

export type CharacterClass = "warrior" | "rogue" | "sorcerer" | "monk";
export const CHARACTER_CLASSES: CharacterClass[] = ["warrior", "rogue", "sorcerer"];

export type Direction = "s" | "sw" | "w" | "nw" | "n" | "ne" | "e" | "se";
export const DIRECTIONS: Direction[] = ["s", "sw", "w", "nw", "n", "ne", "e", "se"];

// Direction index for sprite sheet rows (S=0, SW=1, W=2, NW=3, N=4, NE=5, E=6, SE=7)
export const DIR_TO_ROW: Record<Direction, number> = {
  s: 0, sw: 1, w: 2, nw: 3, n: 4, ne: 5, e: 6, se: 7,
};

// ─── Isometric tile constants ───
// The isometric diamond dimensions (floor footprint on screen)
export const ISO_TILE_W = 128;
export const ISO_TILE_H = 64;

// The tileset cell stride in the sprite sheet (content + 1px separator)
export const TILESET_CELL_W = 129;
export const TILESET_CELL_H = 193;

// Actual tile content size (excluding the 1px separator)
export const TILE_CONTENT_W = 128;
export const TILE_CONTENT_H = 192;

// ─── Character sprite layout ───
// Section 1 (attack/idle): 128×128 frames, 8 rows; col 0 = idle pose, cols 1-16 = attack
export const ATTACK_FRAME_SIZE = 128;
export const ATTACK_SECTION_Y = 7;      // y offset of first attack row
export const ATTACK_ROW_STRIDE = 129;   // 128px frame + 1px separator
export const ATTACK_COL_STRIDE = 129;   // 128px frame + 1px separator
export const ATTACK_FRAME_COUNT = 16;

// Section 2 has multiple animation groups side by side (separated by green lines):
//   Group 1: idle standing (starts at x=0)
//   Group 2: attack
//   Group 3: walk (with weapon)
//   Group 4: walk in town (casual)

// Idle: 96×96 frames in section 2, group 1 (starts at x=0)
// ~764px wide / 8 frames ≈ 96px per frame
export const IDLE_FRAME_SIZE = 96;
export const IDLE_SECTION_Y = 1045;     // y offset (same section as walk)
export const IDLE_ROW_STRIDE = 97;      // 96px frame + 1px row separator
export const IDLE_COL_STRIDE = 96;      // no column separator
export const IDLE_FRAME_COUNT = 8;

// Walk: 96×96 frames in section 2, group 4 (walk-in-town)
export const WALK_FRAME_SIZE = 96;
export const WALK_SECTION_Y = 1045;     // y offset of first walk row
export const WALK_ROW_STRIDE = 97;      // 96px frame + 1px row separator
export const WALK_COL_STRIDE = 96;      // no column separator in walk section
export const WALK_FRAME_COUNT = 8;
// Walk start X is auto-detected per class (varies: warrior=961, rogue=768, etc.)

// Sprite sheet file for each class
export const CLASS_SPRITE_FILE: Record<CharacterClass, string> = {
  warrior: "/game/sprites/warrior/warrior_light_armor_sword.png",
  rogue: "/game/sprites/rogue/rogue_heavy_armor_two_swords.png",
  sorcerer: "/game/sprites/sorcerer/sorcerer_light_armor_staff.png",
  monk: "/game/sprites/monk/monk_light_armor_staff.png",
};

export interface MediaSettings {
  micEnabled: boolean;
  videoEnabled: boolean;
}

declare global {
  interface Window {
    __HELLTOWN__: HellTownConfig;
    __HELLTOWN_SETTINGS__: MediaSettings;
  }
}
