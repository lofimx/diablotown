
## Too big character on movement, tiles not aligning

This is better again, and again still incorrect.

1. **Characters**
  * **Character Sprite Size:** The character's sprite offset is now correct for movement, but the rendered sprite enlargens whenever the character is moving. The rendered sprite should always remain the same.
  * **Walking Animations:** The character's walking animation is still not in place. When the character is moving, walking sprites should be used.
2. **Rendering**
  * **Scaling Factor:** Feel free to make the scaling factor for map and character tiles only support integers (1x, 2x, 3x, etc.) to avoid situations where fractional scaling will break rendering to the canvas.
  * **Horizontally Misaligned Tiles:** The map now renders as isometric tiles, but there are narrow vertical black lines between (almost) every column of tiles. This seems to be an off-by-one error rendering the wrong pixels at one edge.
3. **Walls:**
  * **Solid/Boundaries:** "Walls" should be represented by the **boundaries** (edges) of isometric tiles, not by the tiles themselves. It will be necessary to calculate which map tiles correspond to a wall(s) on which of the 4 edges of the tile, then prevent the character from moving through these.
  * **Gateways:** Allow the user to pass through the wood doors (or any doors) and metal grates for now. If the user clicks on them, they can animate open, but they shouldn't represent walls.
4. **Map Generation:** The map generator seems to be generating maps based on its square (not isometric) understanding of maps. It should align the isometric tiles so walls line up and there are isometric walls on the edges of the map. Isometric paths between walls and through large open areas should be coherent. Prefer larger open areas (floor tiles only) to a lot of hallways or walls.

Make a plan and todo list for this work. Do one task at a time, then get me to check the work. Start from any one of the above 4 tasks, if you see interdependencies between them.

### Character Animation

This is an improvement, but the walking animation sprites are not used at all. Looking at the rogue sprites, I can see that the walking animations are all in rows 9 to 16, under the text "idle" and "idle in town" in the second thick horizontal green line. There are walking animations for 8 directions of movement, with 8 frames/columns, in this order from top to bottom (starting from row 9):

1. South (down)
2. Southwest (diagonal down/left)
3. West (left)
4. Northwest (diagonal up/left)
5. North (up)
6. Northeast (diagonal up/right)
7. East (right)
8. Southeast (diagonal down/right)

Replace the characters walking animation with these.

### Walls

There are a few problems. First, the character can walk through wall tiles, such as bricks and pillars. Second, those wall tiles do not have any collision detection. My guess is these two issues are presented because the wall tiles are not actually seen to represent walls, but simply floor tiles.

The wall detection at the edge of the map is correct.

Another problem, somewhat related, is that the character's sprite is animated on top of all tiles, but should appear "behind" wall tiles, in z-ordering.

The issue of wall tiles being used as floor tiles is a bigger problem, though. Perhaps highlight each tile (at the top of the z-ordering, so I can see it) with a semi-transparent color denoting whether it is a floor tile or a tile with a partial wall. I can help you debug that way. Most floor tiles are the large, brown, irregular bricks or bloody versions of that or crumbled walls. Stairs are also floor tiles, but they're quite uncommon, since they should denote descent into another area (or the entrance).

### Walls 2

This much better and also really helpful. Add a "Debug" option under "Logout" that opens a menu with a toggle to turn on this view -- let's keep it around for diagnosing bugs in the future.

The green diamonds are correctly identifying floor tiles. The red diamonds are correctly identifying map borders and wall tiles are placed **near** these borderes. There are no longer any wall tiles in the middle of maps. (Wall tiles can be placed in the middle of maps, by the way, but they should be coherent and match. The current setup with no walls in the middle of maps is fine, since coherence between tiles is very weak.)

I do not see any blue edge lines at all, but there are door tiles present, so these are mis-identified (or not identified at all).

The z-order of the character is still wrong, but that is probably in part because the wall tiles are only partly identified. For example, "12,6" is a half-wall tile and shouldn't appear at the boundary of the map/room. "8,1" (where the player is currently standing, if you can see that data) is a NW/SE wall but the boundary is NE/SW and so a wall rotated 90 degrees should be used there. The walls should also appear on the wall edge, not inside the wall edge tiles.

### Bottom-most (S/E) Walls

I see the problem. The issue is with the tileset: it does not separate wall tiles from floor tiles. It's therefore impossible to render walls on the "bottom" of a tile, since no such image exists.

I've backed up [@church_dungeon.png](file:///home/steven/work/lofimx/helltown/app/assets/sprites/tiles/church_dungeon.png) . Add an extra set of tiles to the bottom which use the tiles from columns 1 to 5 in row 5. Remove the floor portion from these, leaving only the walls. If that works, then I'll get you to use these "wall only" tiles for the bottom-most walls.

