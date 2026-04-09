module Api
  class MapsController < ApplicationController
    skip_before_action :verify_authenticity_token

    def index
      maps = GameMap.all.select(:id, :name, :width, :height, :spawn_x, :spawn_y, :tileset, :video_mode)
      render json: maps
    end

    def show
      map = GameMap.find(params[:id])
      render json: map
    end

    def create
      map = GameMap.new(map_params)
      if map.save
        render json: map, status: :created
      else
        render json: { errors: map.errors.full_messages }, status: :unprocessable_entity
      end
    end

    def update
      map = GameMap.find(params[:id])

      update_params = map_params
      # Prevent race: only accept tile_data if the map doesn't already have it
      if params[:tile_data].present? && map.tile_data.present?
        update_params = update_params.except(:tile_data)
      end

      if map.update(update_params)
        render json: map
      else
        render json: { errors: map.errors.full_messages }, status: :unprocessable_entity
      end
    end

    # POST /api/maps/:id/regenerate — clear tile_data so the next client regenerates the map
    def regenerate
      map = GameMap.find(params[:id])
      map.update!(tile_data: nil)
      render json: map
    end

    private

    def map_params
      params.permit(:name, :width, :height, :tile_data, :spawn_x, :spawn_y, :tileset, :video_mode)
    end
  end
end
