const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");

// Execute the real hook with controlled responses and UUIDs. No network or clock.
function guestHarness({
  loseFirstWriteResponse = false,
  failOpen = false,
  rejectFirstWrite = false,
  holdWrite = null,
  allowPhotos = false,
} = {}) {
  const states = [];
  const effects = [];
  const storage = new Map();
  const writes = new Map();
  let cursor = 0;
  let rejectWrite = rejectFirstWrite;
  let uploads = 0;
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
      useRef(initial) {
        const index = cursor++;
        if (!(index in states)) states[index] = { current: initial };
        return states[index];
      },
      useEffect(effect, deps) {
        const index = cursor++;
        const previous = states[index];
        if (!previous || deps.some((dep, i) => dep !== previous.deps[i])) {
          effects.push(() => {
            previous?.cleanup?.();
            states[index] = { deps, cleanup: effect() };
          });
        }
      },
      useCallback: (callback) => callback,
    },
    "./guestStorage": {
      uploadGuestPhoto: async () => {
        assert.ok(allowPhotos, "Unexpected photo upload");
        return `https://storage.test/photo-${++uploads}.jpg`;
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
          if (holdWrite) await holdWrite;
          if (rejectWrite) {
            rejectWrite = false;
            throw new Error("Server rejected before commit");
          }
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
  let guestCode = "AB12";
  const render = (nextCode = guestCode) => {
    guestCode = nextCode;
    cursor = 0;
    const result = context.exports.useGuestData(guestCode);
    effects.splice(0).forEach((effect) => effect());
    return result;
  };
  return {
    render,
    requests,
    writes,
    get uploads() { return uploads; },
    remount() {
      states.forEach((state) => state?.cleanup?.());
      states.length = 0;
    },
    async open() {
      render();
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
  assert.equal(world.writes.size, 1, "First request committed before its response was lost");
  await world.render().addMoment(moment);
  console.log("QA lost-response evidence=" + JSON.stringify({
    requestKeys: world.requests.filter(({ body }) => body.action === "guest_add")
      .map(({ body }) => body.requestKey),
    serverRows: world.writes.size,
    visibleRows: world.render().moments.length,
  }));
  assert.equal(
    world.writes.size,
    1,
    "The same user submission must reuse its request key after a lost response",
  );
});


test("definite rejection retains the operation key for retry without a committed row", async () => {
  const world = guestHarness({ rejectFirstWrite: true });
  const guest = await world.open();
  await assert.rejects(guest.addMoment(moment), /rejected before commit/);
  assert.equal(world.writes.size, 0);
  await world.render().addMoment({ ...moment });
  const keys = world.requests.filter(({ body }) => body.action === "guest_add").map(({ body }) => body.requestKey);
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
  assert.equal(world.writes.size, 1);
  assert.equal(world.render().moments.length, 1);
});

test("concurrent retries join one operation, then reuse its key after a lost response", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const world = guestHarness({ holdWrite: gate, loseFirstWriteResponse: true });
  const guest = await world.open();
  const attempts = [guest.addMoment(moment), guest.addMoment({ ...moment }), world.render().addMoment(moment)];
  const outcomes = Promise.allSettled(attempts);
  assert.equal(world.requests.filter(({ body }) => body.action === "guest_add").length, 1);
  release();
  assert.ok((await outcomes).every((result) => result.status === "rejected"));
  assert.equal(world.writes.size, 1);
  await Promise.all([world.render().addMoment(moment), world.render().addMoment(moment)]);
  const keys = world.requests.filter(({ body }) => body.action === "guest_add").map(({ body }) => body.requestKey);
  assert.equal(keys.length, 2);
  assert.equal(new Set(keys).size, 1);
  assert.equal(world.writes.size, 1);
  assert.equal(world.render().moments.length, 1);
});

test("success retires an implicit key; another identical submission is a new operation", async () => {
  const world = guestHarness();
  await (await world.open()).addMoment(moment);
  await world.render().addMoment(moment);
  assert.equal(world.writes.size, 2);
  assert.equal(world.render().moments.length, 2);
});

test("different input and explicitly new identical operations cannot reuse an unknown operation key", async () => {
  const world = guestHarness({ loseFirstWriteResponse: true });
  await assert.rejects((await world.open()).addMoment(moment), /Response lost/);
  await world.render().addMoment({ ...moment, day: 2 });
  await world.render().addMoment(moment, "new-operation");
  assert.equal(world.writes.size, 3);
  await world.render().addMoment(moment);
  assert.equal(world.writes.size, 3);
  assert.equal(world.render().moments.length, 3);
});

test("explicit key cannot be used with changed content", async () => {
  const world = guestHarness({ loseFirstWriteResponse: true });
  await assert.rejects((await world.open()).addMoment(moment, "operation"), /Response lost/);
  await assert.rejects(world.render().addMoment({ ...moment, caption: "new" }, "operation"), /新内容/);
  assert.equal(world.writes.size, 1);
  await world.render().addMoment(moment, "operation");
  assert.equal(world.render().moments.length, 1);
});

test("remount reads the committed snapshot and creates a new key for a new submission", async () => {
  const world = guestHarness({ loseFirstWriteResponse: true });
  await assert.rejects((await world.open()).addMoment(moment), /Response lost/);
  world.remount();
  const reopened = await world.open();
  assert.equal(reopened.moments.length, 1);
  await reopened.addMoment(moment);
  assert.equal(world.writes.size, 2);
});

test("changing share clears pending operations and stale completions cannot update its snapshot", async () => {
  let release;
  const world = guestHarness({ holdWrite: new Promise((resolve) => { release = resolve; }) });
  const guest = await world.open();
  const writing = guest.addMoment(moment);
  world.render("CD34");
  await new Promise((resolve) => setImmediate(resolve));
  release();
  await writing;
  assert.equal(world.render().moments.length, 0);
  await world.render().addMoment(moment);
  assert.equal(world.writes.size, 2);
});

test("lost add response reuses the completed upload; completed batch items replay without reupload", async () => {
  const world = guestHarness({ allowPhotos: true, loseFirstWriteResponse: true });
  const photo = { ...moment, uri: "blob:photo", is_text: false };
  await assert.rejects((await world.open()).addMoment(photo, "batch:0"), /Response lost/);
  assert.equal(world.uploads, 1);
  await world.render().addMoment(photo, "batch:0");
  await world.render().addMoment(photo, "batch:0");
  await world.render().addMoment(photo, "batch:1");
  assert.equal(world.uploads, 2);
  assert.equal(world.writes.size, 2);
  assert.equal(world.render().moments.length, 2);
  assert.equal(world.writes.get("batch:0").uri, "https://storage.test/photo-1.jpg");
});
