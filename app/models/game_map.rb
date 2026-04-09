class GameMap < ApplicationRecord
  validates :name, presence: true
  validates :width, :height, presence: true, numericality: { greater_than: 0 }
  validates :spawn_x, :spawn_y, presence: true, numericality: { greater_than_or_equal_to: 0 }
  validates :video_mode, inclusion: { in: %w[proximity explicit] }

  def tile_grid
    return nil unless tile_data
    JSON.parse(tile_data)
  end

  def tile_grid=(grid)
    self.tile_data = grid.to_json
  end
end
