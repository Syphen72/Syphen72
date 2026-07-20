import type { IncidentDef } from "./types";

export const INCIDENT_DEFS: IncidentDef[] = [
  {
    id: "distress", name: "Distress Beacon", weight: 10,
    text: "A survivor beacon pulses from a wrecked crawler half-buried in the substrate. Thermal shows movement inside — could be survivors. Could be what found them.",
    choices: [
      {
        label: "Send a rescue team", detail: "Risk crew for crew.",
        outcomes: [
          { chance: 0.55, text: "Six survivors climb aboard, weeping at the sight of your hull. They know machines.", fx: { crew: 6 } },
          { chance: 0.3, text: "The wreck was a nest. Your team fights clear, dragging two wounded.", fx: { injure: 2, spawn: { id: "skitterling", count: 8 } } },
          { chance: 0.15, text: "Inside: three survivors and a working parts cache.", fx: { crew: 3, res: { alloy: 15, ore: 20 } } },
        ],
      },
      {
        label: "Salvage from range", detail: "Strip it with drones. Safe, cold.",
        outcomes: [
          { chance: 0.8, text: "Drones peel the wreck efficiently. The beacon dies mid-transmission. Nobody talks about it.", fx: { res: { ore: 35, alloy: 8 } } },
          { chance: 0.2, text: "The beacon was bait. Something screams under the sand.", fx: { spawn: { id: "burrower", count: 2 } } },
        ],
      },
      { label: "Keep walking", outcomes: [{ chance: 1, text: "The beacon fades behind you. The Leviathan does not slow.", fx: {} }] },
    ],
  },
  {
    id: "vault", name: "Ancient Vault", weight: 7, minDistance: 1200,
    text: "A geometric seam splits the bedrock — a sealed vault of the dead civilization. Your scientists are already arguing about the door.",
    choices: [
      {
        label: "Breach it", detail: "Explosives, then archaeology.",
        outcomes: [
          { chance: 0.5, text: "Intact stasis lockers. Technology beyond price.", fx: { res: { tech: 8, crystal: 40 } } },
          { chance: 0.3, text: "The vault is a tomb — and its custodian machines object to grave robbers.", fx: { spawn: { id: "huskreaver", count: 5 }, res: { tech: 3 } } },
          { chance: 0.2, text: "The breach charge cooks something volatile inside. The blast scars your flank.", fx: { damageRandom: 45, res: { tech: 2 } } },
        ],
      },
      {
        label: "Scan and log it", detail: "Knowledge without risk.",
        outcomes: [{ chance: 1, text: "Deep-scan data streams to the lab for weeks of study.", fx: { science: 60 } }],
      },
    ],
  },
  {
    id: "caravan", name: "Trade Caravan", weight: 8,
    text: "A convoy of rust-patched crawlers flies parley colors. Traders — human, mostly. Their broker climbs your boarding chain with a case of samples.",
    choices: [
      {
        label: "Trade ore for crystal", detail: "-60 ore → +45 crystal",
        outcomes: [{ chance: 1, text: "Fair rates, by wasteland standards. The broker salutes your gun decks on the way out.", fx: { res: { ore: -60, crystal: 45 } } }],
      },
      {
        label: "Trade crystal for fuel", detail: "-40 crystal → +120 fuel",
        outcomes: [{ chance: 1, text: "They pump slurry aboard while their children stare up at the legs.", fx: { res: { crystal: -40, fuel: 120 } } }],
      },
      {
        label: "Hire their mechanics", detail: "-50 ore → hull repairs",
        outcomes: [{ chance: 1, text: "Their welders know old tricks. Every module patched and humming.", fx: { res: { ore: -50 }, repairAll: 60 } }],
      },
    ],
  },
  {
    id: "derelict", name: "Abandoned Leviathan", weight: 6, minDistance: 2000,
    text: "It rises out of the haze like a dead god: another Leviathan, keeled over, spine bare to the sky. Its class predates yours. Its wounds do not look self-inflicted.",
    choices: [
      {
        label: "Board the wreck", detail: "The salvage of a lifetime, if it's empty.",
        outcomes: [
          { chance: 0.45, text: "Empty. Sad. Rich. Your teams strip alloy and a working blueprint core.", fx: { res: { alloy: 50, ore: 60, tech: 4 } } },
          { chance: 0.35, text: "The things that killed it are still nesting in the reactor bay.", fx: { spawn: { id: "ravager", count: 1 }, res: { alloy: 25 } } },
          { chance: 0.2, text: "Its log core survived. Your navigators mark every ambush that killed it.", fx: { science: 80, res: { tech: 2 } } },
        ],
      },
      { label: "Pay respects and pass", outcomes: [{ chance: 1, text: "Your horn sounds once across the waste. Somewhere in the wreck, an old speaker answers with static.", fx: { science: 15 } }] },
    ],
  },
  {
    id: "meteors", name: "Meteor Warning", weight: 6,
    text: "Radar paints a debris field de-orbiting directly across your route. Impact footprint: everywhere.",
    choices: [
      {
        label: "Push through at speed", detail: "Trust the plating.",
        outcomes: [
          { chance: 0.55, text: "Fire falls around you. The Leviathan shoulders through, ringing like a bell.", fx: { weather: "meteor" } },
          { chance: 0.45, text: "A skystone finds your deck. Fires bloom.", fx: { weather: "meteor", damageRandom: 35 } },
        ],
      },
      {
        label: "Divert and slow-walk", detail: "Lose time and fuel, keep the hull.",
        outcomes: [{ chance: 1, text: "You thread the fall line as meteors hammer the horizon.", fx: { res: { fuel: -30 } } }],
      },
    ],
  },
  {
    id: "bloom", name: "Fungal Bloom", weight: 7, biomes: ["marsh", "ash"],
    text: "Overnight, a forest of pale fruiting towers has erupted across the route — tonnes of biomass, breathing spores.",
    choices: [
      {
        label: "Harvest the bloom", detail: "Send everyone with a cutting torch.",
        outcomes: [
          { chance: 0.65, text: "The holds fill with dense wet fuel-stock.", fx: { res: { biomass: 90 } } },
          { chance: 0.35, text: "The spores get into the vents. Med bay fills with coughing.", fx: { res: { biomass: 60 }, injure: 3 } },
        ],
      },
      { label: "Burn a path through", outcomes: [{ chance: 1, text: "Flamethrowers hiss for an hour. The ash smells like bread, horribly.", fx: { res: { biomass: 15 } } }] },
    ],
  },
  {
    id: "survivors_hostile", name: "Toll Barons", weight: 6, minDistance: 800,
    text: "Armed crawlers fan out across a canyon chokepoint. A loudspeaker demands tribute: fuel and alloy, or they mine the pass.",
    choices: [
      {
        label: "Pay the toll", detail: "-60 fuel, -15 alloy",
        outcomes: [{ chance: 1, text: "They clear the pass with mocking salutes. Cheaper than a fight. Probably.", fx: { res: { fuel: -60, alloy: -15 } } }],
      },
      {
        label: "Walk through their line", detail: "You are a walking fortress. Act like it.",
        outcomes: [
          { chance: 0.6, text: "Their nerve breaks before your shadow reaches them. Abandoned gear litters the pass.", fx: { res: { ore: 30, alloy: 10, fuel: 20 } } },
          { chance: 0.4, text: "They were serious about the mines.", fx: { damageRandom: 40, res: { ore: 30 } } },
        ],
      },
    ],
  },
  {
    id: "temple", name: "Alien Temple", weight: 5, minDistance: 2500,
    text: "A spiral spire, untouched by the collapse, singing at the edge of hearing. Crystal conduits still carry light down into the earth. Your lab team is transfixed.",
    choices: [
      {
        label: "Interface with it", detail: "Let the scientists touch the wound of the world.",
        outcomes: [
          { chance: 0.5, text: "Revelation. Diagrams pour out of the spire into your databanks.", fx: { science: 120, res: { tech: 5 } } },
          { chance: 0.3, text: "The song sharpens. Two researchers collapse, changed. The data is worth it. Probably.", fx: { science: 90, injure: 2 } },
          { chance: 0.2, text: "The spire recognizes your machine — and greets it. Every system hums with borrowed grace.", fx: { repairAll: 100, science: 40, legacyBonus: 2 } },
        ],
      },
      { label: "Give it a wide berth", outcomes: [{ chance: 1, text: "Some doors are best left singing. The crew is quiet for hours.", fx: {} }] },
    ],
  },
  {
    id: "geyser", name: "Fuel Geyser Field", weight: 7, biomes: ["volcanic", "ash"],
    text: "Pressure ridges vent burnable vapor in rhythmic gouts. A careful harvester could tank up here. A careless one could become part of the show.",
    choices: [
      {
        label: "Deploy harvesters", detail: "Time the gouts. Fill the tanks.",
        outcomes: [
          { chance: 0.7, text: "The tanks sing full. The vents applaud you on your way out.", fx: { res: { fuel: 110 } } },
          { chance: 0.3, text: "A vent detonates under a harvester team.", fx: { res: { fuel: 60 }, injure: 2 } },
        ],
      },
      { label: "Mark it and move on", outcomes: [{ chance: 1, text: "Charted for whoever comes after. If anyone comes after.", fx: { science: 10 } }] },
    ],
  },
  {
    id: "satellite", name: "Crashed Satellite", weight: 6,
    text: "A pre-collapse orbital platform has ploughed a glass furrow across your route, beacon still blinking military authentication codes.",
    choices: [
      {
        label: "Crack the core", detail: "Weapons-grade secrets, weapons-grade security.",
        outcomes: [
          { chance: 0.55, text: "The core yields targeting arrays and exotic capacitors.", fx: { res: { tech: 5, crystal: 30, alloy: 20 } } },
          { chance: 0.45, text: "Anti-tamper charges. Of course.", fx: { damageRandom: 30, res: { tech: 2, alloy: 10 } } },
        ],
      },
      { label: "Strip the panels only", outcomes: [{ chance: 1, text: "Clean, boring salvage. The core keeps its secrets and its explosives.", fx: { res: { crystal: 20, ore: 25 } } }] },
    ],
  },
];
