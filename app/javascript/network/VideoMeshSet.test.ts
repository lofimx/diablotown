import { describe, it, expect } from "vitest";
import { VideoMeshSet } from "./VideoMeshSet";

describe("VideoMeshSet", () => {
  // ─── Local mesh management ───

  describe("addMembers()", () => {
    it("adds members to the local mesh", () => {
      const set = new VideoMeshSet("alice");
      set.addMembers(["alice", "bob"]);
      expect(set.local.hasMember("alice")).toBe(true);
      expect(set.local.hasMember("bob")).toBe(true);
    });

    it("accumulates members across multiple calls", () => {
      const set = new VideoMeshSet("alice");
      set.addMembers(["alice", "bob"]);
      set.addMembers(["alice", "charlie"]);
      expect(set.local.size).toBe(3);
    });

    it("prunes external lines that now involve local members", () => {
      const set = new VideoMeshSet("alice");
      set.receiveExternalLines("zara", [{ from: "bob", to: "charlie" }]);
      expect(set.allConnectionLines()).toHaveLength(1);

      set.addMembers(["alice", "bob"]);
      expect(set.allConnectionLines()).toEqual(set.local.connectionLines());
    });
  });

  describe("removeMember()", () => {
    it("removes a member from the local mesh", () => {
      const set = new VideoMeshSet("alice");
      set.addMembers(["alice", "bob", "charlie"]);
      set.removeMember("charlie");
      expect(set.local.hasMember("charlie")).toBe(false);
      expect(set.local.size).toBe(2);
    });
  });

  describe("clearLocal()", () => {
    it("resets the local mesh to empty", () => {
      const set = new VideoMeshSet("alice");
      set.addMembers(["alice", "bob"]);
      set.clearLocal();
      expect(set.local.size).toBe(0);
      expect(set.local.hubNode()).toBeNull();
    });
  });

  // ─── External lines ───

  describe("receiveExternalLines()", () => {
    it("stores external lines from a broadcaster", () => {
      const set = new VideoMeshSet("alice");
      set.receiveExternalLines("zara", [{ from: "bob", to: "charlie" }]);
      expect(set.allConnectionLines()).toEqual([{ from: "bob", to: "charlie" }]);
    });

    it("rejects external lines involving local members", () => {
      const set = new VideoMeshSet("alice");
      set.addMembers(["alice", "bob"]);
      set.receiveExternalLines("zara", [{ from: "bob", to: "charlie" }]);
      // bob is in our mesh, so these lines are rejected
      expect(set.allConnectionLines()).toEqual(set.local.connectionLines());
    });

    it("tracks multiple external broadcasters", () => {
      const set = new VideoMeshSet("alice");
      set.receiveExternalLines("zara", [{ from: "zara", to: "yuki" }]);
      set.receiveExternalLines("mike", [{ from: "mike", to: "nina" }]);
      const lines = set.allConnectionLines();
      expect(lines).toHaveLength(2);
      expect(lines).toContainEqual({ from: "zara", to: "yuki" });
      expect(lines).toContainEqual({ from: "mike", to: "nina" });
    });

    it("replaces lines from the same broadcaster", () => {
      const set = new VideoMeshSet("alice");
      set.receiveExternalLines("zara", [{ from: "zara", to: "yuki" }]);
      set.receiveExternalLines("zara", [{ from: "zara", to: "xander" }]);
      const lines = set.allConnectionLines();
      expect(lines).toHaveLength(1);
      expect(lines[0]).toEqual({ from: "zara", to: "xander" });
    });

    it("clears a broadcaster's lines when they send empty", () => {
      const set = new VideoMeshSet("alice");
      set.receiveExternalLines("zara", [{ from: "zara", to: "yuki" }]);
      set.receiveExternalLines("zara", []);
      expect(set.allConnectionLines()).toEqual([]);
    });
  });

  // ─── allConnectionLines ───

  describe("allConnectionLines()", () => {
    it("returns empty when no meshes have members", () => {
      const set = new VideoMeshSet("alice");
      expect(set.allConnectionLines()).toEqual([]);
    });

    it("returns only local lines when no external", () => {
      const set = new VideoMeshSet("alice");
      set.addMembers(["alice", "bob"]);
      expect(set.allConnectionLines()).toEqual([{ from: "alice", to: "bob" }]);
    });

    it("combines local and external lines", () => {
      const set = new VideoMeshSet("alice");
      set.addMembers(["alice", "bob"]);
      set.receiveExternalLines("zara", [{ from: "zara", to: "yuki" }]);
      const lines = set.allConnectionLines();
      expect(lines).toHaveLength(2);
      expect(lines).toContainEqual({ from: "alice", to: "bob" });
      expect(lines).toContainEqual({ from: "zara", to: "yuki" });
    });

    it("excludes pruned external lines after local mesh grows", () => {
      const set = new VideoMeshSet("alice");
      set.receiveExternalLines("zara", [{ from: "zara", to: "bob" }]);
      set.receiveExternalLines("mike", [{ from: "mike", to: "nina" }]);
      // Now bob joins our mesh — zara's lines get pruned, mike's stay
      set.addMembers(["alice", "bob"]);
      const lines = set.allConnectionLines();
      expect(lines).toContainEqual({ from: "alice", to: "bob" });
      expect(lines).toContainEqual({ from: "mike", to: "nina" });
      expect(lines).not.toContainEqual({ from: "zara", to: "bob" });
    });
  });

  // ─── Delegation to local mesh ───

  describe("hubNode()", () => {
    it("returns null when local mesh is empty", () => {
      expect(new VideoMeshSet("alice").hubNode()).toBeNull();
    });

    it("delegates to local mesh", () => {
      const set = new VideoMeshSet("alice");
      set.addMembers(["alice", "bob"]);
      expect(set.hubNode()).toBe("alice");
    });
  });

  describe("isInCall()", () => {
    it("returns false when local mesh has < 2 members", () => {
      expect(new VideoMeshSet("alice").isInCall()).toBe(false);
    });

    it("returns true when local mesh has 2+ members", () => {
      const set = new VideoMeshSet("alice");
      set.addMembers(["alice", "bob"]);
      expect(set.isInCall()).toBe(true);
    });
  });

  describe("hasMember()", () => {
    it("checks local mesh membership", () => {
      const set = new VideoMeshSet("alice");
      set.addMembers(["alice", "bob"]);
      expect(set.hasMember("bob")).toBe(true);
      expect(set.hasMember("charlie")).toBe(false);
    });
  });

  describe("canCallPlayer()", () => {
    it("returns true when player is not disabled", () => {
      const set = new VideoMeshSet("alice");
      expect(set.canCallPlayer("bob")).toBe(true);
    });

    it("returns false when player is disabled", () => {
      const set = new VideoMeshSet("alice");
      set.setDisabledPlayers(new Set(["bob"]));
      expect(set.canCallPlayer("bob")).toBe(false);
    });
  });

  // ─── Pentagram topology passthrough ───

  describe("pentagram topology at 5 members", () => {
    it("connectionLines returns pentagram lines when local mesh has 5 members", () => {
      const set = new VideoMeshSet("alice");
      set.addMembers(["alice", "bob", "charlie", "dave", "eve"]);
      const lines = set.connectionLines();
      expect(lines).toHaveLength(5);
      expect(lines).toContainEqual({ from: "alice", to: "charlie" });
      expect(lines).toContainEqual({ from: "bob", to: "dave" });
    });

    it("allConnectionLines includes pentagram local lines plus external", () => {
      const set = new VideoMeshSet("alice");
      set.addMembers(["alice", "bob", "charlie", "dave", "eve"]);
      set.receiveExternalLines("zara", [{ from: "zara", to: "yuki" }]);
      const all = set.allConnectionLines();
      expect(all).toHaveLength(6); // 5 pentagram + 1 external
    });

    it("reverts to star topology in connectionLines when member leaves", () => {
      const set = new VideoMeshSet("alice");
      set.addMembers(["alice", "bob", "charlie", "dave", "eve"]);
      expect(set.connectionLines()).toHaveLength(5);

      set.removeMember("eve");
      const lines = set.connectionLines();
      expect(lines).toHaveLength(3);
      for (const line of lines) {
        expect(line.from).toBe("alice");
      }
    });
  });

  // ─── Member cap passthrough ───

  describe("member cap", () => {
    it("addMembers respects 5-member cap", () => {
      const set = new VideoMeshSet("alice");
      set.addMembers(["alice", "bob", "charlie", "dave", "eve", "frank"]);
      expect(set.local.size).toBe(5);
      expect(set.hasMember("frank")).toBe(false);
    });
  });

  describe("connectionLines()", () => {
    it("returns only the local mesh lines (not external)", () => {
      const set = new VideoMeshSet("alice");
      set.addMembers(["alice", "bob"]);
      set.receiveExternalLines("zara", [{ from: "zara", to: "yuki" }]);
      expect(set.connectionLines()).toEqual([{ from: "alice", to: "bob" }]);
    });
  });

  describe("members", () => {
    it("returns local mesh members", () => {
      const set = new VideoMeshSet("alice");
      set.addMembers(["alice", "bob"]);
      expect([...set.members].sort()).toEqual(["alice", "bob"]);
    });
  });
});
