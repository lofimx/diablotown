class AddVideoModeToGameMaps < ActiveRecord::Migration[8.1]
  def change
    add_column :game_maps, :video_mode, :string, null: false, default: "proximity"
  end
end
