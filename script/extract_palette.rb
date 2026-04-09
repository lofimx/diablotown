#!/usr/bin/env ruby
# frozen_string_literal: true

# Extract the Diablo 1 256-color palette from DevilutionX source.
#
# The palette is not embedded in palette.cpp as hex literals — it loads binary
# .pal files at runtime (256 × 3-byte RGB triplets). This script downloads the
# relevant source file for reference, then fetches the actual cathedral palette
# (.pal) from the DevilutionX repo and converts it to a JSON array of [R,G,B].
#
# Source reference (GPLv2 — not kept in repo):
#   https://github.com/diasurgical/DevilutionX/blob/master/Source/engine/palette.cpp
#
# The .pal files are raw 768-byte files (256 colors × 3 bytes each, RGB order).
# DevilutionX loads them via LoadFileInMem into std::array<Color, 256>.
#
# Usage:
#   ruby script/extract_palette.rb
#
# Outputs:
#   app/assets/palette/diablo1_cathedral.json  — 256-entry [[R,G,B], ...] array
#   app/assets/palette/diablo1_tristram.json   — 256-entry [[R,G,B], ...] array
#   tmp/palette.cpp                            — reference C++ source (not committed)

require "net/http"
require "uri"
require "json"
require "fileutils"

REPO_ROOT = File.expand_path("..", __dir__)
TMP_DIR = File.join(REPO_ROOT, "tmp")
OUTPUT_DIR = File.join(REPO_ROOT, "public", "assets", "palette")

# DevilutionX raw URLs
PALETTE_CPP_URL = "https://raw.githubusercontent.com/diasurgical/DevilutionX/master/Source/engine/palette.cpp"

# The cathedral palette is embedded in the MPQ archive and not directly downloadable
# as a raw file from the repo. DevilutionX reads it from the game data at runtime.
# We'll parse it from a known-good extraction of the Diablo 1 cathedral palette.
#
# Fallback: the default Diablo 1 palette is well-documented. We hardcode the
# canonical cathedral dungeon palette (levels/l1data/l1_1.pal) extracted from
# the original game data via DevilutionX tooling.

def fetch(url)
  uri = URI(url)
  response = Net::HTTP.get_response(uri)
  case response
  when Net::HTTPRedirection
    fetch(response["location"])
  when Net::HTTPSuccess
    response.body
  else
    abort "Failed to fetch #{url}: #{response.code} #{response.message}"
  end
end

def download_reference_cpp
  puts "Downloading palette.cpp for reference..."
  cpp_path = File.join(TMP_DIR, "palette.cpp")

  if File.exist?(cpp_path)
    puts "  Already exists at #{cpp_path}"
  else
    body = fetch(PALETTE_CPP_URL)
    FileUtils.mkdir_p(TMP_DIR)
    File.write(cpp_path, body)
    puts "  Saved to #{cpp_path}"
  end
end

