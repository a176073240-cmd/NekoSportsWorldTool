const assert = require("node:assert/strict");
const {
  parseDocument,
  prepareDisplaySegments,
  serializeSegments,
} = require("./route-planner-gpx.js");

function element(name, attributes = {}, children = [], textContent = "") {
  return {
    localName: name,
    attributes,
    children,
    textContent,
    getAttribute(attributeName) {
      return Object.prototype.hasOwnProperty.call(attributes, attributeName)
        ? attributes[attributeName]
        : null;
    },
  };
}

function point(name, lat, lon, time, ele) {
  const children = [];
  if (ele !== undefined) children.push(element("ele", {}, [], ele));
  if (time !== undefined) children.push(element("time", {}, [], time));
  return element(name, { lat, lon }, children);
}

function fixtureDocument() {
  const firstSegment = element("trkseg", {}, [
    point("trkpt", "39.900000123", "116.400000987", "2026-09-25T01:02:03Z", "12.5"),
    point("trkpt", "39.900100123", "116.400100987", "2026-09-25T01:02:08Z", "12.6"),
  ]);
  const route = element("rte", {}, [
    point("rtept", "39.901000123", "116.401000987", "2026-09-25T01:03:03Z"),
    point("rtept", "39.901100123", "116.401100987", "2026-09-25T01:03:08Z"),
  ]);
  const secondSegment = element("trkseg", {}, [
    point("trkpt", "39.902000123", "116.402000987", "2026-09-25T01:04:03Z"),
    point("trkpt", "39.902100123", "116.402100987", "2026-09-25T01:04:08Z"),
  ]);
  return {
    documentElement: element("gpx", {}, [
      element("trk", {}, [firstSegment]),
      route,
      element("trk", {}, [secondSegment]),
    ]),
  };
}

const parsed = parseDocument(fixtureDocument());
assert.equal(parsed.coordinateSystem, "wgs84");
assert.deepEqual(parsed.segments.map((segment) => segment.kind), ["track", "route", "track"]);
assert.deepEqual(
  parsed.segments.flatMap((segment) => segment.points.map((item) => item.rawLat)),
  ["39.900000123", "39.900100123", "39.901000123", "39.901100123", "39.902000123", "39.902100123"],
);
assert.equal(parsed.segments[0].points[0].timeRaw, "2026-09-25T01:02:03Z");
assert.deepEqual(
  parsed.segments.flatMap((segment) => segment.points.map((item) => item.timeRaw)),
  [
    "2026-09-25T01:02:03Z",
    "2026-09-25T01:02:08Z",
    "2026-09-25T01:03:03Z",
    "2026-09-25T01:03:08Z",
    "2026-09-25T01:04:03Z",
    "2026-09-25T01:04:08Z",
  ],
);

// Display preparation is a lossless WGS84 pass-through: no GCJ/BD offset,
// sorting, smoothing, or connector point is introduced.
const display = prepareDisplaySegments(parsed.segments);
assert.deepEqual(
  display.flatMap((segment) => segment.points.map((item) => [item.lat, item.lng])),
  parsed.segments.flatMap((segment) => segment.points.map((item) => [item.lat, item.lng])),
);
assert.equal(display[0].points.length, 2);
assert.equal(display[1].points.length, 2);
assert.equal(display[2].points.length, 2);

const roundTrip = serializeSegments(parsed.segments);
assert.equal((roundTrip.match(/<trkpt\b/g) || []).length, 4);
assert.equal((roundTrip.match(/<rtept\b/g) || []).length, 2);
assert.match(roundTrip, /lat="39\.900000123" lon="116\.400000987"/);
assert.match(roundTrip, /<time>2026-09-25T01:04:08Z<\/time>/);
assert.match(roundTrip, /<ele>12\.5<\/ele>/);
assert.ok(roundTrip.indexOf("<trk><trkseg>") < roundTrip.indexOf("<rte>"));
assert.ok(roundTrip.indexOf("<rte>") < roundTrip.lastIndexOf("<trk><trkseg>"));
assert.ok(roundTrip.indexOf("2026-09-25T01:02:03Z") < roundTrip.indexOf("2026-09-25T01:02:08Z"));
assert.ok(roundTrip.indexOf("2026-09-25T01:03:08Z") < roundTrip.indexOf("2026-09-25T01:04:03Z"));

assert.throws(
  () => parseDocument({ documentElement: element("gpx", {}, [element("trkseg", {}, [point("trkpt", "39.9", null)])]) }),
  /缺少 lon 坐标/,
);
assert.throws(
  () => parseDocument({ documentElement: element("gpx", {}, [element("trkseg", {}, [point("trkpt", "", "116.4"), point("trkpt", "39.9", "116.4")])]) }),
  /缺少 lat 坐标/,
);
assert.throws(
  () => parseDocument({ documentElement: element("gpx", {}, [element("trkseg", {}, [point("trkpt", "91", "116.4"), point("trkpt", "39.9", "116.4")])]) }),
  /纬度超出范围/,
);
const equator = parseDocument({
  documentElement: element("gpx", {}, [element("trkseg", {}, [
    point("trkpt", "0", "0"),
    point("trkpt", "0.0001", "0.0001"),
  ])]),
});
assert.deepEqual(equator.segments[0].points.map((item) => [item.lat, item.lng]), [[0, 0], [0.0001, 0.0001]]);

console.log("route-planner-gpx tests passed");
