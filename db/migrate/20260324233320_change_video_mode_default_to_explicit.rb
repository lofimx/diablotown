class ChangeVideoModeDefaultToExplicit < ActiveRecord::Migration[8.1]
  def change
    change_column_default :game_maps, :video_mode, from: "proximity", to: "explicit"
    reversible do |dir|
      dir.up do
        execute "UPDATE game_maps SET video_mode = 'explicit' WHERE video_mode = 'proximity'"
      end
    end
  end
end
