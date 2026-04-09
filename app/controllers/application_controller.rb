class ApplicationController < ActionController::Base
  allow_browser versions: :modern

  private

  # The user is "logged in" when they have both an active session cookie AND
  # a permanent token cookie that resolves to a User record.
  def current_user
    return @current_user if defined?(@current_user)

    @current_user = if cookies.signed[:session_active] && cookies.signed[:token]
      User.find_by(token: cookies.signed[:token])
    end
  end
  helper_method :current_user

  # The user whose token cookie is stored on this browser, regardless of
  # whether they have an active session. Used to auto-resume on login.
  def token_user
    @token_user ||= User.find_by(token: cookies.signed[:token]) if cookies.signed[:token]
  end
  helper_method :token_user
end
