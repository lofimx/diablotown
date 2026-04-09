import { describe, it, expect } from "vitest";
import { VideoMesh } from "./VideoMesh";

describe("VideoMesh", () => {
  // ─── Construction ───

  describe("empty()", () => {
    it("creates a mesh with no members", () => {
      const mesh = VideoMesh.empty("alice");
      expect(mesh.size).toBe(0);
      expect(mesh.localUsername).toBe("alice");
      expect([...mesh.members]).toEqual([]);
    });
  });

  describe("fromMembers()", () => {
    it("creates a mesh with the given members", () => {
      const mesh = VideoMesh.fromMembers("alice", ["alice", "bob", "charlie"]);
      expect(mesh.size).toBe(3);
      expect(mesh.hasMember("alice")).toBe(true);
      expect(mesh.hasMember("bob")).toBe(true);
      expect(mesh.hasMember("charlie")).toBe(true);
    });

    it("deduplicates members", () => {
      const mesh = VideoMesh.fromMembers("alice", ["alice", "alice", "bob"]);
      expect(mesh.size).toBe(2);
    });
  });

  // ─── Hub election ───

  describe("hubNode()", () => {
    it("returns null for empty mesh", () => {
      expect(VideoMesh.empty("alice").hubNode()).toBeNull();
    });

    it("returns the only member as hub", () => {
      const mesh = VideoMesh.fromMembers("alice", ["alice"]);
      expect(mesh.hubNode()).toBe("alice");
    });

    it("returns alphabetically first member (case-insensitive)", () => {
      const mesh = VideoMesh.fromMembers("charlie", ["charlie", "Bob", "alice"]);
      expect(mesh.hubNode()).toBe("alice");
    });

    it("is case-insensitive", () => {
      const mesh = VideoMesh.fromMembers("alice", ["ZARA", "alice"]);
      expect(mesh.hubNode()).toBe("alice");
    });

    it("updates when an earlier member joins", () => {
      const mesh = VideoMesh.fromMembers("bob", ["bob", "charlie"]);
      expect(mesh.hubNode()).toBe("bob");
      const updated = mesh.addMember("alice");
      expect(updated.hubNode()).toBe("alice");
    });

    it("updates when current hub leaves", () => {
      const mesh = VideoMesh.fromMembers("alice", ["alice", "bob", "charlie"]);
      expect(mesh.hubNode()).toBe("alice");
      const updated = mesh.removeMember("alice");
      expect(updated.hubNode()).toBe("bob");
    });
  });

  // ─── Connection lines (star topology) ───

  describe("connectionLines()", () => {
    it("returns empty for 0 members", () => {
      expect(VideoMesh.empty("alice").connectionLines()).toEqual([]);
    });

    it("returns empty for 1 member", () => {
      const mesh = VideoMesh.fromMembers("alice", ["alice"]);
      expect(mesh.connectionLines()).toEqual([]);
    });

    it("returns one line for 2 members", () => {
      const mesh = VideoMesh.fromMembers("alice", ["alice", "bob"]);
      const lines = mesh.connectionLines();
      expect(lines).toHaveLength(1);
      expect(lines[0]).toEqual({ from: "alice", to: "bob" });
    });

    it("returns (N-1) lines for N members, all from hub", () => {
      const mesh = VideoMesh.fromMembers("alice", ["alice", "bob", "charlie", "dave"]);
      const lines = mesh.connectionLines();
      expect(lines).toHaveLength(3);
      for (const line of lines) {
        expect(line.from).toBe("alice"); // hub
      }
      const tos = lines.map(l => l.to).sort();
      expect(tos).toEqual(["bob", "charlie", "dave"]);
    });

    it("updates correctly after member add", () => {
      const mesh = VideoMesh.fromMembers("alice", ["alice", "bob"]);
      const updated = mesh.addMember("charlie");
      const lines = updated.connectionLines();
      expect(lines).toHaveLength(2);
      expect(lines.every(l => l.from === "alice")).toBe(true);
    });

    it("updates correctly after member remove", () => {
      const mesh = VideoMesh.fromMembers("alice", ["alice", "bob", "charlie"]);
      const updated = mesh.removeMember("charlie");
      expect(updated.connectionLines()).toEqual([{ from: "alice", to: "bob" }]);
    });

    it("updates when hub is removed", () => {
      const mesh = VideoMesh.fromMembers("alice", ["alice", "bob", "charlie"]);
      const updated = mesh.removeMember("alice");
      const lines = updated.connectionLines();
      expect(lines).toHaveLength(1);
      expect(lines[0]).toEqual({ from: "bob", to: "charlie" });
    });
  });

  // ─── isInCall ───

  describe("isInCall()", () => {
    it("returns false for 0 members", () => {
      expect(VideoMesh.empty("alice").isInCall()).toBe(false);
    });

    it("returns false for 1 member", () => {
      expect(VideoMesh.fromMembers("alice", ["alice"]).isInCall()).toBe(false);
    });

    it("returns true for 2+ members", () => {
      expect(VideoMesh.fromMembers("alice", ["alice", "bob"]).isInCall()).toBe(true);
    });
  });

  // ─── Transitions (immutability) ───

  describe("addMember()", () => {
    it("returns a new instance with the member added", () => {
      const mesh = VideoMesh.fromMembers("alice", ["alice"]);
      const updated = mesh.addMember("bob");
      expect(updated).not.toBe(mesh);
      expect(updated.hasMember("bob")).toBe(true);
      expect(mesh.hasMember("bob")).toBe(false); // original unchanged
    });

    it("returns same instance if member already exists", () => {
      const mesh = VideoMesh.fromMembers("alice", ["alice", "bob"]);
      const same = mesh.addMember("bob");
      expect(same).toBe(mesh);
    });
  });

  describe("addMembers()", () => {
    it("adds multiple members at once", () => {
      const mesh = VideoMesh.fromMembers("alice", ["alice"]);
      const updated = mesh.addMembers(["bob", "charlie"]);
      expect(updated.size).toBe(3);
      expect(updated.hasMember("bob")).toBe(true);
      expect(updated.hasMember("charlie")).toBe(true);
    });

    it("returns same instance if all already exist", () => {
      const mesh = VideoMesh.fromMembers("alice", ["alice", "bob"]);
      const same = mesh.addMembers(["alice", "bob"]);
      expect(same).toBe(mesh);
    });

    it("does not mutate the original", () => {
      const mesh = VideoMesh.fromMembers("alice", ["alice"]);
      mesh.addMembers(["bob", "charlie"]);
      expect(mesh.size).toBe(1);
    });
  });

  describe("removeMember()", () => {
    it("returns a new instance without the member", () => {
      const mesh = VideoMesh.fromMembers("alice", ["alice", "bob"]);
      const updated = mesh.removeMember("bob");
      expect(updated).not.toBe(mesh);
      expect(updated.hasMember("bob")).toBe(false);
      expect(mesh.hasMember("bob")).toBe(true); // original unchanged
    });

    it("returns same instance if member not present", () => {
      const mesh = VideoMesh.fromMembers("alice", ["alice"]);
      const same = mesh.removeMember("bob");
      expect(same).toBe(mesh);
    });
  });

  describe("clear()", () => {
    it("returns an empty mesh", () => {
      const mesh = VideoMesh.fromMembers("alice", ["alice", "bob"]);
      const cleared = mesh.clear();
      expect(cleared.size).toBe(0);
      expect(cleared.localUsername).toBe("alice");
    });

    it("returns same instance if already empty", () => {
      const mesh = VideoMesh.empty("alice");
      expect(mesh.clear()).toBe(mesh);
    });

    it("does not mutate the original", () => {
      const mesh = VideoMesh.fromMembers("alice", ["alice", "bob"]);
      mesh.clear();
      expect(mesh.size).toBe(2);
    });
  });

  // ─── Equality ───

  describe("equals()", () => {
    it("equal when same members", () => {
      const a = VideoMesh.fromMembers("alice", ["alice", "bob"]);
      const b = VideoMesh.fromMembers("alice", ["bob", "alice"]);
      expect(a.equals(b)).toBe(true);
    });

    it("not equal when different members", () => {
      const a = VideoMesh.fromMembers("alice", ["alice", "bob"]);
      const b = VideoMesh.fromMembers("alice", ["alice", "charlie"]);
      expect(a.equals(b)).toBe(false);
    });

    it("not equal when different sizes", () => {
      const a = VideoMesh.fromMembers("alice", ["alice"]);
      const b = VideoMesh.fromMembers("alice", ["alice", "bob"]);
      expect(a.equals(b)).toBe(false);
    });

    it("not equal when different localUsername", () => {
      const a = VideoMesh.fromMembers("alice", ["alice", "bob"]);
      const b = VideoMesh.fromMembers("bob", ["alice", "bob"]);
      expect(a.equals(b)).toBe(false);
    });

    it("two empty meshes with same localUsername are equal", () => {
      const a = VideoMesh.empty("alice");
      const b = VideoMesh.empty("alice");
      expect(a.equals(b)).toBe(true);
    });
  });

  // ─── Member cap (max 5) ───

  describe("member cap", () => {
    it("allows up to 5 members", () => {
      const mesh = VideoMesh.fromMembers("a", ["a", "b", "c", "d", "e"]);
      expect(mesh.size).toBe(5);
    });

    it("addMember rejects the 6th member", () => {
      const mesh = VideoMesh.fromMembers("a", ["a", "b", "c", "d", "e"]);
      const same = mesh.addMember("f");
      expect(same).toBe(mesh);
      expect(same.size).toBe(5);
    });

    it("addMembers stops at 5", () => {
      const mesh = VideoMesh.fromMembers("a", ["a", "b"]);
      const updated = mesh.addMembers(["c", "d", "e", "f", "g"]);
      expect(updated.size).toBe(5);
      expect(updated.hasMember("f")).toBe(false);
      expect(updated.hasMember("g")).toBe(false);
    });

    it("fromMembers caps at 5 (takes first 5 from input order)", () => {
      const mesh = VideoMesh.fromMembers("a", ["a", "b", "c", "d", "e", "f"]);
      expect(mesh.size).toBe(5);
    });

    it("isFull returns true at 5 members", () => {
      const mesh = VideoMesh.fromMembers("a", ["a", "b", "c", "d", "e"]);
      expect(mesh.isFull()).toBe(true);
    });

    it("isFull returns false below 5", () => {
      const mesh = VideoMesh.fromMembers("a", ["a", "b", "c"]);
      expect(mesh.isFull()).toBe(false);
    });
  });

  // ─── Connection lines: pentagram topology at 5 ───

  describe("pentagram topology (5 members)", () => {
    it("returns 5 pentagram lines when mesh has exactly 5 members", () => {
      const mesh = VideoMesh.fromMembers("alice", ["alice", "bob", "charlie", "dave", "eve"]);
      const lines = mesh.connectionLines();
      expect(lines).toHaveLength(5);
    });

    it("connects each member to the one 2 positions ahead (skip-one)", () => {
      // Sorted: alice, bob, charlie, dave, eve
      const mesh = VideoMesh.fromMembers("alice", ["eve", "alice", "dave", "bob", "charlie"]);
      const lines = mesh.connectionLines();
      expect(lines).toContainEqual({ from: "alice", to: "charlie" });
      expect(lines).toContainEqual({ from: "bob", to: "dave" });
      expect(lines).toContainEqual({ from: "charlie", to: "eve" });
      expect(lines).toContainEqual({ from: "dave", to: "alice" });
      expect(lines).toContainEqual({ from: "eve", to: "bob" });
    });

    it("reverts to star topology when a member leaves", () => {
      const mesh = VideoMesh.fromMembers("alice", ["alice", "bob", "charlie", "dave", "eve"]);
      expect(mesh.connectionLines()).toHaveLength(5); // pentagram

      const updated = mesh.removeMember("eve");
      const lines = updated.connectionLines();
      expect(lines).toHaveLength(3); // star: hub to 3 others
      for (const line of lines) {
        expect(line.from).toBe("alice"); // hub
      }
    });

    it("switches from star to pentagram when 5th member joins", () => {
      let mesh = VideoMesh.fromMembers("alice", ["alice", "bob", "charlie", "dave"]);
      expect(mesh.connectionLines()).toHaveLength(3); // star

      mesh = mesh.addMember("eve");
      const lines = mesh.connectionLines();
      expect(lines).toHaveLength(5); // pentagram
      // No line should be a simple hub-spoke anymore
      const hubs = new Set(lines.map(l => l.from));
      expect(hubs.size).toBeGreaterThan(1); // multiple "from" nodes
    });
  });

  // ─── canCallPlayer ───

  describe("canCallPlayer()", () => {
    it("returns true when player is not disabled", () => {
      const mesh = VideoMesh.empty("alice");
      expect(mesh.canCallPlayer("bob", new Set())).toBe(true);
    });

    it("returns false when player is disabled", () => {
      const mesh = VideoMesh.empty("alice");
      expect(mesh.canCallPlayer("bob", new Set(["bob"]))).toBe(false);
    });
  });

  // ─── hasMember ───

  describe("hasMember()", () => {
    it("returns true for existing member", () => {
      const mesh = VideoMesh.fromMembers("alice", ["alice", "bob"]);
      expect(mesh.hasMember("alice")).toBe(true);
    });

    it("returns false for non-member", () => {
      const mesh = VideoMesh.fromMembers("alice", ["alice"]);
      expect(mesh.hasMember("bob")).toBe(false);
    });
  });
});
