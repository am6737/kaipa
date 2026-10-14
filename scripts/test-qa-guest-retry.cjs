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
  holdUpload = null,
  writeLimit = Infinity,
  loseWriteResponseKey = null,
} = {}) {
  const timers = new Map();
  let timerId = 0;
  const states = [];
  const effects = [];
  const storage = new Map();
  const writes = new Map();
  let cursor = 0;
  let rejectWrite = rejectFirstWrite;
  let uploads = 0;
  let sequence = 0;
  let loseResponse = loseFirstWriteResponse;
  let responseKeyToLose = loseWriteResponseKey;
  let window = 0;
  let windowAttempts = 0;
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
        uploads++;
        if (holdUpload) await holdUpload;
        return `https://storage.test/photo-${uploads}.jpg`;
      },
    },
    "./guestResources": {
      async guestRequest(body, token) {
        requests.push({ body, token, window });
        if (body.action === "guest_open") {
          if (failOpen) throw new Error("Controlled offline");
          return { sessionId: snapshot.sessionId, token: token || "token-1" };
        }
        if (body.action === "guest_snapshot")
          return { ...snapshot, moments: [...writes.values()] };
        if (body.action === "guest_add") {
          if (holdWrite) await holdWrite;
          // Admission precedes SQL key deduplication, as in the real service.
          if (++windowAttempts > writeLimit) throw new Error("Write rate limit exceeded");
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
          if (loseResponse || body.requestKey === responseKeyToLose) {
            loseResponse = false;
            responseKeyToLose = null;
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
    setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; },
    clearTimeout: (id) => timers.delete(id),
    TextEncoder,
    crypto: { subtle: require('node:crypto').webcrypto.subtle, randomUUID: () => `request-${++sequence}` },
    localStorage: {
      get length() { return storage.size; },
      key: (i) => [...storage.keys()][i] || null,
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    require: (name) => {
      assert.ok(name in mocks, `Unexpected dependency: ${name}`);
      return mocks[name];
    },
  });
  for (const module of ["guestDeadline", "guestRetryState"]) {
    const output = ts.transpileModule(fs.readFileSync(`src/web/${module}.ts`, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    vm.runInContext(`(function(exports, require) {${output}\n})`, context)(exports, (name) => mocks[name]);
    mocks[`./${module}`] = exports;
  }
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
    async expire() {
      for (const [id, timer] of [...timers]) { assert.ok(timer.ms <= 30000); timers.delete(id); timer.fn(); }
      await new Promise((resolve) => setImmediate(resolve));
    },
    get uploads() { return uploads; },
    savedOperations() { return [...storage].filter(([key]) => key.startsWith("kaipa_guest_operations_v1:")); },
    advanceWindow() { window++; windowAttempts = 0; },
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

for (const explicit of [false, true]) {
test(`concurrent ${explicit ? "explicit" : "implicit"} retries join one operation and reuse its key after a lost response`, async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const world = guestHarness({ holdWrite: gate, loseFirstWriteResponse: true });
  const guest = await world.open();
  const key = explicit ? "ui-operation" : undefined;
  const attempts = [guest.addMoment(moment, key), guest.addMoment({ ...moment }, key), world.render().addMoment(moment, key)];
  const outcomes = Promise.allSettled(attempts);
  assert.equal(world.requests.filter(({ body }) => body.action === "guest_add").length, 1);
  release();
  assert.ok((await outcomes).every((result) => result.status === "rejected"));
  assert.equal(world.writes.size, 1);
  await Promise.all([world.render().addMoment(moment, key), world.render().addMoment(moment, key)]);
  const keys = world.requests.filter(({ body }) => body.action === "guest_add").map(({ body }) => body.requestKey);
  assert.equal(keys.length, 2);
  assert.equal(new Set(keys).size, 1);
  assert.equal(world.writes.size, 1);
  assert.equal(world.render().moments.length, 1);
});
}

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
  await assert.rejects(writing, /发布页面已离开/);
  assert.equal(world.render().moments.length, 0);
  await world.render().addMoment(moment);
  assert.equal(world.writes.size, 2);
});

test("lost add response reuses the upload; confirmed batch items issue no request or reupload", async () => {
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
  assert.deepEqual(world.requests.filter(({ body }) => body.action === "guest_add").map(({ body }) => body.requestKey),
    ["batch:0", "batch:0", "batch:1"]);
});


function batchPhotos(count) {
  return Array.from({ length: count }, (_, i) => ({ ...moment, uri: `blob:photo-${i}`, is_text: false }));
}
async function submitBatch(world, photos, key) {
  // Same sequential per-item calls/keys as GuestWall; executes the real hook.
  for (let i = 0; i < photos.length; i++) await world.render().addMoment(photos[i], `${key}:${i}`);
}

test("61-item batch skips 60 confirmed writes in a new quota window and completes with one request", async () => {
  const world = guestHarness({ allowPhotos: true, writeLimit: 60 });
  await world.open();
  const photos = batchPhotos(61);
  await assert.rejects(submitBatch(world, photos, "batch"), /Write rate limit/);
  assert.equal(world.writes.size, 60);
  assert.equal(world.render().moments.length, 60);
  const firstWindow = world.requests.filter(({ body, window }) => body.action === "guest_add" && window === 0);
  assert.equal(firstWindow.length, 61);
  assert.equal(firstWindow.at(-1).body.requestKey, "batch:60");
  world.advanceWindow();
  await submitBatch(world, photos, "batch");
  const nextWindow = world.requests.filter(({ body, window }) => body.action === "guest_add" && window === 1);
  assert.deepEqual(nextWindow.map(({ body }) => body.requestKey), ["batch:60"]);
  assert.equal(world.writes.size, 61);
  assert.equal(world.render().moments.length, 61);
  assert.equal(world.uploads, 61);
  await submitBatch(world, photos, "batch");
  assert.equal(world.requests.filter(({ body, window }) => body.action === "guest_add" && window === 1).length, 1,
    "Completed items must consume no further guest_add requests or quota");
  console.log("QA 61-item recovery=" + JSON.stringify({ firstWindowRequests: firstWindow.length, firstWindowRows: 60,
    nextWindowKeys: nextWindow.map(({ body }) => body.requestKey), finalRows: world.writes.size, visibleRows: world.render().moments.length }));
});

test("batch retries unknown committed item with its original key while skipping confirmed items", async () => {
  const world = guestHarness({ allowPhotos: true, writeLimit: 60, loseWriteResponseKey: "batch:1" });
  await world.open();
  const photos = batchPhotos(61);
  await assert.rejects(submitBatch(world, photos, "batch"), /Response lost after server commit/);
  assert.equal(world.writes.size, 2);
  assert.equal(world.render().moments.length, 1);
  const unknownId = world.writes.get("batch:1").id;
  world.advanceWindow();
  await submitBatch(world, photos, "batch");
  const nextKeys = world.requests.filter(({ body, window }) => body.action === "guest_add" && window === 1)
    .map(({ body }) => body.requestKey);
  assert.equal(nextKeys.length, 60);
  assert.deepEqual(nextKeys, Array.from({ length: 60 }, (_, i) => `batch:${i + 1}`));
  assert.equal(world.requests.filter(({ body }) => body.action === "guest_add" && body.requestKey === "batch:1").length, 2);
  assert.equal(world.writes.get("batch:1").id, unknownId);
  assert.equal(world.writes.size, 61);
  assert.equal(world.render().moments.length, 61);
  assert.equal(world.uploads, 61);
  // Identical content in an explicitly new operation must still issue a write.
  world.advanceWindow();
  await world.render().addMoment(photos[0], "new-operation:0");
  assert.equal(world.writes.size, 62);
  assert.equal(world.render().moments.length, 62);
});


test("hung guest_add releases pending within 30s, retries original key and ignores late completion", async () => {
  let release;
  const world = guestHarness({ holdWrite: new Promise((resolve) => { release = resolve; }) });
  const guest = await world.open();
  let outcome;
  guest.addMoment(moment, "hung").then(() => { outcome = "resolved"; }, () => { outcome = "rejected"; });
  await new Promise((resolve) => setImmediate(resolve));
  await world.expire();
  assert.equal(outcome, "rejected", "A request that never settles must end the UI wait");
  let retryOutcome;
  world.render().addMoment(moment, "hung").then(() => { retryOutcome = "resolved"; }, () => { retryOutcome = "rejected"; });
  await new Promise((resolve) => setImmediate(resolve));
  const keys = world.requests.filter(({ body }) => body.action === "guest_add").map(({ body }) => body.requestKey);
  assert.deepEqual(keys, ["hung", "hung"], "Expired inFlight must not prevent a same-key retry");
  world.render("CD34");
  await new Promise((resolve) => setImmediate(resolve));
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(world.writes.size, 1);
  assert.equal(world.render().moments.length, 0, "Late completions cannot modify the new page");
});

test("confirmed explicit results survive remount, while unknown operations retry the saved key", async () => {
  const world = guestHarness({ loseWriteResponseKey: "unknown" });
  const guest = await world.open();
  await guest.addMoment(moment, "confirmed");
  await assert.rejects(guest.addMoment(moment, "unknown"), /Response lost/);
  world.remount();
  const restored = await world.open();
  const before = world.requests.filter(({ body }) => body.action === "guest_add").length;
  await restored.addMoment(moment, "confirmed");
  assert.equal(world.requests.filter(({ body }) => body.action === "guest_add").length, before);
  await world.render().addMoment(moment, "unknown");
  assert.equal(world.writes.size, 2);
  assert.equal(world.render().moments.length, 2);
});


test("hung upload releases pending and its late result cannot trigger guest_add", async () => {
  let release;
  const world = guestHarness({ allowPhotos: true, holdUpload: new Promise((resolve) => { release = resolve; }) });
  await world.open();
  const photo = { ...moment, uri: "blob:photo", is_text: false };
  let outcome;
  world.render().addMoment(photo, "photo").then(() => { outcome = "resolved"; }, () => { outcome = "rejected"; });
  await world.expire();
  assert.equal(outcome, "rejected");
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(world.requests.filter(({ body }) => body.action === "guest_add").length, 0);
  assert.equal(world.writes.size, 0);
  await world.render().addMoment(photo, "photo");
  assert.equal(world.writes.size, 1);
  assert.equal(world.render().moments.length, 1);
  assert.equal(world.requests.filter(({ body }) => body.action === "guest_add")[0].body.requestKey, "photo");
});


test("durable photo progress stores a bounded digest and confirmed replay survives reload without HTTP", async () => {
  const world = guestHarness({ allowPhotos: true });
  const photo = { ...moment, uri: "data:image/png;base64," + "A".repeat(1024 * 1024), is_text: false };
  await (await world.open()).addMoment(photo, "large-photo");
  const records = world.savedOperations();
  assert.equal(records.length, 1);
  assert.ok(records[0][1].length < 4096, 'Photo payload must stay out of localStorage progress');
  assert.equal(records[0][1].includes(photo.uri), false);
  world.remount();
  await (await world.open()).addMoment(photo, "large-photo");
  assert.equal(world.requests.filter(({ body }) => body.action === "guest_add").length, 1);
  assert.equal(world.uploads, 1);
  assert.equal(world.render().moments.length, 1);
});

test('discard invalidates a pending operation; late response cannot restore progress or affect the new operation', async () => {
  let release;
  const world = guestHarness({ holdWrite: new Promise(resolve => { release = resolve; }) });
  await world.open();
  const old = world.render().addMoment(moment, 'discarded');
  const rejected = assert.rejects(old, /草稿已放弃/);
  await new Promise(resolve => setImmediate(resolve));
  world.render().discardOperation('discarded');
  const renamed = { ...moment, guest_name: 'New Guest', guest_ini: 'N', guest_tone: 'forest' };
  const next = world.render().addMoment(renamed, 'new-operation');
  await new Promise(resolve => setImmediate(resolve));
  release(); await rejected; await next;
  assert.equal(world.render().moments.length, 1);
  assert.equal(world.render().moments[0].guest_name, 'New Guest');
  const oldRecord = world.savedOperations().find(([key]) => key.endsWith(':key:discarded'));
  assert.equal(JSON.parse(oldRecord[1]).result, undefined, 'Late result cannot restore confirmed retry progress');
});
