class User < ApplicationRecord
  validates :username, presence: true, uniqueness: { case_sensitive: false },
            format: { with: /\A[a-zA-Z0-9_]{2,20}\z/, message: "must be 2-20 characters, letters/numbers/underscores only" }
  validates :token, presence: true, uniqueness: true
  validates :character_class, inclusion: { in: %w[warrior rogue sorcerer monk] }

  before_validation :generate_token, on: :create

  def admin?
    admin_password_digest.present?
  end

  def authenticate_admin(password)
    return false unless admin_password_digest.present?
    BCrypt::Password.new(admin_password_digest) == password
  end

  def admin_password=(password)
    self.admin_password_digest = BCrypt::Password.create(password)
  end

  private

  def generate_token
    self.token ||= SecureRandom.hex(32)
  end
end
