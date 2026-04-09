class CreateDirectMessages < ActiveRecord::Migration[8.1]
  def change
    create_table :direct_messages do |t|
      t.bigint :sender_id, null: false
      t.bigint :recipient_id, null: false
      t.text :content, null: false

      t.timestamps
    end

    add_index :direct_messages, :recipient_id
    add_foreign_key :direct_messages, :users, column: :sender_id
    add_foreign_key :direct_messages, :users, column: :recipient_id
  end
end