Update: No, that's definitely not right. The "plain" wall tiles I'm referring to begin roughly at (x=0,y=768) and end at roughly (x=640,y=964).

You can't just drop the bottom half of the image, either. You'll need to remove an isometric diamond from the bottom portion of the image where the floor tile is.

I've reset [@church_dungeon.png](file:///home/steven/work/lofimx/helltown/app/assets/sprites/tiles/church_dungeon.png) to the backup - try again.

## Map Tile Coherence

Now that we have a functional layout, the "floor" tiles need to remain coherent with one another. In general, prefer plain stone/brick floor tiles as the most common.

Blood floor tiles are permitted, but they require a room entirely covered in bloody tiles, including the walls. Blood tiles are all available in Row 9. The continuity of blood tiles can end at doorways (marked by blue lines in Debug mode).

Outside of plain stone/brick floor tiles, the occasional pillar (mostly found in the first row), the torch (found in the 7th row, 8th column), and the basic sarcophagus (7th row, 11th column) can be added throughout the otherwise open rooms. The sarcophagus **acts as a wall** and cannot be penetrated by the player from any direction.

As for walls, generally prefer the simple walls tiles from the 1st, 5th, and 6th rows.

Try to keep map layouts as simple as possible. We'll add more details and variation later.

### Map Tile Tweaks

The "wall" blocking effect of the sarcophagus should only be half an isometric tile wide, along the length of the sarcophagus. As it stands, the player is prevented from walking through the floor tile adjacent to the sarcophagus.

Create an object model (with unit tests) for weighting and clustering map tiles. More frequent map tiles should be weighted heavily. Rare map tiles should be weighted with light weights. Clusters will define objects which require multiple tiles to construct. All of the following coordinates are zero-indexed.

Weight the simplest floor tiles most heavily:

* 12,0 - plain bricks
* 12,6 - light rubble

With some small decorations, sporadically:

* 7,6 - lamp
* 3,5 - blood splatter
* 13,3 - plain brick with small shadow

Object: Special sarcophagus - Rarely render the special sarcophagus and only render its components together:

* 10,3 - lower part of special sarcophagus
* 11,3 - upper part of special sarcophagus

Object: Stone circle - these tiles must be rendered into a coherent circle together, if ever. Rare.

* 4,2 to 15,2

Never render fully black tiles or stair tiles (which are special for switching maps), such as:

* 17,0 P - full black
* 3,3 - stairs

### Further Map Tile Tweaks

This actually needs to be a less common decoration. It appears as "bumps" when it repeats heavily:

* 13,3 - plain brick with shadow

Never use the following tiles for **exterior** walls. They will be used for interior walls since they appear "broken", as pillars, archways, etc:

* 0,4 LR
* 2,0 LR
* 8,0 LR
* 11,0 R
* 14,0 LR
* 17,5 R
* 18,0 LR
* 18,5 LR
* 19,0 LR
* 19,5 R

Add an option to the Debug menu in the HUD, for now, to bounce the map from the client side. While working on the HUD, brighten the border of the Debug and Logout buttons and add the same background that the Debug dropdown has so it's not transparent (making it more visible).

## Modify WebRTC video to use map palette

We want to restrict the palette of the video taken from the webcamera before sending it over WebRTC.

