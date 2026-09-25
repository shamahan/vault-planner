export type RoomGroup =
  | 'power' | 'food' | 'water' | 'living' | 'medical'
  | 'training' | 'storage' | 'crafting' | 'misc' | 'infra' | 'season'

/** The S.P.E.C.I.A.L. stat a room uses. Shown in the palette; it rules nothing. */
export type Special = 'S' | 'P' | 'E' | 'C' | 'I' | 'A' | 'L'

export type RoomKind = {
  id: string
  name: string
  group: RoomGroup
  /** Width of one build, in cells. */
  baseWidth: 1 | 3 | 6 | 9
  /** How many builds merge into one room. Final width is baseWidth * k, k <= maxMerge. */
  maxMerge: 1 | 3
  /** False only for the vault door: it is never placed, moved or deleted. */
  placeable: boolean
  special?: Special
  popRequired?: number
  glyph: string
}

export const VAULT_DOOR_TYPE = 'vault_door'
export const ELEVATOR_TYPE = 'elevator'

export const ROOM_KINDS: readonly RoomKind[] = [
  // 9 cells wide: 3 of open wasteland to the door's left, then the 6-cell door itself.
  { id: 'vault_door', name: 'Vault Door', group: 'infra', baseWidth: 9, maxMerge: 1, placeable: false, glyph: 'vault_door' },
  { id: 'elevator', name: 'Elevator', group: 'infra', baseWidth: 1, maxMerge: 1, placeable: true, glyph: 'elevator' },

  { id: 'power_generator', name: 'Power Generator', group: 'power', baseWidth: 3, maxMerge: 3, placeable: true, special: 'S', glyph: 'bolt' },
  { id: 'nuclear_reactor', name: 'Nuclear Reactor', group: 'power', baseWidth: 3, maxMerge: 3, placeable: true, special: 'S', popRequired: 60, glyph: 'reactor' },
  { id: 'ultracite_mine', name: 'Ultracite Mine', group: 'season', baseWidth: 9, maxMerge: 1, placeable: true, special: 'E', popRequired: 20, glyph: 'crystal' },

  { id: 'diner', name: 'Diner', group: 'food', baseWidth: 3, maxMerge: 3, placeable: true, special: 'A', glyph: 'cutlery' },
  { id: 'garden', name: 'Garden', group: 'food', baseWidth: 3, maxMerge: 3, placeable: true, special: 'A', popRequired: 70, glyph: 'sprout' },
  { id: 'nuka_cola_bottler', name: 'Nuka-Cola Bottler', group: 'food', baseWidth: 3, maxMerge: 3, placeable: true, special: 'E', popRequired: 100, glyph: 'bottle' },

  { id: 'water_treatment', name: 'Water Treatment', group: 'water', baseWidth: 3, maxMerge: 3, placeable: true, special: 'P', glyph: 'drop' },
  { id: 'water_purification', name: 'Water Purification', group: 'water', baseWidth: 3, maxMerge: 3, placeable: true, special: 'P', popRequired: 80, glyph: 'drop_filtered' },

  { id: 'living_room', name: 'Living Room', group: 'living', baseWidth: 3, maxMerge: 3, placeable: true, special: 'C', glyph: 'bed' },
  { id: 'storage_room', name: 'Storage Room', group: 'storage', baseWidth: 3, maxMerge: 3, placeable: true, special: 'E', popRequired: 12, glyph: 'crate' },

  { id: 'medbay', name: 'Medbay', group: 'medical', baseWidth: 3, maxMerge: 3, placeable: true, special: 'I', popRequired: 14, glyph: 'cross' },
  { id: 'science_lab', name: 'Science Lab', group: 'medical', baseWidth: 3, maxMerge: 3, placeable: true, special: 'I', popRequired: 16, glyph: 'flask' },

  { id: 'weight_room', name: 'Weight Room', group: 'training', baseWidth: 3, maxMerge: 3, placeable: true, special: 'S', popRequired: 24, glyph: 'barbell' },
  { id: 'athletics_room', name: 'Athletics Room', group: 'training', baseWidth: 3, maxMerge: 3, placeable: true, special: 'A', popRequired: 26, glyph: 'runner' },
  { id: 'armory', name: 'Armory', group: 'training', baseWidth: 3, maxMerge: 3, placeable: true, special: 'P', popRequired: 28, glyph: 'shield' },
  { id: 'classroom', name: 'Classroom', group: 'training', baseWidth: 3, maxMerge: 3, placeable: true, special: 'I', popRequired: 30, glyph: 'book' },
  { id: 'fitness_room', name: 'Fitness Room', group: 'training', baseWidth: 3, maxMerge: 3, placeable: true, special: 'E', popRequired: 35, glyph: 'pulse' },
  { id: 'lounge', name: 'Lounge', group: 'training', baseWidth: 3, maxMerge: 3, placeable: true, special: 'C', popRequired: 40, glyph: 'cup' },
  { id: 'game_room', name: 'Game Room', group: 'training', baseWidth: 3, maxMerge: 3, placeable: true, special: 'L', popRequired: 45, glyph: 'die' },

  { id: 'weapon_workshop', name: 'Weapon Workshop', group: 'crafting', baseWidth: 9, maxMerge: 1, placeable: true, popRequired: 22, glyph: 'hammer' },
  { id: 'outfit_workshop', name: 'Outfit Workshop', group: 'crafting', baseWidth: 9, maxMerge: 1, placeable: true, popRequired: 32, glyph: 'jumpsuit' },
  { id: 'theme_workshop', name: 'Theme Workshop', group: 'crafting', baseWidth: 9, maxMerge: 1, placeable: true, popRequired: 42, glyph: 'palette' },
  { id: 'ultracite_weapon_workshop', name: 'Ultracite Weapon Workshop', group: 'season', baseWidth: 9, maxMerge: 1, placeable: true, glyph: 'hammer_spark' },

  { id: 'overseers_office', name: "Overseer's Office", group: 'misc', baseWidth: 6, maxMerge: 1, placeable: true, popRequired: 18, glyph: 'desk' },
  { id: 'radio_studio', name: 'Radio Studio', group: 'misc', baseWidth: 3, maxMerge: 3, placeable: true, special: 'C', popRequired: 20, glyph: 'broadcast' },
  { id: 'barbershop', name: 'Barbershop', group: 'misc', baseWidth: 6, maxMerge: 1, placeable: true, special: 'C', popRequired: 50, glyph: 'scissors' },
]

const BY_ID = new Map(ROOM_KINDS.map((k) => [k.id, k]))

export function kindOf(id: string): RoomKind {
  const kind = BY_ID.get(id)
  if (!kind) throw new Error(`unknown room type: ${id}`)
  return kind
}

export function placeableKinds(): RoomKind[] {
  return ROOM_KINDS.filter((k) => k.placeable)
}
