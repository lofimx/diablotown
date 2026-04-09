# Create default maps
GameMap.find_or_create_by!(name: "Tristram") do |m|
  m.width = 64
  m.height = 64
  m.spawn_x = 32
  m.spawn_y = 32
  m.tileset = "church_dungeon"
  m.video_mode = "explicit"
end

GameMap.find_or_create_by!(name: "The Catacombs") do |m|
  m.width = 48
  m.height = 48
  m.spawn_x = 24
  m.spawn_y = 24
  m.tileset = "catacombs"
  m.video_mode = "explicit"
end

GameMap.find_or_create_by!(name: "Caves") do |m|
  m.width = 48
  m.height = 48
  m.spawn_x = 24
  m.spawn_y = 24
  m.tileset = "cave"
  m.video_mode = "explicit"
end

GameMap.find_or_create_by!(name: "Hell") do |m|
  m.width = 48
  m.height = 48
  m.spawn_x = 24
  m.spawn_y = 24
  m.tileset = "hell"
  m.video_mode = "explicit"
end
