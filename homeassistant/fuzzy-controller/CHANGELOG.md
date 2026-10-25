# Changelog

## 1.1.0
- Real-device mode: the gateway measures real HTTP traffic with an ESP32 node
  and maps it to the nine controller inputs (`/api/devices/...`).
- Add-on options: `device_host`, `device_name`, `device_id`.
- Joint assessment page: data-source switch (simulation / real device),
  read-only live readouts, trained parameters by default.

## 1.0.0
- Initial add-on: deploys the fuzzy-controller app on the gateway (ingress +
  port 3002); clones the app from GitHub at start-up.
