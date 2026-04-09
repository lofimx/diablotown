class CreateGameMaps < ActiveRecord::Migration[8.1]
  def change
    create_table :game_maps do |t|
      t.string :name, null: false
      t.integer :width, null: false, default: 64
      t.integer :height, null: false, default: 64
      t.text :tile_data
      t.integer :spawn_x, null: false, default: 32
      t.integer :spawn_y, null: false, default: 32
      t.string :tileset, null: false, default: "church_dungeon"

      t.timestamps
    end
  end
end
