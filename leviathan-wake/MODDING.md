# Modding Leviathan Wake

The entire content layer is data. Anything defined in `src/data/*.ts` can be added to or
overridden at runtime by JSON files — no build step, no code.

## Enable a mod

1. Put a JSON file in `public/mods/` (next to `example-mod.json`).
   In the Docker deployment this folder is a live volume: `leviathan-wake/public/mods/` on the NAS.
2. List it in `public/mods/manifest.json`:

```json
{ "mods": ["example-mod.json"] }
```

3. Reload the game. Loaded mods are reported in the log feed when a run starts (and in the
   browser console).

## Mod file shape

Every key is optional; entries with an existing `id` **replace** the base definition (rebalance
mods), new ids are **added**:

```json
{
  "name": "My Mod",
  "modules":   [ /* ModuleDef[]   — buildable modules incl. weapons          */ ],
  "enemies":   [ /* EnemyDef[]    — hostile archetypes                       */ ],
  "biomes":    [ /* BiomeDef[]    — terrain palettes, props, node tables     */ ],
  "research":  [ /* ResearchDef[] — tech tree nodes                          */ ],
  "incidents": [ /* IncidentDef[] — narrative events with weighted outcomes  */ ],
  "chassis":   [ /* ChassisDef[]  — hull layouts and starting loadouts       */ ],
  "unlocks":   [ /* UnlockDef[]   — Legacy shop entries                      */ ]
}
```

The authoritative schemas are the interfaces in [`src/data/types.ts`](src/data/types.ts) —
they're small and heavily commented. `public/mods/example-mod.json` adds a modded turret and a
modded enemy as a working reference.

### Useful knobs

- **ModuleDef.mesh** picks the 3D visual: `autocannon`, `railgun`, `missiles`, `mortar`, `laser`,
  `tesla`, `plasma`, `gravity`, `flak`, `reactor`, `solar`, `fusion`, `shield`, `dronebay`,
  `repairbay`, `interceptors`, `refinery`, `fuelproc`, `storage`, `fueltank`, `lab`, `medbay`,
  `quarters`, `radar`, `servos`, `bridge` — unknown keys get a generic block with your `hue`.
- **WeaponDef.kind** picks behavior + projectile: `bullet`, `rail` (hitscan), `missile` (homing),
  `laser` (hitscan beam), `tesla` (chains), `mortar` (ballistic splash), `flak` (airburst),
  `plasma`, `gravity`.
- **EnemyDef flags** compose AI: `flying`, `burrow`, `emp`, `acid`, `siege`, `range > 4` = ranged
  artillery; otherwise melee latcher.
- **BiomeDef.enemyBias / nodes / props** shape what a biome spawns; `IncidentDef.biomes` gates
  events to biomes.

## Debug handle

`window.__LW` exposes the live `Game` object (unstable API, changes freely). Handy while
developing a mod:

```js
__LW.enemies.spawnPack("glasshornet", 6);   // audition your enemy
__LW.gainRes({ ore: 500, crystal: 500 });   // sandbox resources
__LW.weather.force("dust");                 // test weather interactions
__LW.boss.spawn(2);                         // fight the Undermaw now
```
