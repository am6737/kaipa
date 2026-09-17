import assert from 'node:assert/strict';
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const departureDate = new Date(Date.parse(`${today}T00:00:00Z`) + 2 * 86400000).toISOString().slice(0, 10);
for (const query of [
  { origin: '阳朔', destination: '南宁东', viaStation: '桂林北', earliestHour: 18 },
  { origin: '南宁东', destination: '上海虹桥', viaStation: '长沙南', earliestHour: 0 },
]) {
  const response = await fetch('http://localhost:8787/query', { method: 'POST',
    body: JSON.stringify({ ...query, departureDate, adults: 2 }), signal: AbortSignal.timeout(60000) });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.status, 'results');
  for (const offer of result.offers) {
    const [a, b] = offer.segments, c = offer.connection;
    assert.equal(a.to, query.viaStation);
    assert.equal(a.from, query.origin);
    assert.equal(b.to, query.destination);
    assert.equal(c.waitMinutes, (Date.parse(b.departure) - Date.parse(a.arrival)) / 60000);
    assert.equal(c.guarantee, false);
    assert.equal(offer.totalPrice, undefined);
    if (c.usableForPlanning) {
      assert.equal(c.status, 'buffer_met');
      assert.ok(c.sameStation && !c.sameTrain && !c.overnightWait && c.waitMinutes >= 45);
    }
    if (c.overnightWait && !c.sameTrain && c.sameStation) {
      assert.equal(c.status, 'overnight_unverified');
      assert.equal(c.usableForPlanning, false);
    }
    if (a.trainId === b.trainId) {
      assert.equal(c.status, 'same_train_split');
      assert.equal(c.usableForPlanning, false);
    }
  }
  if (query.origin === '阳朔') assert.ok(result.offers.some(o => o.connection.status === 'same_train_split'));
  else assert.ok(result.offers.some(o => o.connection.status === 'buffer_met'));
  console.log(JSON.stringify({ passed: true, query, departureDate, retrievedAt: result.retrievedAt,
    candidates: result.offers.map(o => ({ trains: o.segments.map(s => s.trainNumber), wait: o.connection.waitMinutes, status: o.connection.status })) }));
}
