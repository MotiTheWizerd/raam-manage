export type SpriteKey = 'squid' | 'crab' | 'octopus'
export type SpriteFrame = readonly string[]

export const SPRITES: Record<SpriteKey, readonly [SpriteFrame, SpriteFrame]> = {
  squid: [
    [
      '..XXXX..',
      '.XXXXXX.',
      'XXXXXXXX',
      'XX.XX.XX',
      'XXXXXXXX',
      '.X.XX.X.',
      'X......X',
      '.X....X.',
    ],
    [
      '..XXXX..',
      '.XXXXXX.',
      'XXXXXXXX',
      'XX.XX.XX',
      'XXXXXXXX',
      '..X..X..',
      '.X.XX.X.',
      'X.X..X.X',
    ],
  ],
  crab: [
    [
      '.X......X.',
      '..X....X..',
      '.XXXXXXXX.',
      'XX.XX.XX.X',
      'XXXXXXXXXX',
      '.XXXXXXXX.',
      'X.X....X.X',
      '..X....X..',
    ],
    [
      'X........X',
      '.XX....XX.',
      '.XXXXXXXX.',
      'XX.XX.XX.X',
      'XXXXXXXXXX',
      '.XXXXXXXX.',
      '..XX..XX..',
      '.X......X.',
    ],
  ],
  octopus: [
    [
      '..XXXXXXXX..',
      '.XXXXXXXXXX.',
      'XX.XX.XX.XXX',
      'XXXXXXXXXXXX',
      '.XXXXXXXXXX.',
      '..XXXXXXXX..',
      '..X..XX..X..',
      '.X..X..X..X.',
    ],
    [
      '..XXXXXXXX..',
      '.XXXXXXXXXX.',
      'XX.XX.XX.XXX',
      'XXXXXXXXXXXX',
      '.XXXXXXXXXX.',
      '..XXXXXXXX..',
      '.X..X..X..X.',
      'X..X....X..X',
    ],
  ],
}

export type RowConfig = { key: SpriteKey; color: string }

export const ROW_CONFIG: readonly RowConfig[] = [
  { key: 'squid',   color: '#e879f9' },
  { key: 'crab',    color: '#a78bfa' },
  { key: 'crab',    color: '#38bdf8' },
  { key: 'octopus', color: '#34d399' },
  { key: 'octopus', color: '#fbbf24' },
]

export const SPRITE_PIXEL = 2
export const SPRITE_H_CELLS = 8
export const MAX_SPRITE_W_CELLS = 12

// player cannon — 11×5 cells at 4px = 44×20, exactly PLAYER_W × PLAYER_H
export const PLAYER_SPRITE: SpriteFrame = [
  '.....X.....',
  '....XXX....',
  '....XXX....',
  '.XXXXXXXXX.',
  'XXXXXXXXXXX',
]
export const PLAYER_PIXEL = 4
export const PLAYER_COLOR = '#22d3ee'
