import type { ComponentType } from 'react'
import { Tetris } from './tetris/Tetris'
import { Snake } from './snake/Snake'
import { SpaceInvaders } from './space-invaders/SpaceInvaders'

export type GameStatus = 'playable' | 'wip'

export type Game = {
  id: string
  name: string
  tagline: string
  emoji: string
  accent: string
  status: GameStatus
  component: ComponentType
}

export const GAMES: ReadonlyArray<Game> = [
  {
    id: 'tetris',
    name: 'Tetris',
    tagline: 'Stack blocks, clear lines, accept gravity.',
    emoji: '🧱',
    accent: 'from-cyan-400 to-fuchsia-500',
    status: 'playable',
    component: Tetris,
  },
  {
    id: 'snake',
    name: 'Snake',
    tagline: "Eat the dots. Don't eat yourself.",
    emoji: '🐍',
    accent: 'from-emerald-400 to-lime-500',
    status: 'playable',
    component: Snake,
  },
  {
    id: 'space-invaders',
    name: 'Space Invaders',
    tagline: 'Shoot them before they reach you.',
    emoji: '👾',
    accent: 'from-fuchsia-400 to-violet-500',
    status: 'playable',
    component: SpaceInvaders,
  },
]

export function findGame(id: string): Game | undefined {
  return GAMES.find((g) => g.id === id)
}
