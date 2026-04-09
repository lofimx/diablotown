module Api
  class IceServersController < ApplicationController
    skip_before_action :verify_authenticity_token

    # GET /api/ice_servers
    # Returns ICE server configuration with short-lived TURN credentials from Cloudflare.
    # Caches credentials server-side for half their TTL to avoid hammering the API.
    def show
      ice_servers = Rails.cache.fetch("cloudflare_ice_servers", expires_in: CACHE_TTL) do
        fetch_cloudflare_credentials
      end

      if ice_servers
        render json: { ice_servers: ice_servers }
      else
        render json: { ice_servers: FALLBACK_ICE_SERVERS }
      end
    end

    private

    CREDENTIAL_TTL = 86400 # 24 hours
    CACHE_TTL = CREDENTIAL_TTL / 2 # refresh at half-life

    FALLBACK_ICE_SERVERS = [
      { urls: "stun:stun.cloudflare.com:3478" }
    ].freeze

    def fetch_cloudflare_credentials
      key_id = Rails.application.credentials.dig(:cloudflare, :turn_key_id)
      api_token = Rails.application.credentials.dig(:cloudflare, :turn_api_token)

      unless key_id.present? && api_token.present?
        Rails.logger.warn "[ICE] cloudflare.turn_key_id or cloudflare.turn_api_token not set in credentials"
        return nil
      end

      uri = URI("https://rtc.live.cloudflare.com/v1/turn/keys/#{key_id}/credentials/generate-ice-servers")
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true
      http.open_timeout = 5
      http.read_timeout = 5

      request = Net::HTTP::Post.new(uri)
      request["Authorization"] = "Bearer #{api_token}"
      request["Content-Type"] = "application/json"
      request.body = { ttl: CREDENTIAL_TTL }.to_json

      response = http.request(request)

      unless response.is_a?(Net::HTTPSuccess)
        Rails.logger.error "[ICE] Cloudflare TURN API error: #{response.code} #{response.body}"
        return nil
      end

      data = JSON.parse(response.body)
      normalize_ice_servers(data["iceServers"])
    rescue StandardError => e
      Rails.logger.error "[ICE] Cloudflare TURN API request failed: #{e.message}"
      nil
    end

    # Collapse Cloudflare's response into exactly 2 iceServers entries
    # (1 STUN + 1 TURN) to stay under the browser's 5-entry warning threshold.
    # Filters out port 53 URLs (blocked by Chrome and Firefox).
    def normalize_ice_servers(ice_servers)
      stun_urls = []
      turn_urls = []
      username = nil
      credential = nil

      Array(ice_servers).each do |server|
        Array(server["urls"]).each do |url|
          next if url.include?(":53")

          if url.start_with?("stun:")
            stun_urls << url
          else
            turn_urls << url
            username ||= server["username"]
            credential ||= server["credential"]
          end
        end
      end

      servers = []
      servers << { urls: stun_urls } if stun_urls.any?
      servers << { urls: turn_urls, username: username, credential: credential } if turn_urls.any?
      servers.presence
    end
  end
end
