#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

function parseArgs(argv) {
  const out = {
    inputDir: "outdir",
    outputDir: "out/visualizations",
    cellSize: 10
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--input-dir") {
      i += 1;
      out.inputDir = argv[i];
    } else if (token === "--output-dir") {
      i += 1;
      out.outputDir = argv[i];
    } else if (token === "--cell-size") {
      i += 1;
      out.cellSize = Number.parseInt(argv[i] ?? "10", 10);
    } else if (token === "--help" || token === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!Number.isInteger(out.cellSize) || out.cellSize <= 0) {
    throw new Error("Invalid --cell-size. It must be a positive integer.");
  }

  return out;
}

function printHelp() {
  console.log(
    [
      "Usage: node scripts/visualize-debug.mjs [options]",
      "",
      "Options:",
      "  --input-dir <path>   Debug artifact directory (default: outdir)",
      "  --output-dir <path>  Visualization output directory (default: out/visualizations)",
      "  --cell-size <n>      Pixel size per tile in generated SVGs (default: 10)",
      "  --help, -h           Show this help"
    ].join("\n")
  );
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function indexOf(x, y, width) {
  return y * width + x;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function rgb(r, g, b) {
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

function rampBlueGreenYellow(v) {
  const t = clamp01(v);
  if (t < 0.5) {
    const local = t / 0.5;
    return rgb(20, lerp(40, 180, local), lerp(120, 70, local));
  }
  const local = (t - 0.5) / 0.5;
  return rgb(lerp(20, 220, local), lerp(180, 210, local), lerp(70, 40, local));
}

function rampTerrain(v) {
  const t = clamp01(v);
  if (t < 0.4) {
    const local = t / 0.4;
    return rgb(lerp(30, 60, local), lerp(50, 120, local), lerp(30, 70, local));
  }
  if (t < 0.75) {
    const local = (t - 0.4) / 0.35;
    return rgb(lerp(60, 140, local), lerp(120, 170, local), lerp(70, 80, local));
  }
  const local = (t - 0.75) / 0.25;
  return rgb(lerp(140, 220, local), lerp(170, 220, local), lerp(80, 210, local));
}

function hashColor(name) {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i += 1) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const r = 60 + ((hash >>> 16) & 127);
  const g = 60 + ((hash >>> 8) & 127);
  const b = 60 + (hash & 127);
  return rgb(r, g, b);
}

function svgFromGrid({
  width,
  height,
  cellSize,
  title,
  values,
  colorForValue
}) {
  const svgWidth = width * cellSize;
  const svgHeight = height * cellSize + 24;
  const rects = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = values[indexOf(x, y, width)];
      const fill = colorForValue(value);
      rects.push(
        `<rect x="${x * cellSize}" y="${y * cellSize + 24}" width="${cellSize}" height="${cellSize}" fill="${fill}"/>`
      );
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">`,
    `<rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="#111"/>`,
    `<text x="8" y="16" fill="#f5f5f5" font-family="monospace" font-size="13">${title}</text>`,
    ...rects,
    "</svg>",
    ""
  ].join("\n");
}

function htmlPage(items) {
  const cards = items
    .map(
      (item) => `
        <section class="card">
          <h2>${item.title}</h2>
          <img src="./${item.file}" alt="${item.title}" loading="lazy"/>
        </section>
      `
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Forest Terrain Visualizations</title>
  <style>
    :root {
      --bg: #0f1115;
      --card: #171b22;
      --text: #ecf1f8;
      --muted: #98a5b3;
      --border: #273040;
    }
    body {
      margin: 0;
      background: linear-gradient(160deg, #0f1115, #141922);
      color: var(--text);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    main {
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
    }
    h1 {
      margin: 0 0 6px;
      font-size: 24px;
    }
    p {
      margin: 0 0 18px;
      color: var(--muted);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
      gap: 14px;
    }
    .card {
      border: 1px solid var(--border);
      background: var(--card);
      border-radius: 10px;
      padding: 10px;
    }
    .card h2 {
      margin: 0 0 8px;
      font-size: 14px;
      color: #d6e0ec;
    }
    .card img {
      width: 100%;
      border-radius: 6px;
      display: block;
      background: #0b0d12;
    }
  </style>
</head>
<body>
  <main>
    <h1>Forest Terrain Visualizations</h1>
    <p>Generated from debug artifacts.</p>
    <div class="grid">
      ${cards}
    </div>
  </main>
</body>
</html>
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputDir = resolve(process.cwd(), args.inputDir);
  const outputDir = resolve(process.cwd(), args.outputDir);

  const [manifest, topography, hydrology, ecology, navigation] = await Promise.all([
    readJson(join(inputDir, "debug-manifest.json")),
    readJson(join(inputDir, "topography.json")),
    readJson(join(inputDir, "hydrology.json")),
    readJson(join(inputDir, "ecology.json")),
    readJson(join(inputDir, "navigation.json"))
  ]);

  const width = Number(manifest.width);
  const height = Number(manifest.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error("Invalid debug manifest dimensions.");
  }

  const size = width * height;
  const h = new Float64Array(size);
  const slope = new Float64Array(size);
  const moisture = new Float64Array(size);
  const treeDensity = new Float64Array(size);
  const moveCost = new Float64Array(size);
  const blockedCount = new Uint8Array(size);
  const waterClass = new Array(size).fill("none");
  const biome = new Array(size).fill("unknown");

  for (const tile of topography.tiles) {
    const i = indexOf(tile.x, tile.y, width);
    h[i] = Number(tile.topography.h ?? 0);
    slope[i] = Number(tile.topography.slopeMag ?? 0);
  }
  for (const tile of hydrology.tiles) {
    const i = indexOf(tile.x, tile.y, width);
    moisture[i] = Number(tile.hydrology.moisture ?? 0);
    waterClass[i] = String(tile.hydrology.waterClass ?? "none");
  }
  for (const tile of ecology.tiles) {
    const i = indexOf(tile.x, tile.y, width);
    treeDensity[i] = Number(tile.ecology.treeDensity ?? 0);
    biome[i] = String(tile.ecology.biome ?? "unknown");
  }
  for (const tile of navigation.tiles) {
    const i = indexOf(tile.x, tile.y, width);
    moveCost[i] = Number(tile.navigation.moveCost ?? 0);
    const pass = tile.navigation.passability ?? {};
    let blocked = 0;
    for (const dir of ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]) {
      if (pass[dir] === "blocked") {
        blocked += 1;
      }
    }
    blockedCount[i] = blocked;
  }

  const waterColors = {
    none: "#2b3445",
    lake: "#2f72ff",
    stream: "#37b9ff",
    marsh: "#6c55c8"
  };

  const biomePalette = new Map([
    ["open_bog", "#5a6b48"],
    ["pine_heath", "#6d8f4e"],
    ["spruce_moss", "#2f6d3d"],
    ["mixed_forest", "#4e8a5e"],
    ["wetland_scrub", "#5e7e71"],
    ["rock_barrens", "#7a776f"]
  ]);

  const layers = [
    {
      file: "01_topography_h.svg",
      title: "Topography H",
      values: h,
      colorForValue: (v) => rampTerrain(v)
    },
    {
      file: "02_topography_slope.svg",
      title: "Topography SlopeMag",
      values: slope,
      colorForValue: (v) => rampBlueGreenYellow(Math.min(v / 0.2, 1))
    },
    {
      file: "03_hydrology_moisture.svg",
      title: "Hydrology Moisture",
      values: moisture,
      colorForValue: (v) => rampBlueGreenYellow(v)
    },
    {
      file: "04_hydrology_water_class.svg",
      title: "Hydrology WaterClass",
      values: waterClass,
      colorForValue: (v) => waterColors[v] ?? "#ff00aa"
    },
    {
      file: "05_ecology_biome.svg",
      title: "Ecology Biome",
      values: biome,
      colorForValue: (v) => biomePalette.get(v) ?? hashColor(v)
    },
    {
      file: "06_ecology_tree_density.svg",
      title: "Ecology TreeDensity",
      values: treeDensity,
      colorForValue: (v) => rampBlueGreenYellow(v)
    },
    {
      file: "07_navigation_move_cost.svg",
      title: "Navigation MoveCost",
      values: moveCost,
      colorForValue: (v) => rampBlueGreenYellow(Math.min(v / 4, 1))
    },
    {
      file: "08_navigation_blocked_dirs.svg",
      title: "Navigation Blocked Directions (0-8)",
      values: blockedCount,
      colorForValue: (v) => rampBlueGreenYellow(v / 8)
    }
  ];

  await mkdir(outputDir, { recursive: true });
  for (const layer of layers) {
    const svg = svgFromGrid({
      width,
      height,
      cellSize: args.cellSize,
      title: layer.title,
      values: layer.values,
      colorForValue: layer.colorForValue
    });
    await writeFile(join(outputDir, layer.file), svg, "utf8");
  }

  await writeFile(join(outputDir, "index.html"), htmlPage(layers), "utf8");
  console.log(`Wrote ${layers.length} SVG layers and index page to ${outputDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
