# Route planner

Open [`route-planner.html`](route-planner.html) in a modern browser to plan or inspect a route on an OpenStreetMap map. Click to add ordered waypoints, undo or clear points, import a GPX track/route, and export the displayed segments as GPX.

The page is a standalone planning utility. It does not connect to the app's account, activity generation, or submission flows. Map tiles and place-name lookup are provided by OpenStreetMap services and require an internet connection; follow their [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) and [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/).

GPX coordinates are treated as WGS84 and are passed to Leaflet without a BD-09/GCJ-02 conversion. The importer keeps track segments and route points in their document order, preserves source coordinate text, elevation, and time when exporting, rejects missing or out-of-range coordinates, and draws each segment separately. It does not connect separate segments, map-match, smooth, or move samples. A GPX file produced by a provider that uses another datum without declaring it cannot be verified here.

This is a standalone preview/planning utility. It is not the activity-detail map in the main application and does not upload a route or establish that a platform accepts it. The offline regression check is `node route-planner-gpx.test.cjs`.
