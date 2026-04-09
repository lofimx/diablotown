# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_03_25_140351) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "direct_messages", force: :cascade do |t|
    t.text "content", null: false
    t.datetime "created_at", null: false
    t.bigint "recipient_id", null: false
    t.bigint "sender_id", null: false
    t.datetime "updated_at", null: false
    t.index ["recipient_id"], name: "index_direct_messages_on_recipient_id"
  end

  create_table "game_maps", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "height", default: 64, null: false
    t.string "name", null: false
    t.integer "spawn_x", default: 32, null: false
    t.integer "spawn_y", default: 32, null: false
    t.text "tile_data"
    t.string "tileset", default: "church_dungeon", null: false
    t.datetime "updated_at", null: false
    t.string "video_mode", default: "proximity", null: false
    t.integer "width", default: 64, null: false
  end

  create_table "users", force: :cascade do |t|
    t.string "admin_password_digest"
    t.string "character_class", default: "warrior", null: false
    t.datetime "created_at", null: false
    t.integer "last_map_id"
    t.float "last_x"
    t.float "last_y"
    t.string "token", null: false
    t.datetime "updated_at", null: false
    t.string "username", null: false
    t.index ["token"], name: "index_users_on_token", unique: true
    t.index ["username"], name: "index_users_on_username", unique: true
  end

  add_foreign_key "direct_messages", "users", column: "recipient_id"
  add_foreign_key "direct_messages", "users", column: "sender_id"
end
