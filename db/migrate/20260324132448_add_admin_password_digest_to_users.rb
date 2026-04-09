class AddAdminPasswordDigestToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :admin_password_digest, :string
  end
end
