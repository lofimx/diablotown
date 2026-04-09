Rails.application.routes.draw do
  # Health check
  get "up" => "rails/health#show", as: :rails_health_check

  # Identity / Session
  get  "session" => "sessions#show"
  post "session" => "sessions#create"
  delete "session" => "sessions#destroy"
  post "session/resume" => "sessions#resume"
  get  "session/export" => "sessions#export"
  post "session/import" => "sessions#import"
  post   "session/admin_login" => "sessions#admin_login"
  delete "session/admin_logout" => "sessions#admin_logout"
  get    "session/is_admin" => "sessions#is_admin"
  patch "session/position" => "sessions#update_position"

  # API
  namespace :api do
    resource :ice_servers, only: :show
    resources :maps, only: [ :index, :show, :create, :update ] do
      member do
        post :regenerate
      end
    end
  end

  # Map Editor
  get "editor" => "editor#index"
  get "editor/:id" => "editor#show", as: :editor_map

  # Game views
  root "game#index"
  get "map/:id" => "game#show", as: :game_map
end
