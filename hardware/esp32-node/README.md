# ESP32 test node

Firmware for the observed IoT device on the fuzzy-controller security test
bench (Variant A: the gateway measures real traffic to/from this node). The
node is an HTTP target and reports its own telemetry (Wi-Fi TX power, RSSI,
uptime) and sensor readings.

## Sensors (auto-detected on I2C at boot)

| Value | Sensor | I2C address | Power | Status |
|---|---|---|---|---|
| Temperature / humidity / pressure | BME280 | 0x76 or 0x77 | 5V (BME280-5V) | present |
| Energy: bus voltage / current / power (EC) | INA219 | 0x40 | 3V3 | add later |
| Illuminance (lux) | BH1750 | 0x23 or 0x5C | 3V3 | add later |

All three share the I2C bus: **SDA → GPIO21 (D21), SCL → GPIO22 (D22), GND → GND**.
Missing sensors are reported as `false` in `/status`; add them and reboot.

## Flash it

1. **Arduino IDE** (or PlatformIO). In Arduino IDE:
   - *File → Preferences → Additional boards manager URLs*:
     `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
   - *Tools → Board → Boards Manager* → install **esp32 by Espressif Systems**.
2. **USB driver** for the board's USB-UART chip: **CP2102** (Silicon Labs) or
   **CH340**. Install it if the serial port does not appear.
3. **Libraries** (*Tools → Manage Libraries*): *Adafruit BME280 Library*,
   *Adafruit Unified Sensor*, *Adafruit INA219*, *BH1750* (by Christopher Laws).
4. **Board**: *ESP32 Dev Module* (or *DOIT ESP32 DEVKIT V1*). **Port**: the COM
   port that appears when the board is plugged in via USB-C.
5. In `esp32-node.ino` set `WIFI_SSID` and `WIFI_PASS` (same network as the
   Raspberry Pi gateway).
6. **Upload** (→). If upload stalls at "Connecting…", hold **BOOT** on the board
   until it starts, then release.

## Verify

- Open *Tools → Serial Monitor* at **115200** baud. You should see the I2C scan,
  the detected BME280 (chip ID `0x60`), the Wi-Fi IP, and the HTTP server line.
- From a browser or the Pi: `http://<esp-ip>/status` → JSON with
  `temperature_c`, `humidity_pct`, `pressure_hpa`, `tx_power_dbm`, `rssi_dbm`,
  and `ina219`/`bh1750` = `false` until those sensors are added.
- `http://<esp-ip>/ping` → `pong`; `http://<esp-ip>/load?n=2000` → 2000 bytes.

The node must be on the **same Wi-Fi / subnet** as the gateway, and will send
its traffic to the gateway in the next step (collector + load generator).
