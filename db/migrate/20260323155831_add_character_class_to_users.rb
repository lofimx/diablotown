class AddCharacterClassToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :character_class, :string, default: "warrior", null: false
  end
end
