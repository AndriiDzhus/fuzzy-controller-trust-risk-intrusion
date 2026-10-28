# Changelog

## 1.4.0
- Security-level indicator on the ESP32 node (one WS2812B pixel): the joint
  assessment page drives its colour (green / yellow / red) with a two-window
  hysteresis; a checkbox in "Sensor readings" appears only when the node has
  the indicator. Without listening: lamp test, then dim blue standby.
- Firmware 1.2.1: `/led` endpoint (incl. standby), sensor cache, watchdog,
  `fw_version` in `/status` (shown in the sensor panel); joins the strongest
  access point of a mesh network, `bssid` / `channel` in `/status`.
- Chart restart button on "Scores over time".
- Response-policy thresholds: drag the markers under the security-level bar;
  the fields are in a collapsed "Response policy" section (current values and
  a "changed" mark in its header, reset to 50 / 25).
- "Find devices": a found node replaces the demo device in the selector.
- Joint assessment: a thin read-only bar with TI / SR / IP and the level is
  pinned at the top while the score cards are scrolled out of view.
- Sensor readings moved into the readouts column as a compact card.
- Chart tooltips close on scroll / tap outside on touch screens.
- New device command "Intense traffic": as many requests as DoS/DDoS, but at the
  largest concurrency the node serves without failures (ER ≈ 0).
- Real-device mapping: Rate = requests/s × 12 (TCP packets per HTTP request,
  measured with tcpdump on the test bed) instead of × 20; a reading is labelled
  with the mode it was measured in.
- Backend: `POST /api/devices/:id/indicate`; optional `rps` / `conc` override in
  `POST /api/devices/:id/command` (test-bed calibration).

## 1.3.0
- Device sensor panel: a collapsible "Sensor readings" section shows the node's
  live physical measurements (temperature, humidity, pressure in mmHg,
  illuminance when a BH1750 is added), auto-refreshed with a manual refresh
  button; "-" when a value is absent.
- Backend: GET /api/devices/:id/telemetry returns the node's /status.

## 1.2.0
- Network discovery: scan the local network for ESP32 nodes running the project
  firmware and pick one from the list (no hard-coded IP needed). Requires
  host network access.
- Add-on now uses host network so the gateway can reach and scan the LAN.

## 1.1.0
- Real-device mode: the gateway measures real HTTP traffic with an ESP32 node
  and maps it to the nine controller inputs (`/api/devices/...`).
- Add-on options: `device_host`, `device_name`, `device_id`.
- Joint assessment page: data-source switch (simulation / real device),
  read-only live readouts, trained parameters by default.

## 1.0.0
- Initial add-on: deploys the fuzzy-controller app on the gateway (ingress +
  port 3002); clones the app from GitHub at start-up.
