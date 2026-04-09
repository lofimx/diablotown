class EditorController < ApplicationController
  def index
    @maps = GameMap.all
  end

  def show
    @map = GameMap.find(params[:id])
  end
end
