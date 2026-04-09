class MapChannel < ApplicationCable::Channel
  def subscribed
    @map_id = params[:map_id]
    stream_from "map_#{@map_id}"

    Rails.logger.info "[MapChannel] #{current_user.username} joined map_#{@map_id}"

    ActionCable.server.broadcast("map_#{@map_id}", {
      type: "player_joined",
      username: current_user.username
    })
  end

  def unsubscribed
    Rails.logger.info "[MapChannel] #{current_user.username} left map_#{@map_id}"

    ActionCable.server.broadcast("map_#{@map_id}", {
      type: "player_left",
      username: current_user.username
    })
  end

  def move(data)
    ActionCable.server.broadcast("map_#{@map_id}", {
      type: "player_moved",
      username: current_user.username,
      x: data["x"],
      y: data["y"],
      direction: data["direction"],
      character_class: current_user.character_class
    })
  end

  def call_lines(data)
    ActionCable.server.broadcast("map_#{@map_id}", {
      type: "call_lines",
      username: current_user.username,
      lines: data["lines"]
    })
  end

  def video_status(data)
    ActionCable.server.broadcast("map_#{@map_id}", {
      type: "video_status",
      username: current_user.username,
      video_enabled: data["video_enabled"]
    })
  end

  def signal(data)
    Rails.logger.info "[MapChannel] WebRTC signal #{data['signal_type']} from #{current_user.username} to #{data['to']}"

    ActionCable.server.broadcast("map_#{@map_id}", {
      type: "signal",
      from: current_user.username,
      to: data["to"],
      signal_type: data["signal_type"],
      payload: data["payload"]
    })
  end
end
