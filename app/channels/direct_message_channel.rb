class DirectMessageChannel < ApplicationCable::Channel
  def subscribed
    stream_from "dm_user_#{current_user.id}"
  end

  def send_message(data)
    recipient = User.find_by("LOWER(username) = ?", data["to"]&.downcase)
    return unless recipient

    message = DirectMessage.create!(
      sender: current_user,
      recipient: recipient,
      content: data["message"].to_s.strip[0, 2000]
    )

    ActionCable.server.broadcast("dm_user_#{recipient.id}", {
      type: "direct_message",
      from: current_user.username,
      message: message.content,
      timestamp: message.created_at.utc.iso8601
    })
  end
end
