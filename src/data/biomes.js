/* ============================================================
   data/biomes.js — biome palettes, hazards, ground rendering.
   ============================================================ */
(function () {
  const MF = (window.MF = window.MF || {});

  const BIOMES = [
    {
      id: "desert", name: "SCORCHED DESERT", musicRoot: 55,
      ground: "#241d14", ground2: "#2f2519", grid: "rgba(255,180,90,0.05)",
      fog: "rgba(40,28,14,0.0)", accent: "#ff9a3c",
      rock: "#3a2f20", rockEdge: "#5a4a30", detail: "sand",
      hazard: "sandstorm", boss: "sandworm",
      tint: "rgba(255,150,60,0.04)",
    },
    {
      id: "frozen", name: "FROZEN WASTES", musicRoot: 49,
      ground: "#101820", ground2: "#16222e", grid: "rgba(150,220,255,0.06)",
      fog: "rgba(180,210,240,0.05)", accent: "#7be3ff",
      rock: "#20303c", rockEdge: "#4a7088", detail: "ice",
      hazard: "blizzard", boss: "spider",
      tint: "rgba(120,200,255,0.05)",
    },
    {
      id: "megacity", name: "ABANDONED MEGACITY", musicRoot: 58,
      ground: "#14161c", ground2: "#1a1e26", grid: "rgba(120,160,255,0.06)",
      fog: "rgba(30,30,40,0.06)", accent: "#5ad1ff",
      rock: "#22262f", rockEdge: "#3a4152", detail: "urban",
      hazard: "emp", boss: "factory",
      tint: "rgba(80,120,200,0.04)",
    },
    {
      id: "volcanic", name: "VOLCANIC FIELDS", musicRoot: 52,
      ground: "#1a0f0c", ground2: "#241310", grid: "rgba(255,90,40,0.06)",
      fog: "rgba(60,20,10,0.06)", accent: "#ff5a2a",
      rock: "#2a1410", rockEdge: "#7a2a10", detail: "lava",
      hazard: "meteor", boss: "drill",
      tint: "rgba(255,80,30,0.06)",
    },
    {
      id: "radioactive", name: "RADIOACTIVE ZONE", musicRoot: 46,
      ground: "#111a10", ground2: "#16240f", grid: "rgba(150,255,90,0.06)",
      fog: "rgba(40,60,20,0.05)", accent: "#9dff4d",
      rock: "#1c2a14", rockEdge: "#4a7a20", detail: "toxic",
      hazard: "acid", boss: "factory",
      tint: "rgba(140,255,80,0.05)",
    },
    {
      id: "alien", name: "ALIEN EXOWORLD", musicRoot: 62,
      ground: "#160f24", ground2: "#1e1330", grid: "rgba(200,120,255,0.07)",
      fog: "rgba(40,20,60,0.06)", accent: "#c07bff",
      rock: "#241638", rockEdge: "#6a3aa0", detail: "alien",
      hazard: "meteor", boss: "spider",
      tint: "rgba(180,100,255,0.05)",
    },
  ];

  MF.BIOMES = BIOMES;
})();
