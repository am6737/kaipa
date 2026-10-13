const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");

// Execute the real hook with controlled responses and UUIDs. No network or clock.
function guestHarness({
  loseFirstWriteResponse = false,
  failOpen = false,
} = {}) {
  const states = [];
  const effects = [];
  const storage = new Map();
  const writes = new Map();
  let cursor = 0;
  let mounted = false;
  let sequence = 0;
  let loseResponse = loseFirstWriteResponse;
  const snapshot = {
    sessionId: "session-1",
    share: { id: "share-1" },
    journey: { name: "QA" },
    host: {},
    companions: [],
    moments: [],
    media: [],
  };
  const requests = [];
  const mocks = {
    react: {
      useState(initial) {
        const index = cursor++;
        if (!(index in states))
          states[index] = typeof initial === "function" ? initial() : initial;
        return [
          states[index],
          (next) => {
            states[index] =
              typeof next === "function" ? next(states[index]) : next;
          },
        ];
      },
      useEffect(effect) {
        if (!mounted) effects.push(effect);
      },
      useCallback: (callback) => callback,
    },
    "./guestStorage": {
      uploadGuestPhoto: async () => {
        throw new Error("Unexpected photo upload");
      },
    },
    "./guestResources": {
      async guestRequest(body, token) {
        requests.push({ body, token });
        if (body.action === "guest_open") {
          if (failOpen) throw new Error("Controlled offline");
          return { sessionId: snapshot.sessionId, token: token || "token-1" };
        }
        if (body.action === "guest_snapshot")
          return { ...snapshot, moments: [...writes.values()] };
        if (body.action === "guest_add") {
          // Model the server's existing unique (session_id, request_key) constraint.
          if (!writes.has(body.requestKey))
            writes.set(body.requestKey, {
              ...body.moment,
              id: body.requestKey,
            });
          if (loseResponse) {
            loseResponse = false;
            throw new Error("Response lost after server commit");
          }
          return writes.get(body.requestKey);
        }
        throw new Error(`Unexpected action: ${body.action}`);
      },
    },
  };
  const code = ts.transpileModule(
    fs.readFileSync("src/web/useGuestData.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const context = vm.createContext({
    exports: {},
    crypto: { randomUUID: () => `request-${++sequence}` },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    },
    require: (name) => {
      assert.ok(name in mocks, `Unexpected dependency: ${name}`);
      return mocks[name];
    },
  });
  vm.runInContext(code, context);
  const render = () => {
    cursor = 0;
    return context.exports.useGuestData("AB12");
  };
  return {
    render,
    requests,
    writes,
    async open() {
      render();
      mounted = true;
      effects.splice(0).forEach((effect) => effect());
      await new Promise((resolve) => setImmediate(resolve));
      return render();
    },
  };
}

const moment = {
  guest_name: "QA",
  guest_ini: "Q",
  guest_tone: "river",
  uri: "",
  caption: "同一条测试文字",
  day: 1,
  is_text: true,
};

test("QA guest text happy path updates the snapshot after a successful write", async () => {
  const world = guestHarness();
  const guest = await world.open();
  assert.equal(guest.loading, false);
  assert.equal(guest.error, null);
  await guest.addMoment(moment);
  assert.equal(world.writes.size, 1);
  assert.equal(world.render().moments.length, 1);
  assert.equal(world.render().moments[0].caption, moment.caption);
});

test("QA guest opening offline completes loading and exposes an error without writing", async () => {
  const world = guestHarness({ failOpen: true });
  const guest = await world.open();
  assert.equal(guest.loading, false);
  assert.equal(guest.error, "busy");
  await assert.rejects(guest.addMoment(moment), /访客会话不可用/);
  assert.equal(world.writes.size, 0);
});

test("QA retrying a guest text after a lost response must leave only one server row", async () => {
  const world = guestHarness({ loseFirstWriteResponse: true });
  const guest = await world.open();
  await assert.rejects(
    guest.addMoment(moment),
    /Response lost after server commit/,
  );
  await world.render().addMoment(moment);
  assert.equal(
    world.writes.size,
    1,
    "The same user submission must reuse its request key after a lost response",
  );
});
