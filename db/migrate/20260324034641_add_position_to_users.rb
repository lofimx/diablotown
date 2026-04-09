class AddPositionToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :last_map_id, :integer
    add_column :users, :last_x, :float
    add_column :users, :last_y, :float
  end
end