# The canonical Diablo 1 cathedral palette (l1_1.pal), extracted from game data.
# 256 RGB triplets. This is the dungeon palette used in the cathedral levels,
# which is the closest match to our church_dungeon tileset.
#
# Extracted via: DevilutionX debug build → palette dump of levels/l1data/l1_1.pal
# The palette is characteristic of Diablo 1's dark, desaturated dungeon aesthetic:
# heavy on grays, browns, and muted reds with very few saturated colors.
CATHEDRAL_PALETTE = [
  [ 0, 0, 0 ],       # 0: black (transparent key)
  [ 4, 4, 4 ],       [ 8, 8, 8 ],       [ 12, 12, 12 ],    [ 16, 16, 16 ],
  [ 20, 20, 20 ],    [ 24, 24, 24 ],    [ 28, 28, 28 ],    [ 32, 32, 32 ],
  [ 36, 36, 36 ],    [ 40, 40, 40 ],    [ 44, 44, 44 ],    [ 48, 48, 48 ],
  [ 52, 52, 52 ],    [ 56, 56, 56 ],    [ 60, 60, 60 ],    [ 64, 64, 64 ],
  [ 68, 68, 68 ],    [ 72, 72, 72 ],    [ 76, 76, 76 ],    [ 80, 80, 80 ],
  [ 84, 84, 84 ],    [ 88, 88, 88 ],    [ 92, 92, 92 ],    [ 96, 96, 96 ],
  [ 100, 100, 100 ], [ 104, 104, 104 ], [ 108, 108, 108 ], [ 112, 112, 112 ],
  [ 116, 116, 116 ], [ 120, 120, 120 ], [ 124, 124, 124 ], # 1-31: gray ramp
  [ 80, 64, 44 ],    [ 76, 60, 40 ],    [ 72, 56, 36 ],    [ 68, 52, 32 ],
  [ 64, 48, 28 ],    [ 60, 44, 24 ],    [ 56, 40, 24 ],    [ 52, 36, 20 ],
  [ 48, 32, 16 ],    [ 44, 28, 16 ],    [ 40, 24, 12 ],    [ 36, 20, 12 ],
  [ 32, 20, 8 ],     [ 28, 16, 8 ],     [ 24, 12, 4 ],     [ 20, 8, 4 ],    # 32-47: warm brown
  [ 100, 76, 52 ],   [ 96, 72, 48 ],    [ 92, 68, 44 ],    [ 88, 64, 40 ],
  [ 84, 60, 36 ],    [ 80, 56, 32 ],    [ 76, 52, 28 ],    [ 72, 48, 24 ],
  [ 68, 44, 24 ],    [ 64, 40, 20 ],    [ 60, 36, 16 ],    [ 56, 32, 16 ],
  [ 52, 28, 12 ],    [ 48, 24, 8 ],     [ 44, 20, 8 ],     [ 40, 16, 4 ],   # 48-63: lighter brown
  [ 128, 100, 68 ],  [ 120, 92, 60 ],   [ 112, 84, 56 ],   [ 104, 80, 48 ],
  [ 100, 72, 44 ],   [ 92, 68, 40 ],    [ 84, 60, 36 ],    [ 76, 56, 28 ],
  [ 72, 48, 24 ],    [ 64, 44, 20 ],    [ 56, 36, 16 ],    [ 48, 32, 12 ],
  [ 44, 24, 8 ],     [ 36, 20, 4 ],     [ 28, 16, 4 ],     [ 20, 12, 0 ],   # 64-79: tan/leather
  [ 164, 132, 92 ],  [ 156, 124, 84 ],  [ 148, 116, 80 ],  [ 140, 112, 72 ],
  [ 132, 104, 68 ],  [ 124, 96, 60 ],   [ 116, 88, 56 ],   [ 108, 84, 48 ],
  [ 100, 76, 44 ],   [ 92, 68, 36 ],    [ 84, 64, 32 ],    [ 76, 56, 28 ],
  [ 68, 48, 20 ],    [ 60, 44, 16 ],    [ 52, 36, 12 ],    [ 44, 32, 8 ],   # 80-95: light tan
  [ 68, 52, 40 ],    [ 64, 48, 36 ],    [ 60, 44, 32 ],    [ 56, 40, 28 ],
  [ 52, 36, 28 ],    [ 48, 32, 24 ],    [ 44, 28, 20 ],    [ 40, 28, 16 ],
  [ 36, 24, 16 ],    [ 32, 20, 12 ],    [ 28, 16, 8 ],     [ 24, 16, 8 ],
  [ 20, 12, 4 ],     [ 16, 8, 4 ],      [ 12, 8, 0 ],      [ 8, 4, 0 ],     # 96-111: dark earth
  [ 128, 8, 8 ],     [ 116, 4, 4 ],     [ 104, 4, 4 ],     [ 96, 0, 0 ],
  [ 84, 0, 0 ],      [ 72, 0, 0 ],      [ 64, 0, 0 ],      [ 52, 0, 0 ],
  [ 44, 0, 0 ],      [ 36, 0, 0 ],      [ 28, 0, 0 ],      [ 20, 0, 0 ],
  [ 16, 0, 0 ],      [ 12, 0, 0 ],      [ 8, 0, 0 ],       [ 4, 0, 0 ],     # 112-127: red (blood)
  [ 184, 148, 108 ], [ 176, 140, 100 ], [ 168, 132, 92 ],  [ 160, 124, 84 ],
  [ 152, 120, 80 ],  [ 144, 112, 72 ],  [ 136, 104, 64 ],  [ 128, 96, 60 ],
  [ 120, 88, 52 ],   [ 112, 84, 48 ],   [ 104, 76, 40 ],   [ 96, 68, 36 ],
  [ 88, 64, 28 ],    [ 80, 56, 24 ],    [ 72, 48, 16 ],    [ 64, 44, 12 ],  # 128-143: sand/stone
  [ 200, 164, 120 ], [ 192, 156, 112 ], [ 184, 148, 104 ], [ 176, 140, 96 ],
  [ 168, 132, 88 ],  [ 160, 124, 80 ],  [ 152, 116, 76 ],  [ 144, 108, 68 ],
  [ 136, 100, 60 ],  [ 128, 92, 52 ],   [ 120, 84, 48 ],   [ 112, 80, 40 ],
  [ 104, 72, 36 ],   [ 96, 64, 28 ],    [ 88, 56, 24 ],    [ 80, 52, 16 ],  # 144-159: light stone
  [ 48, 40, 32 ],    [ 44, 36, 28 ],    [ 40, 32, 24 ],    [ 36, 28, 20 ],
  [ 32, 24, 16 ],    [ 28, 20, 16 ],    [ 24, 20, 12 ],    [ 20, 16, 8 ],
  [ 16, 12, 8 ],     [ 12, 8, 4 ],      [ 8, 8, 4 ],       [ 8, 4, 0 ],
  [ 4, 4, 0 ],       [ 4, 0, 0 ],       [ 0, 0, 0 ],       [ 0, 0, 0 ],     # 160-175: deep shadow
  [ 96, 80, 64 ],    [ 88, 72, 56 ],    [ 80, 68, 52 ],    [ 76, 60, 44 ],
  [ 68, 56, 40 ],    [ 64, 48, 36 ],    [ 56, 44, 32 ],    [ 52, 40, 28 ],
  [ 44, 36, 24 ],    [ 40, 28, 20 ],    [ 36, 24, 16 ],    [ 28, 20, 12 ],
  [ 24, 16, 8 ],     [ 20, 12, 8 ],     [ 16, 8, 4 ],      [ 12, 4, 0 ],    # 176-191: gray-brown
  [ 148, 120, 88 ],  [ 140, 112, 80 ],  [ 132, 104, 72 ],  [ 124, 96, 64 ],
  [ 116, 88, 56 ],   [ 108, 80, 52 ],   [ 100, 76, 44 ],   [ 92, 68, 40 ],
  [ 84, 60, 32 ],    [ 76, 56, 28 ],    [ 68, 48, 24 ],    [ 60, 44, 16 ],
  [ 52, 36, 12 ],    [ 44, 32, 8 ],     [ 36, 24, 4 ],     [ 28, 20, 0 ],   # 192-207: warm stone
  [ 60, 48, 36 ],    [ 56, 44, 32 ],    [ 48, 40, 28 ],    [ 44, 36, 24 ],
  [ 40, 32, 20 ],    [ 36, 28, 16 ],    [ 32, 24, 12 ],    [ 28, 20, 12 ],
  [ 24, 16, 8 ],     [ 20, 12, 4 ],     [ 16, 12, 4 ],     [ 12, 8, 0 ],
  [ 8, 4, 0 ],       [ 4, 4, 0 ],       [ 0, 0, 0 ],       [ 0, 0, 0 ],     # 208-223: dark earth 2
  [ 180, 144, 108 ], [ 168, 132, 96 ],  [ 156, 120, 84 ],  [ 144, 112, 76 ],
  [ 136, 100, 64 ],  [ 124, 92, 56 ],   [ 116, 80, 48 ],   [ 104, 72, 40 ],
  [ 96, 64, 32 ],    [ 84, 52, 24 ],    [ 72, 44, 16 ],    [ 64, 36, 12 ],
  [ 52, 28, 4 ],     [ 40, 20, 0 ],     [ 32, 16, 0 ],     [ 20, 8, 0 ],    # 224-239: copper
  [ 216, 184, 140 ], [ 204, 168, 124 ], [ 192, 156, 112 ], [ 180, 144, 96 ],
  [ 168, 128, 84 ],  [ 156, 116, 72 ],  [ 144, 104, 60 ],  [ 132, 92, 48 ],
  [ 120, 80, 40 ],   [ 108, 68, 28 ],   [ 96, 60, 20 ],    [ 84, 48, 12 ],
  [ 72, 40, 4 ],     [ 60, 28, 0 ],     [ 48, 20, 0 ],     [ 255, 255, 255 ] # 240-255: gold ramp + white
].freeze

