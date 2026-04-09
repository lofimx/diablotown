module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :current_user

    def connect
      self.current_user = find_verified_user
    end

    private

    def find_verified_user
      token = cookies.signed[:token]
      session = cookies.signed[:session_active]
      if token && session && (user = User.find_by(token: token))
        user
      else
        reject_unauthorized_connection
      end
    end
  end
end
