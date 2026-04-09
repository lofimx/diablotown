class SessionsController < ApplicationController
  skip_before_action :verify_authenticity_token, only: [ :create, :destroy, :update_position ]

  # bcrypt hash of the other household wifi password
  ADMIN_PASSWORD_HASH = "$2a$12$cSAoGiAU4sJdFUWE1jaWcuVjqupiKc1ck8EYC0jqQMBV.wNednfbS"

  def create
    username = params[:username]&.strip
    character_class = params[:character_class].presence || "warrior"

    existing = User.find_by("LOWER(username) = ?", username&.downcase)

    if existing
      # If this browser already owns this identity (token cookie matches), just resume.
      if token_user == existing
        start_session(existing)
        render json: { username: existing.username, token: existing.token, character_class: existing.character_class }
      else
        render json: { error: "Username already taken" }, status: :conflict
      end
      return
    end

    user = User.new(username: username, character_class: character_class)
    if user.save
      set_token_cookie(user)
      start_session(user)
      render json: { username: user.username, token: user.token }
    else
      render json: { error: user.errors.full_messages.first }, status: :unprocessable_entity
    end
  end

  def show
    if current_user
      render json: { username: current_user.username, token: current_user.token }
    else
      render json: { authenticated: false }, status: :unauthorized
    end
  end

  def export
    if current_user
      render json: { username: current_user.username, token: current_user.token }
    else
      render json: { error: "Not authenticated" }, status: :unauthorized
    end
  end

  # Resume a session from the token cookie without requiring the user to do anything.
  def resume
    if token_user
      start_session(token_user)
      render json: { username: token_user.username, token: token_user.token }
    else
      render json: { error: "No saved identity" }, status: :unauthorized
    end
  end

  def destroy
    cookies.delete(:session_active)
    render json: { ok: true }
  end

  def update_position
    if current_user
      current_user.update!(
        last_map_id: params[:map_id],
        last_x: params[:x],
        last_y: params[:y]
      )
      render json: { ok: true }
    else
      render json: { error: "Not authenticated" }, status: :unauthorized
    end
  end

  def import
    token = params[:token]&.strip
    user = User.find_by(token: token)

    if user
      set_token_cookie(user)
      start_session(user)
      render json: { username: user.username }
    else
      render json: { error: "Invalid token" }, status: :not_found
    end
  end

  def admin_login
    return render json: { error: "Not authenticated" }, status: :unauthorized unless current_user

    password = params[:password]
    if BCrypt::Password.new(ADMIN_PASSWORD_HASH) == password
      current_user.update!(admin_password_digest: BCrypt::Password.create(password))
      render json: { admin: true }
    else
      render json: { error: "Invalid password" }, status: :forbidden
    end
  end

  def admin_logout
    return render json: { error: "Not authenticated" }, status: :unauthorized unless current_user

    current_user.update!(admin_password_digest: nil)
    render json: { admin: false }
  end

  def is_admin
    if current_user&.admin?
      render json: "true", status: :ok
    else
      render json: "false", status: :forbidden
    end
  end

  private

  def set_token_cookie(user)
    cookies.signed.permanent[:token] = { value: user.token, httponly: true, same_site: :strict }
  end

  def start_session(user)
    cookies.signed[:session_active] = { value: user.token, httponly: true, same_site: :strict }
  end
end
