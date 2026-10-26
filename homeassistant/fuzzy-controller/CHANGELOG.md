# Changelog

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