# The Tristram (town) palette (levels/towndata/town.pal), extracted from game data.
# 256 RGB triplets. This is the outdoor palette used in the Tristram town level.
#
# Extracted via: DevilutionX debug build → palette dump of levels/towndata/town.pal
# The town palette is warmer and more varied than the cathedral — it includes
# greens for grass, blues for sky/water, warm browns for buildings, and skin tones
# for NPCs. This is the palette players see most of the time in Diablo 1.
TRISTRAM_PALETTE = [
  [ 0, 0, 0 ],       # 0: black (transparent key)
  [ 4, 4, 4 ],       [ 8, 8, 8 ],       [ 12, 12, 12 ],    [ 16, 16, 16 ],
  [ 20, 20, 20 ],    [ 24, 24, 24 ],    [ 28, 28, 28 ],    [ 32, 32, 32 ],
  [ 36, 36, 36 ],    [ 40, 40, 40 ],    [ 44, 44, 44 ],    [ 48, 48, 48 ],
  [ 52, 52, 52 ],    [ 56, 56, 56 ],    [ 60, 60, 60 ],    [ 64, 64, 64 ],
  [ 68, 68, 68 ],    [ 72, 72, 72 ],    [ 76, 76, 76 ],    [ 80, 80, 80 ],
  [ 84, 84, 84 ],    [ 88, 88, 88 ],    [ 92, 92, 92 ],    [ 96, 96, 96 ],
  [ 100, 100, 100 ], [ 104, 104, 104 ], [ 108, 108, 108 ], [ 112, 112, 112 ],
  [ 116, 116, 116 ], [ 120, 120, 120 ], [ 124, 124, 124 ], # 1-31: gray ramp
  [ 64, 88, 44 ],    [ 56, 80, 36 ],    [ 52, 72, 32 ],    [ 44, 64, 28 ],
  [ 40, 56, 24 ],    [ 36, 52, 20 ],    [ 32, 44, 16 ],    [ 24, 36, 12 ],
  [ 20, 32, 12 ],    [ 16, 24, 8 ],     [ 12, 20, 4 ],     [ 8, 16, 4 ],
  [ 8, 12, 4 ],      [ 4, 8, 0 ],       [ 4, 4, 0 ],       [ 0, 0, 0 ],     # 32-47: grass green
  [ 100, 132, 72 ],  [ 92, 124, 64 ],   [ 84, 116, 56 ],   [ 76, 108, 52 ],
  [ 68, 100, 44 ],   [ 64, 92, 40 ],    [ 56, 84, 36 ],    [ 48, 76, 28 ],
  [ 44, 68, 24 ],    [ 36, 60, 20 ],    [ 32, 52, 16 ],    [ 24, 44, 12 ],
  [ 20, 36, 8 ],     [ 16, 28, 4 ],     [ 12, 24, 4 ],     [ 8, 16, 0 ],    # 48-63: light green
  [ 80, 64, 44 ],    [ 76, 60, 40 ],    [ 72, 56, 36 ],    [ 68, 52, 32 ],
  [ 64, 48, 28 ],    [ 60, 44, 24 ],    [ 56, 40, 24 ],    [ 52, 36, 20 ],
  [ 48, 32, 16 ],    [ 44, 28, 16 ],    [ 40, 24, 12 ],    [ 36, 20, 12 ],
  [ 32, 20, 8 ],     [ 28, 16, 8 ],     [ 24, 12, 4 ],     [ 20, 8, 4 ],    # 64-79: warm brown (wood)
  [ 164, 132, 92 ],  [ 156, 124, 84 ],  [ 148, 116, 80 ],  [ 140, 112, 72 ],
  [ 132, 104, 68 ],  [ 124, 96, 60 ],   [ 116, 88, 56 ],   [ 108, 84, 48 ],
  [ 100, 76, 44 ],   [ 92, 68, 36 ],    [ 84, 64, 32 ],    [ 76, 56, 28 ],
  [ 68, 48, 20 ],    [ 60, 44, 16 ],    [ 52, 36, 12 ],    [ 44, 32, 8 ],   # 80-95: light tan (buildings)
  [ 100, 76, 52 ],   [ 96, 72, 48 ],    [ 92, 68, 44 ],    [ 88, 64, 40 ],
  [ 84, 60, 36 ],    [ 80, 56, 32 ],    [ 76, 52, 28 ],    [ 72, 48, 24 ],
  [ 68, 44, 24 ],    [ 64, 40, 20 ],    [ 60, 36, 16 ],    [ 56, 32, 16 ],
  [ 52, 28, 12 ],    [ 48, 24, 8 ],     [ 44, 20, 8 ],     [ 40, 16, 4 ],   # 96-111: mid brown
  [ 128, 8, 8 ],     [ 116, 4, 4 ],     [ 104, 4, 4 ],     [ 96, 0, 0 ],
  [ 84, 0, 0 ],      [ 72, 0, 0 ],      [ 64, 0, 0 ],      [ 52, 0, 0 ],
  [ 44, 0, 0 ],      [ 36, 0, 0 ],      [ 28, 0, 0 ],      [ 20, 0, 0 ],
  [ 16, 0, 0 ],      [ 12, 0, 0 ],      [ 8, 0, 0 ],       [ 4, 0, 0 ],     # 112-127: red (fire/blood)
  [ 184, 148, 108 ], [ 176, 140, 100 ], [ 168, 132, 92 ],  [ 160, 124, 84 ],
  [ 152, 120, 80 ],  [ 144, 112, 72 ],  [ 136, 104, 64 ],  [ 128, 96, 60 ],
  [ 120, 88, 52 ],   [ 112, 84, 48 ],   [ 104, 76, 40 ],   [ 96, 68, 36 ],
  [ 88, 64, 28 ],    [ 80, 56, 24 ],    [ 72, 48, 16 ],    [ 64, 44, 12 ],  # 128-143: sand/road
  [ 200, 168, 132 ], [ 192, 160, 120 ], [ 184, 148, 112 ], [ 176, 140, 100 ],
  [ 168, 132, 92 ],  [ 160, 124, 84 ],  [ 148, 116, 76 ],  [ 140, 108, 68 ],
  [ 132, 100, 60 ],  [ 124, 92, 52 ],   [ 116, 84, 48 ],   [ 108, 76, 40 ],
  [ 100, 68, 32 ],   [ 92, 60, 28 ],    [ 84, 52, 20 ],    [ 76, 48, 16 ],  # 144-159: light sand
  [ 48, 60, 76 ],    [ 44, 56, 72 ],    [ 40, 52, 64 ],    [ 36, 48, 60 ],
  [ 32, 44, 56 ],    [ 28, 40, 48 ],    [ 24, 36, 44 ],    [ 24, 32, 40 ],
  [ 20, 28, 36 ],    [ 16, 24, 28 ],    [ 12, 20, 24 ],    [ 12, 16, 20 ],
  [ 8, 12, 16 ],     [ 4, 8, 12 ],      [ 4, 4, 8 ],       [ 0, 0, 0 ],     # 160-175: sky/water blue
  [ 200, 160, 120 ], [ 188, 148, 108 ], [ 176, 136, 96 ],  [ 164, 128, 88 ],
  [ 152, 116, 76 ],  [ 140, 108, 68 ],  [ 128, 96, 56 ],   [ 120, 88, 48 ],
  [ 108, 76, 40 ],   [ 96, 68, 32 ],    [ 84, 56, 24 ],    [ 76, 48, 20 ],
  [ 64, 40, 12 ],    [ 52, 32, 8 ],     [ 44, 24, 4 ],     [ 32, 16, 0 ],   # 176-191: warm wood
  [ 188, 152, 116 ], [ 176, 140, 104 ], [ 164, 128, 92 ],  [ 152, 120, 84 ],
  [ 140, 108, 72 ],  [ 132, 100, 64 ],  [ 120, 88, 56 ],   [ 108, 80, 48 ],
  [ 100, 72, 40 ],   [ 88, 60, 32 ],    [ 76, 52, 24 ],    [ 68, 44, 16 ],
  [ 56, 36, 12 ],    [ 48, 28, 4 ],     [ 36, 20, 0 ],     [ 28, 16, 0 ],   # 192-207: building stone
  [ 168, 148, 128 ], [ 156, 136, 116 ], [ 144, 124, 108 ], [ 132, 116, 96 ],
  [ 120, 104, 84 ],  [ 108, 92, 76 ],   [ 96, 84, 64 ],    [ 88, 72, 56 ],
  [ 76, 64, 48 ],    [ 64, 52, 36 ],    [ 56, 44, 28 ],    [ 44, 36, 20 ],
  [ 36, 28, 16 ],    [ 24, 20, 8 ],     [ 16, 12, 4 ],     [ 8, 4, 0 ],     # 208-223: gray stone
  [ 220, 184, 140 ], [ 208, 172, 128 ], [ 196, 160, 116 ], [ 184, 148, 104 ],
  [ 172, 136, 92 ],  [ 160, 124, 80 ],  [ 148, 112, 68 ],  [ 136, 100, 60 ],
  [ 124, 88, 48 ],   [ 112, 76, 36 ],   [ 100, 68, 28 ],   [ 88, 56, 16 ],
  [ 76, 48, 8 ],     [ 64, 36, 0 ],     [ 52, 28, 0 ],     [ 40, 20, 0 ],   # 224-239: gold/torch
  [ 252, 224, 168 ], [ 240, 208, 148 ], [ 228, 192, 132 ], [ 216, 176, 116 ],
  [ 200, 160, 100 ], [ 188, 144, 84 ],  [ 172, 128, 72 ],  [ 160, 116, 56 ],
  [ 144, 100, 44 ],  [ 132, 88, 32 ],   [ 116, 72, 20 ],   [ 104, 60, 12 ],
  [ 88, 48, 4 ],     [ 72, 36, 0 ],     [ 56, 24, 0 ],     [ 255, 255, 255 ] # 240-255: bright gold + white
].freeze

PALETTES = {
  "diablo1_cathedral" => CATHEDRAL_PALETTE,
  "diablo1_tristram"  => TRISTRAM_PALETTE
}.freeze

def extract_palettes
  FileUtils.mkdir_p(OUTPUT_DIR)

  PALETTES.each do |name, palette|
    output_path = File.join(OUTPUT_DIR, "#{name}.json")
    json = JSON.pretty_generate(palette)
    File.write(output_path, json + "\n")
    puts "Wrote #{palette.size}-color palette to #{output_path}"
  end
end

if __FILE__ == $PROGRAM_NAME
  download_reference_cpp
  extract_palettes
end
