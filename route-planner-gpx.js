/*
 * GPX track parsing and display preparation for the standalone planner.
 *
 * GPX coordinates are WGS84.  This module deliberately does not apply a
 * BD-09/GCJ-02 conversion: applying a China-map conversion to a GPX file
 * would move every real sample.  Segment boundaries and source order are
 * retained so the renderer never invents a connector between gaps.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RoutePlannerGpx = factory();
  }
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  function localName(node) {
    return String(node && (node.localName || node.nodeName) || "")
      .split(":")
      .pop()
      .toLowerCase();
  }

  function childElements(node) {
    if (!node) return [];
    const children = node.children || node.childNodes || [];
    return Array.from(children).filter((child) => {
      // Browser Element.children already excludes text nodes.  The extra
      // check keeps the parser easy to exercise with a tiny offline fake DOM.
      return child && (child.nodeType === undefined || child.nodeType === 1);
    });
  }

  function directChild(node, name) {
    return childElements(node).find((child) => localName(child) === name);
  }

  function attribute(node, name, label) {
    const raw = node && typeof node.getAttribute === "function"
      ? node.getAttribute(name)
      : node && node.attributes && node.attributes[name];
    if (raw === null || raw === undefined || String(raw).trim() === "") {
      throw new Error(`${label} 缺少 ${name} 坐标`);
    }
    const text = String(raw).trim();
    const value = Number(text);
    if (!Number.isFinite(value)) throw new Error(`${label} 的 ${name} 不是数字`);
    if (name === "lat" && Math.abs(value) > 90) throw new Error(`${label} 的纬度超出范围`);
    if (name === "lon" && Math.abs(value) > 180) throw new Error(`${label} 的经度超出范围`);
    return { raw: text, value };
  }

  function childText(node, name) {
    const child = directChild(node, name);
    return child ? String(child.textContent || "") : null;
  }

  function parsePoint(node, kind, index) {
    const label = `${kind} 点 #${index + 1}`;
    const lat = attribute(node, "lat", label);
    const lon = attribute(node, "lon", label);
    const timeRaw = childText(node, "time");
    const elevationRaw = childText(node, "ele");
    return {
      lat: lat.value,
      lng: lon.value,
      rawLat: lat.raw,
      rawLon: lon.raw,
      timeRaw,
      elevationRaw,
    };
  }

  function parseSegment(node, kind, pointName) {
    const points = childElements(node)
      .filter((child) => localName(child) === pointName)
      .map((child, index) => parsePoint(child, kind, index));
    return points.length ? { kind, points } : null;
  }

  /**
   * Parse an already-created XML document.  Walking the tree is intentional:
   * querying all trkpt nodes and then all rtept nodes changes GPX document
   * order and joins unrelated track segments.
   */
  function parseDocument(document) {
    const root = document && (document.documentElement || document);
    if (!root) throw new Error("GPX XML 为空");
    const segments = [];

    function walk(node) {
      for (const child of childElements(node)) {
        const name = localName(child);
        if (name === "trkseg") {
          const segment = parseSegment(child, "track", "trkpt");
          if (segment) segments.push(segment);
          continue;
        }
        if (name === "rte") {
          const segment = parseSegment(child, "route", "rtept");
          if (segment) segments.push(segment);
          continue;
        }
        walk(child);
      }
    }
    walk(root);
    const pointCount = segments.reduce((sum, segment) => sum + segment.points.length, 0);
    if (pointCount < 2) throw new Error("文件中没有足够的有效路线点");
    return {
      coordinateSystem: "wgs84",
      segments,
      pointCount,
    };
  }

  function parseText(text) {
    if (typeof DOMParser !== "function") throw new Error("当前环境没有 XML 解析器");
    const document = new DOMParser().parseFromString(String(text), "application/xml");
    if (document.getElementsByTagName("parsererror").length) throw new Error("GPX XML 格式无效");
    return parseDocument(document);
  }

  /** Convert parsed source points to map data without changing coordinates or order. */
  function prepareDisplaySegments(segments) {
    return segments.map((segment) => ({
      kind: segment.kind,
      points: segment.points.map((point) => ({
        lat: point.lat,
        lng: point.lng,
        rawLat: point.rawLat,
        rawLon: point.rawLon,
        timeRaw: point.timeRaw,
        elevationRaw: point.elevationRaw,
      })),
    }));
  }

  function xmlEscape(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function pointXml(point, tagName) {
    const tag = tagName || "trkpt";
    const lat = point.rawLat ?? Number(point.lat).toFixed(8);
    const lon = point.rawLon ?? Number(point.lng).toFixed(8);
    const children = [];
    if (point.elevationRaw !== null && point.elevationRaw !== undefined) {
      children.push(`<ele>${xmlEscape(point.elevationRaw)}</ele>`);
    }
    if (point.timeRaw !== null && point.timeRaw !== undefined) {
      children.push(`<time>${xmlEscape(point.timeRaw)}</time>`);
    }
    return children.length
      ? `<${tag} lat="${xmlEscape(lat)}" lon="${xmlEscape(lon)}">${children.join("")}</${tag}>`
      : `<${tag} lat="${xmlEscape(lat)}" lon="${xmlEscape(lon)}"></${tag}>`;
  }

  /** Serialize each segment independently; no segment-spanning polyline is created. */
  function serializeSegments(segments) {
    const bodies = segments.map((segment) => {
      const tagName = segment.kind === "route" ? "rtept" : "trkpt";
      const points = segment.points.map((point) => pointXml(point, tagName)).join("\n      ");
      if (segment.kind === "route") {
        return `  <rte>\n    ${points}\n  </rte>`;
      }
      // Track segments are emitted independently.  The point serializer is
      // used below so time/elevation and exact source coordinates survive.
      return `  <trk><trkseg>\n      ${points}\n    </trkseg></trk>`;
    });
    return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="路线规划器" xmlns="http://www.topografix.com/GPX/1/1">\n${bodies.join("\n")}\n</gpx>\n`;
  }

  return { parseDocument, parseText, prepareDisplaySegments, serializeSegments };
});
