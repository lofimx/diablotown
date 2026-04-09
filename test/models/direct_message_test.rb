require "test_helper"

class DirectMessageTest < ActiveSupport::TestCase
  test "valid message saves" do
    msg = DirectMessage.new(
      sender: users(:alice),
      recipient: users(:bob),
      content: "Hello!"
    )
    assert msg.valid?
  end

  test "content is required" do
    msg = DirectMessage.new(
      sender: users(:alice),
      recipient: users(:bob),
      content: ""
    )
    assert_not msg.valid?
    assert_includes msg.errors[:content], "can't be blank"
  end

  test "content cannot exceed 2000 characters" do
    msg = DirectMessage.new(
      sender: users(:alice),
      recipient: users(:bob),
      content: "x" * 2001
    )
    assert_not msg.valid?
  end

  test "content at exactly 2000 characters is valid" do
    msg = DirectMessage.new(
      sender: users(:alice),
      recipient: users(:bob),
      content: "x" * 2000
    )
    assert msg.valid?
  end

  test "sender is required" do
    msg = DirectMessage.new(
      recipient: users(:bob),
      content: "Hello!"
    )
    assert_not msg.valid?
  end

  test "recipient is required" do
    msg = DirectMessage.new(
      sender: users(:alice),
      content: "Hello!"
    )
    assert_not msg.valid?
  end
end
