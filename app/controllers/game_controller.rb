class GameController < ApplicationController
  DEFAULT_TILESET = "church_dungeon"

  def index
    @maps = GameMap.where(tileset: DEFAULT_TILESET).order(:id)
  end

  def show
    @map = GameMap.find(params[:id])
  end
end