While on a cathedral map, the WebRTC video must be reduced in palette to the 256 colors available from [@diablo1_cathedral.json](file:///home/steven/work/lofimx/helltown/app/assets/palette/diablo1_cathedral.json). As of this writing, the only map available is a cathedral map.

While on a town (Tristram) map, the WebRTC video must be reduced in palette to the 256 colors available from [@diablo1_tristram.json](file:///home/steven/work/lofimx/helltown/app/assets/palette/diablo1_tristram.json).

These palettes are extracted with `script/extract_palette.rb` and other maps' palettes can similarly be extracted in the future.

### Video Palette Tweaks

That works.

1. Add a background and border to the user's name under the video so it's easier to read, similar to the HUD menu items.
2. I've added the AvQest font at `/home/steven/Downloads/avqest-font/avqest-eeel.ttf` -- make the text size throughout the app larger and use this font for everything
3. If the user clicks on the video, it should double in size to 320x240 but without any antialiasing. Try to map 1 pixel to 4 pixels directly, avoiding any expensive translation if possible.

**Experiments**

* Within the palette-transformed video, try replacing full white (#ffffff) with a dark grey instead.
  * Add a function that explicitly performs experimental transformations like this, so further experiments are colocated there.
* Maintain a user's position on the map in the database so when they next log in, they return to where they were when the logged out or closed the window, rather than always returning to the origin.
* The character's name above their head sits a bit too high. Lower it by about half a tile's height.
* Instead of full white (#ffffff) pixels being replaced with dark grey, replace them with a variety of blood colors as extracted from the "blood on floor" tiles. These can include colors other than red and should be applied to the bright white pixels either semi-randomly (not completely random... more of a gradient) OR simply reuse the "blood on floor" tiles directly and mask them directly into the video, replacing the full white pixels with whatever tile pixel would show in its place at that location. Either works, but let me know which you choose.

## Switch to Postgres 17 and Set Up Kamal

1. Switch to Postgres 17 from SQLite; borrow the general DB configuration from `~/work/lofimx/savebutton-web`, switching the database to `diablo_{development,test,production}` and switching the user to `diablo`
2. Borrow the general concept of Kamal configuration from `~/work/lofimx/savebutton-web/config/deploy.yml`, switching `savebutton.com` to `diablo.town`, `kaya_server_storage` to `diablo_server_storage`, and the postgres user to `diablo`. Let me know what secrets and environment variables you need configured.
3. Make sure we have all the Postgres and Kamal config we need to deploy to production. Make sure we don't have any mention of `kaya` or `savebutton.com` anywhere in the helltown codebase.

## Separate "Session" and "Token"

Currently, if the user clicks "logout", the session ends completely as the token/secret associated with that account is completely removed. The user has no way to get it back. When the user clicks "logout", it should end their session (perhaps clearing a session cookie) but **not** delete their token. There should be no way for the system to delete the token, since this is the user's only way of logging in.

## Player Menu

Move the player's name from the upper-left over to the upper-right with the other buttons. Add a border and background to it, then make the token and logout options into menu items that show up when the player clicks their name. To the list of menu items, add "Map Editor" and "Admin Login", totalling. In this order:

* Token
* Admin Login
* Map Editor
* Logout

The Admin Login should prompt the user for a password with a widget similar to that of the login screen, but with no text or prompts, just a textbox and "Cancel" button to close the dialog. For now, the admin password can be hardcoded to '\[redacted\]', but stored as a hash so it's not plaintext in the database. If the user successfully logs in as an admin, the `/session/is_admin` route should return "true" and 200, otherwise "false" and an appropriate 4xx.

The Map Editor should open the `/editor` route in a new tab but only if the player is logged in as an admin already. Use `/session/is_admin` to check.

The Debug button should remain on the main screen, but only display if the player is logged in as an admin already.

## BUG: WebRTC not working

I'm getting the following errors with other users:

```
Layout was forced before the page was fully loaded. If stylesheets are not yet loaded this may cause a flash of unstyled content. index.js:1267:1
downloadable font: bad table directory searchRange (font-family: "AvQest" style:normal weight:400 stretch:100 src index:0) source: https://diablo.town/game/fonts/Avqest.ttf
downloadable font: bad table directory rangeShift (font-family: "AvQest" style:normal weight:400 stretch:100 src index:0) source: https://diablo.town/game/fonts/Avqest.ttf
downloadable font: cmap: bad id_range_offset (font-family: "AvQest" style:normal weight:400 stretch:100 src index:0) source: https://diablo.town/game/fonts/Avqest.ttf
downloadable font: hdmx: the table should not be present when bit 2 and 4 of the head->flags are not set (font-family: "AvQest" style:normal weight:400 stretch:100 src index:0) source: https://diablo.town/game/fonts/Avqest.ttf
downloadable font: Table discarded (font-family: "AvQest" style:normal weight:400 stretch:100 src index:0) source: https://diablo.town/game/fonts/Avqest.ttf
Tileset: 60 floor (6 blood), 150 wall (pref W:16 N:19 C:2), 5 wall-only TileMap.ts:280:13
[WebRTC] palettePath: /game/palette/diablo1_cathedral.json WebRTCManager.ts:105:15
Uncaught (in promise) DOMException: No remoteDescription.
    handleIceCandidate WebRTCManager.ts:174
    z WebRTCManager.ts:60
    onmessage CableClient.ts:55
21 application-DIGJTe00.js:5
[WebRTC] getUserMedia OK, tracks: 
Array [ "audio:Blue Microphones Analog Stereo", "video:Laptop Webcam Module (2nd Gen):" ]
WebRTCManager.ts:110:15
[PaletteFilter] Fetching palette from: /game/palette/diablo1_cathedral.json PaletteFilter.ts:46:13
Uncaught (in promise) DOMException: No remoteDescription.
    handleIceCandidate WebRTCManager.ts:174
    z WebRTCManager.ts:60
    onmessage CableClient.ts:55
application-DIGJTe00.js:5
[PaletteFilter] Loaded 256 colors, building LUT... PaletteFilter.ts:52:13
[PaletteFilter] LUT built, ready=true PaletteFilter.ts:56:13
[PaletteFilter] Extracting blood floor diamond at (1290, 1672) size 128x64 PaletteFilter.ts:94:15
[PaletteFilter] Blood texture: 320x240, 72080/76800 opaque pixels (93.9%) PaletteFilter.ts:132:15
[WebRTC] Palette loaded, applying filter... WebRTCManager.ts:119:19
[PaletteFilter] Source video created, readyState: 0 PaletteFilter.ts:187:13
[PaletteFilter] canvasStream tracks: 1 PaletteFilter.ts:200:13
[WebRTC] Filtered stream tracks: 
Array [ "video:{3070bfa", "audio:{4bfed94" ]
WebRTCManager.ts:121:19
[PaletteFilter] processFrame skip: video.readyState= 0 12 PaletteFilter.ts:231:42
[PaletteFilter] First frame processing! video.readyState= 4 size= 1280 x 720 PaletteFilter.ts:236:40
WebRTC: ICE failed, add a TURN server and see about:webrtc for more details
[PaletteFilter] Processed 150 frames PaletteFilter.ts:237:46
[PaletteFilter] Processed 300 frames PaletteFilter.ts:237:46
[PaletteFilter] Processed 450 frames PaletteFilter.ts:237:46
[PaletteFilter] Processed 600 frames PaletteFilter.ts:237:46
[PaletteFilter] Processed 750 frames PaletteFilter.ts:237:46
[PaletteFilter] Processed 900 frames PaletteFilter.ts:237:46
WebRTC: ICE failed, add a TURN server and see about:webrtc for more details
[PaletteFilter] Processed 1050 frames PaletteFilter.ts:237:46
[PaletteFilter] Processed 1200 frames PaletteFilter.ts:237:46
[PaletteFilter] Processed 1350 frames PaletteFilter.ts:237:46
[PaletteFilter] Processed 1500 frames PaletteFilter.ts:237:46
```

## WebRTC.js Polyfill

Use https://github.com/webrtcHacks/adapter polyfill for WebRTC. Add to Architecture doc in `doc/bort`. We accidentally put `adapterjs` in there instead.

Re-implmement the entire WebRTC functionality using the webrtcHacks adapter for cross-browser compatibility.

## BUG: WebRTC - third user

A third video user is getting this error in the console:

```
XHR
GET
https://diablo.town/session/is_admin
[HTTP/2 403  114ms]

 Tileset: 60 floor (6 blood), 150 wall (pref W:16 N:19 C:2), 5 wall-only TileMap.ts:280:1
 (https://diablo.town/app/javascript/game/TileMap.ts)3WebRTC: Using five or more STUN/TURN servers slows down discovery application-BNf-gw5R.js:3
 (https://diablo.town/vite/assets/application-BNf-gw5R.js)9[WebRTC] palettePath: /game/palette/diablo1_cathedral.json 2 WebRTCManager.ts:123:1
 (https://diablo.town/app/javascript/network/WebRTCManager.ts)5WebRTC: Using five or more STUN/TURN servers slows down discovery application-BNf-gw5R.js:3
 (https://diablo.town/vite/assets/application-BNf-gw5R.js)9[WebRTC] getUserMedia OK, tracks:
 Array [ "audio:Logitech BRIO", "video:Logitech BRIO" 
] WebRTCManager.ts:128:
1 (https://diablo.town/app/javascript/network/WebRTCManager.ts)5[PaletteFilter] Fetching palette from: /game/palette/diablo1_cathedral.json PaletteFilter.ts:46:
1 (https://diablo.town/app/javascript/network/PaletteFilter.ts)3[WebRTC] getUserMedia OK, tracks
: Array [ "audio:Logitech BRIO", "video:Logitech BRIO"
 ] WebRTCManager.ts:128
:1 (https://diablo.town/app/javascript/network/WebRTCManager.ts)5[PaletteFilter] Fetching palette from: /game/palette/diablo1_cathedral.json PaletteFilter.ts:46
:1 (https://diablo.town/app/javascript/network/PaletteFilter.ts)3[PaletteFilter] Loaded 256 colors, building LUT... PaletteFilter.ts:52
:1 (https://diablo.town/app/javascript/network/PaletteFilter.ts)3[PaletteFilter] LUT built, ready=true PaletteFilter.ts:56
:1 (https://diablo.town/app/javascript/network/PaletteFilter.ts)3[PaletteFilter] Extracting blood floor diamond at (1290, 1672) size 128x64 PaletteFilter.ts:94
:1 (https://diablo.town/app/javascript/network/PaletteFilter.ts)5[PaletteFilter] Blood texture: 320x240, 72080/76800 opaque pixels (93.9%) PaletteFilter.ts:132
:1 (https://diablo.town/app/javascript/network/PaletteFilter.ts)5[WebRTC] Palette loaded, applying filter... WebRTCManager.ts:137
:1 (https://diablo.town/app/javascript/network/WebRTCManager.ts)9[PaletteFilter] Source video created, readyState: 0 PaletteFilter.ts:187
:13 (https://diablo.town/app/javascript/network/PaletteFilter.ts)[PaletteFilter] canvasStream tracks: 1 PaletteFilter.ts:200
:13 (https://diablo.town/app/javascript/network/PaletteFilter.ts)[WebRTC] Filtered stream track
s: Array [ "video:{8311a54", "audio:{ca2cfd1
" ] WebRTCManager.ts:13
9:19 (https://diablo.town/app/javascript/network/WebRTCManager.ts)[PaletteFilter] Loaded 256 colors, building LUT... PaletteFilter.ts:5
2:13 (https://diablo.town/app/javascript/network/PaletteFilter.ts)[PaletteFilter] LUT built, ready=true PaletteFilter.ts:5
6:13 (https://diablo.town/app/javascript/network/PaletteFilter.ts)[PaletteFilter] Extracting blood floor diamond at (1290, 1672) size 128x64 PaletteFilter.ts:9
4:15 (https://diablo.town/app/javascript/network/PaletteFilter.ts)[PaletteFilter] Blood texture: 320x240, 72080/76800 opaque pixels (93.9%) PaletteFilter.ts:13
2:15 (https://diablo.town/app/javascript/network/PaletteFilter.ts)[WebRTC] Palette loaded, applying filter... WebRTCManager.ts:13
7:19 (https://diablo.town/app/javascript/network/WebRTCManager.ts)[PaletteFilter] Source video created, readyState: 0 PaletteFilter.ts:18
7:13 (https://diablo.town/app/javascript/network/PaletteFilter.ts)[PaletteFilter] canvasStream tracks: 1 PaletteFilter.ts:20
0:13 (https://diablo.town/app/javascript/network/PaletteFilter.ts)[WebRTC] Filtered stream trac
ks: Array [ "video:{f2543e2", "audio:{ca2cfd
1" ] WebRTCManager.ts:1
39:19 (https://diablo.town/app/javascript/network/WebRTCManager.ts)[PaletteFilter] processFrame skip: video.readyState= 0 PaletteFilter.ts:2
31:42 (https://diablo.town/app/javascript/network/PaletteFilter.ts)[PaletteFilter] First frame processing! video.readyState= 4 size= 160 x 120 PaletteFilter.ts:2
36:40 (https://diablo.town/app/javascript/network/PaletteFilter.ts)[PaletteFilter] Processed 150 frames PaletteFilter.ts:2
37:46 (https://diablo.town/app/javascript/network/PaletteFilter.ts)[PaletteFilter] Processed 300 frames PaletteFilter.ts:2
37:46 (https://diablo.town/app/javascript/network/PaletteFilter.ts)WebRTC: ICE failed, your TURN server appears to be broken, see about:webrtc for more deta
ils 2 [PaletteFilter] Processed 450 frames PaletteFilter.ts:
```

## Retroactive: Switch to Cloudflare TURN server

(This prompt was not used; historical.)

* switch to Cloudflare TURN server
* add `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_API_TOKEN` to Rails encrypted credentials
  * these are also stored in Bitwarden

## Clean up old Docker images from Docker Hub

Gemini says there is no Retention Policy option (clean inactive images) in the web GUI for the Free/Personal tier, so we'll have to use the Docker Hub API and create a script I run periodically.

Add a script to [@script](file:///home/steven/work/lofimx/helltown/script) that uses the Docker Hub API to clean up old/inactive images. Any image inactive within the past 48 hours is fine to remove.

I've added a `KAMAL_REGISTRY_CLEANUP_PASSWORD` var to [@.env](file:///home/steven/work/lofimx/helltown/.env), which should be used for this script. Mention this cleanup script as a step that can be run between `source .env` and `kamal deploy` in README.md.

## Add a map user list, text visibility

Under the name of the map in the upper-left (ex. "Tristram"), write "{N} Users Online:" and under that vertically list all the users who are logged onto that map. Change the font rendering for other users' identities so that they are as visible as the current player/user. Then also use that same font rendering (brighter yellow, outline, etc.) for the map name and the usernames that show underneath.

## Make video connections explicit

Read [@README.md](file:///home/steven/work/lofimx/helltown/doc/bort/README.md).

Currently, video connections are based on proximity to other players. However, this appears to lead to an alpha/beta negotiation issue where all users are attempting to connect to all other users simultaneously. It also makes video chats jerky if the users walk around and go out of range.

First, add "Settings" to the Account menu. This should open a widget in the center of the screen, similar to the login window. The Settings window should have:

* Enable/Disable Microphone (using browser setting)
* Enable/Disable Video (using browser setting)

Clicking "Enable" will prompt the user for permission. Clicking "Disable" will remove permission in the browser. If both options are disabled, a warning stating "Video Calls Require Microphone OR Video" underneath.

Make the video connection format map-specific. Extract the proximity-based video chat code into a class called `ProximityVideo`. Then add another class called `ExplicitVideo` which conforms to the same API as `ProximityVideo`.

**Initiate Connection:** The behaviour of `ExplicitVideo` should be that users can hover their mouse cursor over another player, which will add a visual "aura" around that player. They shouldn't see this aura if they hover over themselves. If they click the other player, they should initiate WebRTC connection negotiation. The receiving player does not need to do anything; if they have video enabled their acceptance of the connection should be automatic. When the connection is established, draw a line (white-to-gray gradient) from the initiating player to the receiving player. Maintain the line position as players move around. Both players who have joined the WebRTC call get a red (instead of yellow) "End Call" button to the left of their Account menu. The initiating player becomes the **Hub Node** in the WebRTC graph.

**Add Connections:** Other players may add themselves to an existing WebRTC connection, or group of connections. If they click on **any player** from an existing WebRTC connection (which they should be able to identify, due to the white/gray line(s) indicating a WebRTC connection), it should initiate a connection to the **Hub Node** first, then other players in the WebRTC mesh. Once connections have been made, draw the same white-to-gray gradient line from the Hub Node to the newly-connected player. As more connections are added, the Hub Node becomes the "hub" of a hub-and-spoke image, even though the players in a WebRTC conversation are all connected to one another in a P2P mesh.

**Defaults and Disable WebRTC Connections:** All players should be open to receiving an initiated video connection ("Allow Video Chat" = true) by default. The app should request microphone and video permissions as soon as the player joins, unless permissions are already turned on. When video and microphone are **both disabled**, it prevents other users from seeing an aura on (or clicking) other players; instead, when a user hovers over another user that has video disabled, the cursor will become a "not allowed" cursor while hovering. If only one of of microphone or video is enabled, users can still join WebRTC connections with their enabled I/O.

### Explicit Video Tweaks

* make the line between two players the same yellow as the bright yellow in [@flare_yellow.png](file:///home/steven/work/lofimx/helltown/public/game/sprites/effects/flare_yellow.png). Don't bother with the gradient and the line can be the last thing drawn on the screen. The line should be drawn on **all players' screens**, not just the players involved in the call.
* As long as a connection is established between two (or more) players, do not show the Aura when one of those players hovers over the other with the mouse. The aura suggests they can connect; this isn't necessary, since they're already connected.
* If a player enlarges the video of someone they are on a call with, remember this. It doesn't need to be a long-running preference; it can just be a cookie.
* Show the player's own video feed back to themselves. Move the other players' video feed widgets to be left-aligned, at the bottom. The player's own video feed can be right-aligned. The player can enlargen their own video feed like they can for other players.
* Make the yellow line between two players "pulse" by widening and narrowing the width of the line rendered. At its minimum (smallest), it's two pixels wide, slightly larger than it is currently. As it grows wider, it should be comprised of multiple lines, up to a maximum of 8 pixels. At all sizes, the yellow lines should be surrounded by a border of dithered light and medium-dark yellow-greys. The width of the border should be equal to the width of the yellow line (at 2px line, the border is 2px on any side; at 7px line, the border is 7px on any side). Round the "corners" of the border and the end of the line so it never appears as a sharp rectangle.
  * That's better. The border dithering should be more low-fidelity, making the pixels more obvious. Probably 4 or 5 shades of gray are sufficient, with transparent pixels dithered into it. The border can be more grey and less yellow, according to whatever is available in the [@diablo1_cathedral.json](file:///home/steven/work/lofimx/helltown/public/game/palette/diablo1_cathedral.json) palette. The line itself should be rendered with a similar non-anti-aliased pixel density as the rest of the in-game graphics.
  * The "pixels" for the line should mimic the scaled pixels of the actual art in the game. At the moment, they appear to be about two times too small, so 2x2 "pixels" might suffice. The dithering is too consistent; dither to transparency more heavily toward the outer edges of the border and almost not at all near the yellow line. Tween the dithering from inside to outside. Do not dither the yellow line itself at all. You can look at [@light_source.png](file:///home/steven/work/lofimx/helltown/public/game/sprites/effects/light_source.png) for inspiration, if it helps.
  * There is some slight sheering/tearing between the yellow lines when they render on a diagnoal, since the lines don't fill in all the pixels perfectly when they line up (they do when the lines are vertical or horizontal). See if you can render some extra yellow pixels or additional lines which prevent those extra transparent pixels. The ends of the line are also slightly too low on the players' bodies. Raise the Y coordinate for both ends of the line by 1/8 of the player sprite height.
  * Local video should be horizontally mirrored: Since users are not accustomed to seeing themselves from the perspective of a third party, the user's own **local rendering of their own (and only their own)** video stream should be horizontally mirrored. This is a processing step which only happens for them; all other users should see their video without mirroring.

### BUG: Persistent local video after ending the call

When the user ends the call (or another user ends the call the current user is participating in), the user's own video stream should disappear, just as it would if the connection was broken.

### BUG: Video Connections to/from Chrome never complete

When a Firefox client initiates a video/WebRTC connection to a Chrome user, the local (Firefox) video opens and the Chrome client can see a connection is being attempted, but the Chrome video never opens and the connection line never appears on the receiving side.

When a Chrome client initiates a video/WebRTC connection to a Firefox user, the local (Chrome) video opens and the Firefox client can see a connection is being attempted, but the Firefox video never opens and the connection line never appears on the receiving side. 

Tweak: When a video stream can't be opened for some reason (ex: camera busy), render an animated [@flare_red.png](file:///home/steven/work/lofimx/helltown/public/game/sprites/effects/flare_red.png) (same animation as yellow flare) in place of a video for both the user with the failing video and other users in the video connection who would otherwise just see a black screen for that user.

### BUG: Always route ConnectionLine through "Hub User"

After connecting two users together (User1=Firefox, User2=Chromium), with User1 initiating, User2 initiates a connection to a 3rd user (User3=FirefoxPrivateWindow). User2 sees a ConnectionLine from User3 to User1, as he should. But User3 is seeing a ConnectionLine to User2 -- instead, he should see a ConnectionLine from himself (User3) back to User1, the Hub User, as User2 does. All users should always see the same ConnectionLines.

This effect should always be true, regardless of how many users connect together. They should always see their ConnectionLines connected from themselves to the Hub User, no matter who they clicked in the group to make their connection to the group.

Back to this: [@PROMPTS.md (355:360)](file:///home/steven/work/lofimx/helltown/PROMPTS.md#L355:360) (Above) ... the Hub User should be the **very first** initiator of any group of users connected in a call. It seems like the original initiator (steven2) has a connection to the user they clicked (Flargon), but when a 3rd user (steven00) joins the group by clicking Flargon, Flargon now sees ConnectionLines from both Steven2 AND Flargon to Steven00. Steven00 only sees one ConnectionLine from himself to Flargon. This suggests that Steven00 is seen as the Hub User, when in fact it's Steven2 who initiated the original call.

All users should see the same ConnectionLines. Connections are P2P, so the ConnectionLines aren't necessarily representative of the real connections. The ConnectionLines should always connect each user with a single line to the Hub User, regardless of how their connection was established (ie. regardless of which user they clicked to join, or which user clicked them).

It may be easiest again to solve this with more explicit signaling/broadcasting between users in a Video Connection. By doing so, we can also elect a new leader. We'll just do the simplest thing possible: the Hub User is just the first in a totally ordered list of users within the video connection. If the Hub User drops or ends the call, a message is broadcast and the second user in the list is promoted to Hub User, meaning the 3rd user becomes the 2nd in the list, and so on. Connection Lines should be redrawn to reflect who is the new Hub User.

Some bugs:

* while connecting user 'Steven2' to user 'Steven00', Steven2's browser is not showing any ConnectionLine at all
* when Steven2 initiates a second connection to user 'Flargon', Flargon and Steven00 see a ConnectionLine from Steven2 to Flargon, but Steven2 doesn't. If the Hub is now defined by **alphabetically first username**, then Flargon should be the Hub, but Flargon and steven00 still see a ConnectionLine from steven2 to steven00.
* if steven2 instead makes the first connection to flargon and flargon then connects to steven00, steven2 then sees a connectionline from steven2 to steven00, which doesn't make any sense within the new scheme at all

## Refactor Video Mesh into its own state machine

Read [@README.md](file:///home/steven/work/lofimx/helltown/doc/bort/README.md).

The state for managing video connections, Hub Users, callgroups, etc. is slopped all over the place. The I/O and external state/events can remain where they are currently managed, but a central entity typed as a new class `VideoMesh` should be extracted to manage all state within a client. `VideoMesh` will be a Finite State Machine. When messages are sent or received, call atomic methods on a `VideoMesh` object which cleanly return a new `VideoMesh` object which represents the new state. `VideoMesh` should not have any I/O or dependencies which would make it difficult to test. An instance of `VideoMesh` should represent a set of connections between 2 or more users who are sharing a video call. The game may have more than one `VideoMesh` object at a time, each representing different video calls between N participants with N*N p2p connections. Each `VideoMesh` should help render `ConnectionLines` between (N-1) users within a video call and the one Hub User.

Once behaviour and methods have been extracted into `VideoMesh`, write comprehensive tests for the `VideoMesh` internal state machine. Once the unit tests have been written, perform a self-evaluation of the merits of `VideoMesh`.

### VideoMeshSet

As you've suggested, extract a VideoMeshSet. You suggested `VideoMeshManager` but naming this class for a collection wrapper makes it more obvious that it's just managing a collection of `VideoMesh`es. Lean into "tell, don't ask" in the API design. Test-drive the extraction of this class.

Bug: There is a state management (or broadcasting) bug with ConnectionLines / VideoMesh / etc. If there are 3 users (steven2, Steven00, and zig) and the following steps are followed (1) steven2 connects to Steven00 then (2) zig connects to Steven00, steven00 sees the correct lines (both touching steven00) but zig only sees the line betwen zig and steven00 and steven2 only sees the line between steven2 and steven00.

## Add Direct Messages

Read [@README.md](file:///home/steven/work/lofimx/helltown/doc/bort/README.md).

Direct Messages are server-side and stored in the Postgres DB. Add a migration for this, according to the needs below.

The user should be able to click another user's name in the user list on the left. This should bring up a dialog (like the login dialog) that allows them to enter a direct message to that user, which they can then "Send" or "Cancel". On "send", the message is sent to the server with `from`, `to`, `message`, and a UTC `timestamp` (and any other useful data). The server then relays the message to the receiving user.

When the receiving user receives the message, it just pops up a dialog, for now. Include the "from" and timestamp (in browser's local time) at the top of the dialog. Text should be in the game font on a black background to make it easy to read. It should also be selectable and copy/paste-able.

## Pentagram Video Calls

Read [@README.md](file:///home/steven/work/lofimx/helltown/doc/bort/README.md).

Limit the number of users in a call to a maximum of **five.** As users join a call, continue to collect "hub and spoke" `ConnectionLine`s from the Hub User to other users **until the limit of five users is reached.** Once a call has five users, instead broadcast a message that they have achieved a pentagram. The first user is still the Hub User, but old lines are erased and new lines are now drawn between users like this:

1. User1 to User3
2. User2 to User4
3. User3 to User5
4. User4 to User1
5. User5 to User2

A "skip one" mapping should be very easy to do but you can also hardcode the mapping instead. Choose whichever is easier to deal with when a one of the five users inevitably disconnects.

When a user(s) disconnects, reducing the `VideoMesh` members to less than five, re-broadcast a return to the "hub and spoke" visualization of `ConnectionLine`s.

Test drive all these state transitions. Ask any questions you have before finalizing your plan.

## Switch from attack animations to idle animations

All players have an `IDLE_SECTION_Y` of 7 (px) but the first 8 rows of sprites on each sprite sheet is actually the **attack animation**, not the **idle animation**. Increase this Y offset to the 9th row (8, when 0-indexed) which begins after the word "iDLE" in the green separator, around approximately 1045px. The correct idle sprites are narrower than the attack sprites, so it will be necessary to decrease the width of the idle sprites. The entire idle sprite sheet is approximately 764 pixels wide and has 8 sprites/frames per animation.

Keep the old, incorrect idle animations (offset by 7 pixels) around as **attack animations**, and quickly cycle the attack animations when the 'X' key is pressed. The attack animations actually have 16 columns, not 8, and every attack animation should use all 16 frames.

The monk sprites are very different from teh other sprites and it's causing misalignment of the animations, so disable "monk" as an option for users to create accounts, for now.
